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
