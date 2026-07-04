import threading
import urllib.request
import urllib.error
import json
from flask import current_app
from models.models import User, Notification, db
import urllib.parse


def _send_email_brevo(api_key, mail_from, to_emails, subject, html_body):
    """Runs in background thread — sends via Brevo HTTPS API."""
    print(f"[EMAIL] Sending via Brevo to: {to_emails}")
    try:
        payload = {
            "sender": {"name": "Project Tracker", "email": mail_from},
            "to": [{"email": e} for e in to_emails],
            "subject": subject,
            "htmlContent": html_body
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=data,
            headers={
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            result = json.loads(resp.read().decode())
            print(f"[EMAIL] ✅ Sent successfully — messageId: {result.get('messageId')}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[EMAIL] ❌ Brevo HTTP error {e.code}: {body}")
    except Exception as e:
        print(f"[EMAIL] ❌ Failed — {type(e).__name__}: {e}")


def send_email(to_emails, subject, html_body, attachments=None):
    cfg = current_app.config
    api_key  = cfg.get("BREVO_API_KEY")
    mail_from = cfg.get("MAIL_FROM") or cfg.get("MAIL_USERNAME")

    if not api_key:
        print("[EMAIL] Skipping — BREVO_API_KEY not configured")
        return False
    if not to_emails:
        print("[EMAIL] Skipping — no recipients")
        return False

    t = threading.Thread(
        target=_send_email_brevo,
        args=(api_key, mail_from, to_emails, subject, html_body),
        daemon=True
    )
    t.start()
    print(f"[EMAIL] Background thread started for {len(to_emails)} recipient(s)")
    return True


def get_emails_by_roles(roles):
    users = User.query.filter(
        User.role.in_(roles), User.is_active == True
    ).all()
    return [u.email for u in users if u.email]


def get_whatsapp_numbers_by_roles(roles):
    users = User.query.filter(
        User.role.in_(roles), User.is_active == True
    ).all()
    return [(u.name, u.phone_whatsapp) for u in users if u.phone_whatsapp]


def build_whatsapp_link(phone, message, is_mobile=False):
    encoded = urllib.parse.quote(message)
    phone_clean = phone.replace("+", "").replace(" ", "").replace("-", "")
    if is_mobile:
        return f"https://wa.me/{phone_clean}?text={encoded}"
    return f"https://web.whatsapp.com/send?phone={phone_clean}&text={encoded}"


def save_notification(project_id, user_ids, event_type, message, ref_id=None, ref_type=None):
    for uid in user_ids:
        n = Notification(
            project_id=project_id, user_id=uid,
            event_type=event_type, message=message,
            ref_id=ref_id, ref_type=ref_type
        )
        db.session.add(n)
    db.session.commit()



# -- Batch email buffer -------------------------------------------------------
_batch_lock      = threading.Lock()
_grn_buffer      = {}
_dispatch_buffer = {}
BATCH_DELAY      = 300  # seconds to wait before firing compiled email


def _fire_grn_batch(pid, app):
    with _batch_lock:
        batch = _grn_buffer.pop(pid, None)
    if not batch or not batch["items"]:
        return
    with app.app_context():
        try:
            _send_compiled_grn_email(batch["items"], batch["project"])
        except Exception as e:
            print(f"[BATCH GRN] Email error: {e}")


def _fire_dispatch_batch(pid, app):
    with _batch_lock:
        batch = _dispatch_buffer.pop(pid, None)
    if not batch or not batch["items"]:
        return
    with app.app_context():
        try:
            _send_compiled_dispatch_email(batch["items"], batch["project"])
        except Exception as e:
            print(f"[BATCH DISPATCH] Email error: {e}")


def batch_grn_created(grn, project):
    """Buffer a GRN; fire one compiled email after 45s of inactivity."""
    app = current_app._get_current_object()
    pid = project.id
    boq = grn.boq_item
    item_data = {
        "grn_number":   grn.grn_number,
        "grn_date":     str(grn.grn_date),
        "sr_no":        boq.sr_no if boq else "",
        "description":  boq.description[:100] if boq else "",
        "unit":         boq.unit if boq else "",
        "qty_received": float(grn.qty_received),
        "vendor_name":  grn.vendor_name or "",
        "challan_no":   grn.challan_no or "",
    }
    with _batch_lock:
        if pid not in _grn_buffer:
            _grn_buffer[pid] = {"items": [], "project": project, "timer": None}
        elif _grn_buffer[pid]["timer"]:
            _grn_buffer[pid]["timer"].cancel()
        _grn_buffer[pid]["items"].append(item_data)
        t = threading.Timer(BATCH_DELAY, _fire_grn_batch, args=[pid, app])
        t.daemon = True
        t.start()
        _grn_buffer[pid]["timer"] = t
    n = len(_grn_buffer[pid]["items"])
    print(f"[BATCH GRN] {grn.grn_number} buffered ({n} items), timer reset to {BATCH_DELAY}s")
    users = User.query.filter(User.is_active == True).all()
    save_notification(project.id, [u.id for u in users if u.notify_grn],
                      "grn_created", f"GRN {grn.grn_number} created for {item_data['sr_no']}",
                      ref_id=grn.id, ref_type="grn")


def batch_dispatch_created(dn, project):
    """Buffer a Dispatch; fire one compiled email after 45s of inactivity."""
    app = current_app._get_current_object()
    pid = project.id
    boq  = dn.boq_item
    rate = float(boq.rate) if boq else 0
    item_data = {
        "dn_number":       dn.dn_number,
        "dispatch_date":   str(dn.dispatch_date),
        "sr_no":           boq.sr_no if boq else "",
        "description":     boq.description[:100] if boq else "",
        "unit":            boq.unit if boq else "",
        "qty_dispatched":  float(dn.qty_dispatched),
        "site_destination":dn.site_destination or "",
        "vehicle_no":      dn.vehicle_no or "",
        "amount":          rate * float(dn.qty_dispatched),
    }
    with _batch_lock:
        if pid not in _dispatch_buffer:
            _dispatch_buffer[pid] = {"items": [], "project": project, "timer": None}
        elif _dispatch_buffer[pid]["timer"]:
            _dispatch_buffer[pid]["timer"].cancel()
        _dispatch_buffer[pid]["items"].append(item_data)
        t = threading.Timer(BATCH_DELAY, _fire_dispatch_batch, args=[pid, app])
        t.daemon = True
        t.start()
        _dispatch_buffer[pid]["timer"] = t
    n = len(_dispatch_buffer[pid]["items"])
    print(f"[BATCH DISPATCH] {dn.dn_number} buffered ({n} items), timer reset to {BATCH_DELAY}s")
    users = User.query.filter(User.is_active == True).all()
    save_notification(project.id, [u.id for u in users if u.notify_dispatch],
                      "dispatch_created", f"Dispatch {dn.dn_number} created for {item_data['sr_no']}",
                      ref_id=dn.id, ref_type="dispatch")


def _send_compiled_grn_email(items, project):
    users = User.query.filter(User.is_active == True).all()
    to_emails = [u.email for u in users if u.notify_grn and u.email]
    if not to_emails:
        return
    count = len(items)
    rows = "".join([
        "<tr>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['grn_number']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['sr_no']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['description'][:80]}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>{i['qty_received']} {i['unit']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['vendor_name']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['challan_no']}</td>"
        "</tr>"
        for i in items
    ])
    subject = f"[{project.code}] Material Inward - {count} GRN(s) created"
    html = (
        f"<h3 style='color:#0F6E56'>Material Inward Summary - {project.name}</h3>"
        f"<p><b>{count} GRN(s)</b> created on {items[0]['grn_date']}</p>"
        "<table style='border-collapse:collapse;width:100%;font-size:13px'>"
        "<thead><tr style='background:#E1F5EE'>"
        "<th style='padding:8px 10px;text-align:left'>GRN No.</th>"
        "<th style='padding:8px 10px;text-align:left'>Item No.</th>"
        "<th style='padding:8px 10px;text-align:left'>Description</th>"
        "<th style='padding:8px 10px;text-align:right'>Qty Received</th>"
        "<th style='padding:8px 10px;text-align:left'>Vendor</th>"
        "<th style='padding:8px 10px;text-align:left'>Challan</th>"
        f"</tr></thead><tbody>{rows}</tbody></table>"
        "<hr><p style='color:#888;font-size:12px'>Project Tracker - Group Nish</p>"
    )
    send_email(to_emails, subject, html)


def _send_compiled_dispatch_email(items, project):
    users = User.query.filter(User.is_active == True).all()
    to_emails = [u.email for u in users if u.notify_dispatch and u.email]
    if not to_emails:
        return
    count = len(items)
    total_amt = sum(i["amount"] for i in items)
    rows = "".join([
        "<tr>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['dn_number']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['sr_no']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['description'][:80]}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>{i['qty_dispatched']} {i['unit']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['site_destination']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>{i['vehicle_no']}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>Rs.{i['amount']:,.2f}</td>"
        "</tr>"
        for i in items
    ])
    subject = f"[{project.code}] Material Outward - {count} Dispatch(es) created"
    html = (
        f"<h3 style='color:#0F6E56'>Material Outward Summary - {project.name}</h3>"
        f"<p><b>{count} Dispatch Note(s)</b> created on {items[0]['dispatch_date']}</p>"
        "<table style='border-collapse:collapse;width:100%;font-size:13px'>"
        "<thead><tr style='background:#E1F5EE'>"
        "<th style='padding:8px 10px;text-align:left'>DN No.</th>"
        "<th style='padding:8px 10px;text-align:left'>Item No.</th>"
        "<th style='padding:8px 10px;text-align:left'>Description</th>"
        "<th style='padding:8px 10px;text-align:right'>Qty</th>"
        "<th style='padding:8px 10px;text-align:left'>Site</th>"
        "<th style='padding:8px 10px;text-align:left'>Vehicle</th>"
        "<th style='padding:8px 10px;text-align:right'>Amount</th>"
        f"</tr></thead><tbody>{rows}</tbody></table>"
        f"<p><b>Total dispatched value (excl. GST): Rs.{total_amt:,.2f}</b></p>"
        "<hr><p style='color:#888;font-size:12px'>Project Tracker - Group Nish</p>"
    )
    send_email(to_emails, subject, html)



# ── Event-specific helpers ────────────────────────────────────────────────────

def notify_grn_created(grn, project):
    try:
        from models.models import BOQItem
        boq = BOQItem.query.get(grn.boq_item_id)
        sr_no = boq.sr_no if boq else "—"
        desc  = boq.description[:120] if boq else "—"
        unit  = boq.unit if boq else ""

        users = User.query.filter(User.is_active == True).all()
        to_emails = [u.email for u in users if u.notify_grn and u.email]

        subject = f"[{project.code}] GRN {grn.grn_number} created — {sr_no}"
        html = f"""
        <h3>Material Inward — GRN Created</h3>
        <p><b>Project:</b> {project.name}</p>
        <p><b>GRN No:</b> {grn.grn_number}</p>
        <p><b>Date:</b> {grn.grn_date}</p>
        <p><b>BOQ Item:</b> {sr_no} — {desc}</p>
        <p><b>Qty Received:</b> {grn.qty_received} {unit}</p>
        <p><b>Vendor:</b> {grn.vendor_name}</p>
        <p><b>Challan No:</b> {grn.challan_no}</p>
        <hr><p style="color:#888;font-size:12px">Project Tracker — Group Nish</p>
        """
        if to_emails:
            send_email(to_emails, subject, html)

        user_ids = [u.id for u in users if u.notify_grn]
        save_notification(project.id, user_ids, "grn_created",
                          f"GRN {grn.grn_number} created for {sr_no}",
                          ref_id=grn.id, ref_type="grn")
    except Exception as e:
        current_app.logger.error(f"notify_grn_created error: {e}")


def notify_dispatch_created(dn, project):
    try:
        from models.models import BOQItem
        boq = BOQItem.query.get(dn.boq_item_id)
        sr_no = boq.sr_no if boq else "—"
        desc  = boq.description[:120] if boq else "—"
        unit  = boq.unit if boq else ""
        rate  = float(boq.rate) if boq else 0
        amt   = rate * float(dn.qty_dispatched)

        users = User.query.filter(User.is_active == True).all()
        to_emails = [u.email for u in users if u.notify_dispatch and u.email]

        subject = f"[{project.code}] Dispatch {dn.dn_number} — {sr_no} to {dn.site_destination}"
        html = f"""
        <h3>Material Outward — Dispatch Note Created</h3>
        <p><b>Project:</b> {project.name}</p>
        <p><b>DN No:</b> {dn.dn_number}</p>
        <p><b>Date:</b> {dn.dispatch_date}</p>
        <p><b>BOQ Item:</b> {sr_no} — {desc}</p>
        <p><b>Qty Dispatched:</b> {dn.qty_dispatched} {unit}</p>
        <p><b>Site Destination:</b> {dn.site_destination}</p>
        <p><b>Vehicle No:</b> {dn.vehicle_no}</p>
        <p><b>Driver:</b> {dn.driver_name}</p>
        <p><b>Amount (excl. GST):</b> ₹{amt:,.2f}</p>
        <hr><p style="color:#888;font-size:12px">Project Tracker — Group Nish</p>
        """
        if to_emails:
            send_email(to_emails, subject, html)

        user_ids = [u.id for u in users if u.notify_dispatch]
        save_notification(project.id, user_ids, "dispatch_created",
                          f"Dispatch {dn.dn_number} created for {sr_no}",
                          ref_id=dn.id, ref_type="dispatch")
    except Exception as e:
        current_app.logger.error(f"notify_dispatch_created error: {e}")


def notify_progress_updated(project, updated_by_name, items_count):
    users = User.query.filter(User.is_active == True).all()
    to_emails = [u.email for u in users if u.notify_progress and u.email]

    subject = f"[{project.code}] Site progress updated — {items_count} item(s)"
    html = f"""
    <h3>Site Progress Updated</h3>
    <p><b>Project:</b> {project.name}</p>
    <p><b>Updated by:</b> {updated_by_name}</p>
    <p><b>Items updated:</b> {items_count}</p>
    <p>Please review site progress and prepare RA bill if milestone is reached.</p>
    <hr><p style="color:#888;font-size:12px">Project Tracker — Group Nish</p>
    """
    if to_emails:
        send_email(to_emails, subject, html)

    user_ids = [u.id for u in users if u.notify_progress]
    save_notification(project.id, user_ids, "progress_updated",
                      f"Site progress updated for {project.code} — {items_count} items",
                      ref_type="progress")


def notify_ra_generated(ra, project, pdf_path=None):
    users = User.query.filter(User.is_active == True).all()
    to_emails = [u.email for u in users if u.notify_ra and u.email]

    subject = f"[{project.code}] RA Bill #{ra.ra_number} — {ra.invoice_no} — ₹{float(ra.net_payable):,.0f}"
    html = f"""
    <h3>RA Bill Generated</h3>
    <p><b>Project:</b> {project.name}</p>
    <p><b>Client:</b> {project.client_name}</p>
    <p><b>RA Bill No:</b> {ra.ra_number}</p>
    <p><b>Invoice No:</b> {ra.invoice_no}</p>
    <p><b>Invoice Date:</b> {ra.invoice_date}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px">
      <tr><td><b>Supply value (this bill)</b></td><td>₹{float(ra.supply_value_this):,.2f}</td></tr>
      <tr><td><b>E&C value (this bill)</b></td><td>₹{float(ra.ec_value_this):,.2f}</td></tr>
      <tr><td><b>Taxable value</b></td><td>₹{float(ra.taxable_value):,.2f}</td></tr>
      <tr><td><b>IGST 18%</b></td><td>₹{float(ra.igst_amount):,.2f}</td></tr>
      <tr><td><b>Gross total</b></td><td>₹{float(ra.gross_total):,.2f}</td></tr>
      <tr><td><b>Advance recovery</b></td><td>₹{float(ra.advance_recovery):,.2f}</td></tr>
      <tr style="background:#e8f5ee"><td><b>Net payable</b></td><td><b>₹{float(ra.net_payable):,.2f}</b></td></tr>
    </table>
    <hr><p style="color:#888;font-size:12px">Project Tracker — Group Nish</p>
    """
    attachments = [(pdf_path, f"RA_{ra.ra_number}_{ra.invoice_no}.pdf")] if pdf_path else None
    if to_emails:
        send_email(to_emails, subject, html, attachments=attachments)

    user_ids = [u.id for u in users if u.notify_ra]
    save_notification(project.id, user_ids, "ra_generated",
                      f"RA Bill #{ra.ra_number} generated — ₹{float(ra.net_payable):,.0f}",
                      ref_id=ra.id, ref_type="ra_bill")


def notify_material_accepted(progress_entry, project, site_user_name):
    users = User.query.filter(User.is_active == True).all()
    to_emails = [u.email for u in users if u.notify_dispatch and u.email
                 and u.role in ["scm", "accounts", "management"]]

    subject = f"[{project.code}] Material accepted at site — {progress_entry.boq_item.sr_no}"
    html = f"""
    <h3>Material Accepted at Site</h3>
    <p><b>Project:</b> {project.name}</p>
    <p><b>BOQ Item:</b> {progress_entry.boq_item.sr_no} — {progress_entry.boq_item.description[:120]}</p>
    <p><b>Qty installed this entry:</b> {progress_entry.qty_installed} {progress_entry.boq_item.unit}</p>
    <p><b>Site engineer:</b> {site_user_name}</p>
    <p><b>Date:</b> {progress_entry.progress_date}</p>
    <hr><p style="color:#888;font-size:12px">Project Tracker — Group Nish</p>
    """
    if to_emails:
        send_email(to_emails, subject, html)


def notify_invoice_marked(dn, project, accounts_user_name):
    users = User.query.filter(User.is_active == True).all()
    to_emails = [u.email for u in users if u.email
                 and u.role in ["scm", "management"]]

    subject = f"[{project.code}] Supply invoice raised — {dn.dn_number}"
    html = f"""
    <h3>Supply Invoice Raised</h3>
    <p><b>Project:</b> {project.name}</p>
    <p><b>Dispatch note:</b> {dn.dn_number}</p>
    <p><b>BOQ item:</b> {dn.boq_item.sr_no} — {dn.boq_item.description[:120]}</p>
    <p><b>Qty:</b> {dn.qty_dispatched} {dn.boq_item.unit}</p>
    <p><b>Amount (excl. GST):</b> ₹{float(dn.boq_item.rate * dn.qty_dispatched):,.2f}</p>
    <p><b>Marked by:</b> {accounts_user_name}</p>
    <hr><p style="color:#888;font-size:12px">Project Tracker — Group Nish</p>
    """
    if to_emails:
        send_email(to_emails, subject, html)


def notify_ra_status_changed(ra, project, new_status, changed_by_name):
    users = User.query.filter(User.is_active == True).all()
    to_emails = [u.email for u in users if u.notify_ra and u.email]

    status_labels = {
        'submitted': 'RA Bill Submitted for Approval',
        'approved':  'RA Bill Approved',
        'paid':      'RA Bill Payment Received',
    }
    subject = f"[{project.code}] {status_labels.get(new_status, 'RA Bill Updated')} — RA #{ra.ra_number}"
    html = f"""
    <h3>{status_labels.get(new_status, 'RA Bill Status Changed')}</h3>
    <p><b>Project:</b> {project.name}</p>
    <p><b>RA Bill No:</b> {ra.ra_number}</p>
    <p><b>Invoice No:</b> {ra.invoice_no}</p>
    <p><b>Net payable:</b> ₹{float(ra.net_payable):,.2f}</p>
    <p><b>New status:</b> {new_status.upper()}</p>
    <p><b>Updated by:</b> {changed_by_name}</p>
    <hr><p style="color:#888;font-size:12px">Project Tracker — Group Nish</p>
    """
    if to_emails:
        send_email(to_emails, subject, html)
