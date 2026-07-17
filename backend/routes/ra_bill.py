"""
Updated RA compute logic — separates previous vs current period entries.
The "current" entries are those added AFTER the last RA bill was saved.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.models import (Project, BOQItem, User, RABill, RABillLine,
                            SiteProgress, DispatchNote, ReconciliationItem, AdvanceReceipt,
                            POInvoice, POInvoiceItem, db)
from services.notifications import notify_ra_generated
from services.export import (generate_ra_excel, generate_ra_pdf,
                             generate_tax_invoice_pdf, generate_tax_invoice_excel,
                             generate_reconciliation_excel)
from datetime import date, datetime
from decimal import Decimal

ra_bp = Blueprint("ra", __name__)

def current_user():
    return User.query.get(int(get_jwt_identity()))

def admin_required():
    u = current_user()
    if not u or u.role != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


@ra_bp.route("/<int:pid>", methods=["GET"])
@jwt_required()
def list_ra(pid):
    bills = RABill.query.filter_by(project_id=pid).order_by(RABill.ra_number.desc()).all()
    return jsonify([b.to_dict() for b in bills])


@ra_bp.route("/<int:pid>/compute", methods=["POST"])
@jwt_required()
def compute_ra(pid):
    project = Project.query.get_or_404(pid)
    data = request.get_json()
    invoice_date = date.fromisoformat(data.get("invoice_date", date.today().isoformat()))

    # Get last saved RA bill
    prev_ra = RABill.query.filter_by(project_id=pid)\
                          .order_by(RABill.ra_number.desc()).first()
    prev_ra_date = prev_ra.created_at if prev_ra else None

    boq_items = BOQItem.query.filter_by(project_id=pid, is_active=True)\
                              .order_by(BOQItem.sort_order).all()

    # Advance gate — recovery only activates once Accounts has recorded the
    # one-time actual Advance Received entry. Kept purely as a record/audit
    # trail (not a capped pool) — recovery itself is derived per item below.
    advance_receipt = AdvanceReceipt.query.filter_by(project_id=pid).first()
    advance_gate_active = advance_receipt is not None

    # Advance-to-Supply ratio, derived live from the project's CURRENT Payment
    # Terms percentages. Applied to EVERY Supply item's existing rate — works
    # regardless of how/when that item was created (Add Split Item, manual
    # entry, or Excel import), and stays correct even if % is edited later.
    # (item.rate represents the Supply% portion of that item's total value,
    # so rate * (advance_pct / supply_pct) recovers the equivalent Advance
    # portion at the same per-unit scale.)
    supply_pct_proj  = Decimal(str(project.pt_lc_pct or 0))
    advance_pct_proj = Decimal(str(project.pt_advance_pct or 0))
    advance_to_supply_ratio = (advance_pct_proj / supply_pct_proj) if supply_pct_proj > 0 else Decimal("0")

    lines = []
    # 3 separate stage buckets — Supply / Installation / Commissioning
    supply_prev = Decimal("0"); supply_this = Decimal("0")
    installation_prev = Decimal("0"); installation_this = Decimal("0")
    commissioning_prev = Decimal("0"); commissioning_this = Decimal("0")
    adv_rec = Decimal("0")  # total advance recovery for this bill, summed per item below

    for item in boq_items:
        rate = Decimal(str(item.rate))
        po_qty = Decimal(str(item.po_qty))
        # Prefer a per-item stored advance_rate if explicitly set (e.g. a
        # future manual override); otherwise derive it live from this item's
        # own Supply rate using the project's current Advance/Supply ratio.
        stored_advance_rate = Decimal(str(item.advance_rate or 0))
        item_advance_rate = stored_advance_rate if stored_advance_rate > 0 else (rate * advance_to_supply_ratio).quantize(Decimal("0.01"))

        if item.item_type == "supply":
            # Supply billing is driven by DISPATCHED quantity, not site progress
            all_dispatch = DispatchNote.query.filter_by(
                project_id=pid, boq_item_id=item.id
            ).all()
            if prev_ra_date:
                prev_dispatch = [d for d in all_dispatch if d.created_at <= prev_ra_date]
                curr_dispatch = [d for d in all_dispatch if d.created_at > prev_ra_date]
            else:
                prev_dispatch = []
                curr_dispatch = all_dispatch

            qty_prev_total = sum(Decimal(str(d.qty_dispatched)) for d in prev_dispatch)
            qty_curr       = sum(Decimal(str(d.qty_dispatched)) for d in curr_dispatch)
            qty_upto       = qty_prev_total + qty_curr
            qty_balance    = max(po_qty - qty_upto, Decimal("0"))

        elif item.item_type == "erection":
            all_entries = SiteProgress.query.filter_by(
                project_id=pid, boq_item_id=item.id
            ).all()
            if prev_ra_date:
                prev_entries = [e for e in all_entries if e.updated_at <= prev_ra_date]
                curr_entries = [e for e in all_entries if e.updated_at > prev_ra_date]
            else:
                prev_entries = []
                curr_entries = all_entries

            qty_prev_total = sum(Decimal(str(e.qty_installed)) for e in prev_entries)
            qty_curr       = sum(Decimal(str(e.qty_installed)) for e in curr_entries)
            qty_upto       = qty_prev_total + qty_curr
            qty_balance    = max(po_qty - qty_upto, Decimal("0"))

        else:  # commissioning
            all_entries = SiteProgress.query.filter_by(
                project_id=pid, boq_item_id=item.id
            ).all()
            if prev_ra_date:
                prev_entries = [e for e in all_entries if e.updated_at <= prev_ra_date]
                curr_entries = [e for e in all_entries if e.updated_at > prev_ra_date]
            else:
                prev_entries = []
                curr_entries = all_entries

            qty_prev_total = sum(Decimal(str(e.qty_commissioned)) for e in prev_entries)
            qty_curr       = sum(Decimal(str(e.qty_commissioned)) for e in curr_entries)
            qty_upto       = qty_prev_total + qty_curr
            qty_balance    = max(po_qty - qty_upto, Decimal("0"))

        # ── Advance / Supply stage split (Supply items only) ─────────────
        # Once the advance gate is active and this item has an advance_rate
        # (set at "Add Split Item" creation time, or derived live above),
        # THIS BILL's Advance portion is tracked as its OWN stage (own rate,
        # own amount) rather than folded into the Supply amount — this is
        # what lets the RA Bill document show "Advance" and "Supply" as
        # separate sub-rows under the item, per Payment Terms. The Advance
        # amount is billed for whatever qty is newly dispatched this period,
        # and that same amount is immediately recovered as a deduction on
        # this bill. Previously-billed ("prev") amounts are NOT retroactively
        # changed — the adjustment only applies to what's being invoiced
        # right now, matching how the invoice is actually raised, and matches
        # the existing non-retroactive recovery rule.
        advance_applicable = (item.item_type == "supply" and advance_gate_active
                               and item_advance_rate > 0)

        # Supply-only amounts — pure rate, never includes Advance
        amt_prev_supply    = qty_prev_total * rate
        amt_this_supply    = qty_curr * rate
        amt_upto_supply    = amt_prev_supply + amt_this_supply
        amt_balance_supply = qty_balance * rate

        # Advance-only amounts — 0 unless this item is under the active gate
        item_adv_rate_used = item_advance_rate if advance_applicable else Decimal("0")
        amt_this_adv    = (qty_curr * item_adv_rate_used).quantize(Decimal("0.01")) if advance_applicable else Decimal("0")
        amt_prev_adv     = Decimal("0")  # non-retroactive — prev never carries Advance
        amt_upto_adv     = amt_prev_adv + amt_this_adv
        amt_balance_adv  = (qty_balance * item_adv_rate_used).quantize(Decimal("0.01")) if advance_applicable else Decimal("0")

        item_adv_recovery = amt_this_adv

        # TOTAL amounts (backward compatible — what any existing consumer of
        # amount_prev/this/upto/balance expects: Supply + Advance combined)
        amt_prev    = amt_prev_supply + amt_prev_adv
        amt_this    = amt_this_supply + amt_this_adv
        amt_upto    = amt_upto_supply + amt_upto_adv
        amt_balance = amt_balance_supply  # Advance never reduces "Bal Amt", matches prior behaviour

        if item.item_type == "supply":
            supply_prev += amt_prev; supply_this += amt_this
            adv_rec += item_adv_recovery
        elif item.item_type == "erection":
            installation_prev += amt_prev; installation_this += amt_this
        else:
            commissioning_prev += amt_prev; commissioning_this += amt_this

        lines.append({
            "boq_item_id":   item.id,
            "sr_no":         item.sr_no,
            "description":   item.description,
            "unit":          item.unit,
            "rate":          float(rate),
            "po_qty":        float(po_qty),
            "qty_prev":      float(qty_prev_total),
            "qty_this":      float(qty_curr),
            "qty_upto":      float(qty_upto),
            "qty_balance":   float(qty_balance),
            "amount_prev":   float(amt_prev),
            "amount_this":   float(amt_this),
            "amount_upto":   float(amt_upto),
            "amount_balance":float(amt_balance),
            "item_type":     item.item_type,
            "advance_recovery_this_item": float(item_adv_recovery),
            "advance_applicable": advance_applicable,
            "advance_rate": float(item_adv_rate_used),
            "advance_amount_prev": float(amt_prev_adv),
            "advance_amount_this": float(amt_this_adv),
            "advance_amount_upto": float(amt_upto_adv),
            "advance_amount_balance": float(amt_balance_adv),
            "supply_only_amount_prev": float(amt_prev_supply),
            "supply_only_amount_this": float(amt_this_supply),
            "supply_only_amount_upto": float(amt_upto_supply),
            "supply_only_amount_balance": float(amt_balance_supply),
        })

    # ec_* kept as derived sum for Tax Invoice / Reconciliation compatibility
    ec_prev = installation_prev + commissioning_prev
    ec_this = installation_this + commissioning_this

    taxable   = supply_this + ec_this
    igst      = (taxable * Decimal(str(project.igst_rate)) / 100).quantize(Decimal("0.01"))
    cgst      = (taxable * Decimal(str(project.cgst_rate)) / 100).quantize(Decimal("0.01"))
    sgst      = (taxable * Decimal(str(project.sgst_rate)) / 100).quantize(Decimal("0.01"))
    gross     = taxable + igst + cgst + sgst

    retention = (taxable * Decimal(str(project.pt_retention_pct)) / 100).quantize(Decimal("0.01"))
    net       = gross - adv_rec - retention

    ra_no = (prev_ra.ra_number + 1) if prev_ra else 1

    return jsonify({
        "ra_number":          ra_no,
        "invoice_no":         f"{project.invoice_prefix}/{ra_no:03d}",
        "invoice_date":       invoice_date.isoformat(),
        "supply_value_prev":  float(supply_prev),
        "supply_value_this":  float(supply_this),
        "supply_value_upto":  float(supply_prev + supply_this),
        "installation_value_prev": float(installation_prev),
        "installation_value_this": float(installation_this),
        "installation_value_upto": float(installation_prev + installation_this),
        "commissioning_value_prev": float(commissioning_prev),
        "commissioning_value_this": float(commissioning_this),
        "commissioning_value_upto": float(commissioning_prev + commissioning_this),
        "ec_value_prev":      float(ec_prev),
        "ec_value_this":      float(ec_this),
        "ec_value_upto":      float(ec_prev + ec_this),
        "taxable_value":      float(taxable),
        "igst_amount":        float(igst),
        "cgst_amount":        float(cgst),
        "sgst_amount":        float(sgst),
        "gross_total":        float(gross),
        "advance_recovery":   float(adv_rec),
        "retention_deduction":float(retention),
        "net_payable":        float(net),
        "lines":              lines,
        "period_note": f"Current period: {'start' if not prev_ra_date else prev_ra_date.strftime('%d-%b-%Y')} to {invoice_date.strftime('%d-%b-%Y')}",
        "advance_info": {
            "recorded": advance_gate_active,
            "total_received": float(advance_receipt.amount_received) if advance_receipt else 0,
            "recovering_this_bill": float(adv_rec),
        },
    })


@ra_bp.route("/<int:pid>/save", methods=["POST"])
@jwt_required()
def save_ra(pid):
    project = Project.query.get_or_404(pid)
    data = request.get_json()
    user = current_user()

    ra = RABill(
        project_id=pid,
        ra_number=data["ra_number"],
        invoice_no=data["invoice_no"],
        invoice_date=date.fromisoformat(data["invoice_date"]),
        supply_value_prev=data.get("supply_value_prev", 0),
        supply_value_this=data["supply_value_this"],
        supply_value_upto=data.get("supply_value_upto", 0),
        installation_value_prev=data.get("installation_value_prev", 0),
        installation_value_this=data.get("installation_value_this", 0),
        installation_value_upto=data.get("installation_value_upto", 0),
        commissioning_value_prev=data.get("commissioning_value_prev", 0),
        commissioning_value_this=data.get("commissioning_value_this", 0),
        commissioning_value_upto=data.get("commissioning_value_upto", 0),
        ec_value_prev=data.get("ec_value_prev", 0),
        ec_value_this=data["ec_value_this"],
        ec_value_upto=data.get("ec_value_upto", 0),
        taxable_value=data["taxable_value"],
        igst_amount=data["igst_amount"],
        cgst_amount=data["cgst_amount"],
        sgst_amount=data["sgst_amount"],
        gross_total=data["gross_total"],
        advance_recovery=data["advance_recovery"],
        retention_deduction=data.get("retention_deduction", 0),
        net_payable=data["net_payable"],
        notes=data.get("notes", ""),
        created_by=user.id,
        status="draft",
    )
    db.session.add(ra)
    db.session.flush()

    for li in data.get("lines", []):
        line = RABillLine(
            ra_bill_id=ra.id,
            boq_item_id=li["boq_item_id"],
            qty_prev=li["qty_prev"],
            qty_this=li["qty_this"],
            qty_upto=li["qty_upto"],
            qty_balance=li["qty_balance"],
            amount_prev=li["amount_prev"],
            amount_this=li["amount_this"],
            amount_upto=li["amount_upto"],
            amount_balance=li["amount_balance"],
            advance_rate=li.get("advance_rate", 0),
            advance_amount_prev=li.get("advance_amount_prev", 0),
            advance_amount_this=li.get("advance_amount_this", 0),
            advance_amount_upto=li.get("advance_amount_upto", 0),
            advance_amount_balance=li.get("advance_amount_balance", 0),
            supply_only_amount_prev=li.get("supply_only_amount_prev", li["amount_prev"]),
            supply_only_amount_this=li.get("supply_only_amount_this", li["amount_this"]),
            supply_only_amount_upto=li.get("supply_only_amount_upto", li["amount_upto"]),
            supply_only_amount_balance=li.get("supply_only_amount_balance", li["amount_balance"]),
        )
        db.session.add(line)

    project.current_ra_no = data["ra_number"] + 1
    db.session.commit()
    return jsonify(ra.to_dict()), 201


@ra_bp.route("/<int:rid>/export/excel", methods=["GET"])
@jwt_required()
def export_excel(rid):
    from flask import send_file
    ra = RABill.query.get_or_404(rid)
    project = Project.query.get(ra.project_id)
    lines = [l.to_dict() for l in ra.line_items]
    path = generate_ra_excel(ra, project, lines)
    return send_file(path, as_attachment=True,
                     download_name=f"RA_{ra.ra_number}_{ra.invoice_no}.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@ra_bp.route("/<int:rid>/export/pdf", methods=["GET"])
@jwt_required()
def export_pdf(rid):
    from flask import send_file
    ra = RABill.query.get_or_404(rid)
    project = Project.query.get(ra.project_id)
    lines = [l.to_dict() for l in ra.line_items]
    path = generate_ra_pdf(ra, project, lines)
    if not path:
        return jsonify({"error": "PDF generation failed"}), 500
    return send_file(path, as_attachment=True,
                     download_name=f"RA_{ra.ra_number}_{ra.invoice_no}.pdf",
                     mimetype="application/pdf")



@ra_bp.route("/<int:rid>/export/tax-invoice/pdf", methods=["GET"])
@jwt_required()
def export_tax_invoice_pdf(rid):
    from flask import send_file
    user = current_user()
    if user.role not in ("admin", "accounts"):
        return jsonify({"error": "Access denied"}), 403
    ra = RABill.query.get_or_404(rid)
    project = Project.query.get(ra.project_id)
    path = generate_tax_invoice_pdf(ra, project)
    if not path:
        return jsonify({"error": "Tax invoice PDF generation failed"}), 500
    return send_file(path, as_attachment=True,
                     download_name=f"TaxInvoice_{ra.ra_number}_{ra.invoice_no}.pdf",
                     mimetype="application/pdf")


@ra_bp.route("/<int:rid>/export/tax-invoice/excel", methods=["GET"])
@jwt_required()
def export_tax_invoice_excel(rid):
    from flask import send_file
    user = current_user()
    if user.role not in ("admin", "accounts"):
        return jsonify({"error": "Access denied"}), 403
    ra = RABill.query.get_or_404(rid)
    project = Project.query.get(ra.project_id)
    path = generate_tax_invoice_excel(ra, project)
    return send_file(path, as_attachment=True,
                     download_name=f"TaxInvoice_{ra.ra_number}_{ra.invoice_no}.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@ra_bp.route("/reconciliation/<int:pid>", methods=["GET"])
@jwt_required()
def get_reconciliation(pid):
    """Return reconciliation data for a project (admin + accounts only)."""
    user = current_user()
    if user.role not in ("admin", "accounts"):
        return jsonify({"error": "Access denied"}), 403
    from models.models import ReconciliationItem
    items = ReconciliationItem.query.filter_by(project_id=pid)                                    .order_by(ReconciliationItem.id).all()
    if not items:
        return jsonify([])
    return jsonify([i.to_dict() for i in items])


@ra_bp.route("/reconciliation/<int:pid>/export/excel", methods=["GET"])
@jwt_required()
def export_reconciliation_excel(pid):
    from flask import send_file
    user = current_user()
    if user.role not in ("admin", "accounts"):
        return jsonify({"error": "Access denied"}), 403
    from models.models import ReconciliationItem
    project = Project.query.get_or_404(pid)
    items = ReconciliationItem.query.filter_by(project_id=pid)                                    .order_by(ReconciliationItem.id).all()
    recon_data = [i.to_dict() for i in items]
    path = generate_reconciliation_excel(recon_data, project)
    return send_file(path, as_attachment=True,
                     download_name=f"Reconciliation_{project.code}.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@ra_bp.route("/<int:rid>/delete", methods=["DELETE"])
@jwt_required()
def delete_ra(rid):
    """Admin only — permanently delete an RA bill and its line items."""
    err = admin_required()
    if err: return err
    bill = RABill.query.get_or_404(rid)
    project = Project.query.get(bill.project_id)
    RABillLine.query.filter_by(ra_bill_id=rid).delete()
    db.session.delete(bill)
    last = RABill.query.filter_by(project_id=bill.project_id)                       .order_by(RABill.ra_number.desc()).first()
    project.current_ra_no = (last.ra_number + 1) if last else 1
    db.session.commit()
    return jsonify({"message": "RA Bill deleted"}), 200


@ra_bp.route("/challan/<int:dn_id>/pdf", methods=["GET"])
@jwt_required()
def export_challan_pdf(dn_id):
    """Generate Delivery Challan PDF for a dispatch note."""
    from flask import send_file
    from services.export import generate_challan_pdf
    dn = DispatchNote.query.get_or_404(dn_id)
    project = Project.query.get(dn.project_id)
    path = generate_challan_pdf(dn, project)
    if not path:
        return jsonify({"error": "Challan PDF generation failed"}), 500
    return send_file(path, as_attachment=True,
                     download_name=f"Challan_{dn.dn_number}.pdf",
                     mimetype="application/pdf")


@ra_bp.route("/po-invoice/<int:pid>", methods=["GET"])
@jwt_required()
def list_po_invoices(pid):
    """List all PO invoices for a project."""
    invs = POInvoice.query.filter_by(project_id=pid)                          .order_by(POInvoice.created_at.desc()).all()
    return jsonify([i.to_dict() for i in invs])


@ra_bp.route("/po-invoice/<int:pid>", methods=["POST"])
@jwt_required()
def save_po_invoice(pid):
    """Save a PO Invoice from selected dispatch notes."""
    user = current_user()
    if user.role not in ("admin", "accounts"):
        return jsonify({"error": "Access denied"}), 403

    data = request.get_json()
    dn_ids = data.get("dn_ids", [])
    if not dn_ids:
        return jsonify({"error": "No items selected"}), 400

    project = Project.query.get_or_404(pid)

    inv = POInvoice(
        project_id   = pid,
        invoice_no   = data["invoice_no"],
        invoice_date = date.fromisoformat(data["invoice_date"]),
        subtotal     = data["subtotal"],
        igst_amount  = data.get("igst_amount", 0),
        cgst_amount  = data.get("cgst_amount", 0),
        sgst_amount  = data.get("sgst_amount", 0),
        gross_total  = data["gross_total"],
        status       = "draft",
        created_by   = user.id,
    )
    db.session.add(inv)
    db.session.flush()

    for dn_id in dn_ids:
        dn = DispatchNote.query.get(dn_id)
        if not dn: continue
        boq = BOQItem.query.get(dn.boq_item_id)
        rate = float(boq.rate) if boq else 0
        qty  = float(dn.qty_dispatched)
        item = POInvoiceItem(
            po_invoice_id = inv.id,
            dn_id         = dn_id,
            boq_item_id   = dn.boq_item_id,
            qty           = qty,
            rate          = rate,
            amount        = qty * rate,
            hsn_code      = boq.hsn_code if boq else "",
        )
        db.session.add(item)
        # Mark dispatch as invoiced
        dn.invoice_status = "invoiced"

    db.session.commit()
    return jsonify(inv.to_dict()), 201


@ra_bp.route("/po-invoice/<int:inv_id>/pdf", methods=["GET"])
@jwt_required()
def export_po_invoice_pdf(inv_id):
    """Download PO Invoice as PDF."""
    from flask import send_file
    from services.export import generate_po_invoice_pdf
    inv = POInvoice.query.get_or_404(inv_id)
    project = Project.query.get(inv.project_id)
    path = generate_po_invoice_pdf(inv, project)
    if not path:
        return jsonify({"error": "PDF generation failed"}), 500
    return send_file(path, as_attachment=True,
                     download_name=f"POInvoice_{inv.invoice_no}.pdf",
                     mimetype="application/pdf")


@ra_bp.route("/po-invoice/<int:inv_id>/delete", methods=["DELETE"])
@jwt_required()
def delete_po_invoice(inv_id):
    """Admin only — delete a PO invoice and un-mark its dispatch notes."""
    err = admin_required()
    if err: return err
    inv = POInvoice.query.get_or_404(inv_id)
    # Un-mark dispatch notes as invoiced
    for item in inv.items:
        dn = DispatchNote.query.get(item.dn_id)
        if dn: dn.invoice_status = "pending"
    POInvoiceItem.query.filter_by(po_invoice_id=inv_id).delete()
    db.session.delete(inv)
    db.session.commit()
    return jsonify({"message": "PO Invoice deleted"}), 200


@ra_bp.route("/advance/<int:pid>", methods=["GET"])
@jwt_required()
def get_advance_receipt(pid):
    """Fetch the one-time advance receipt for a project, if recorded."""
    receipt = AdvanceReceipt.query.filter_by(project_id=pid).first()
    if not receipt:
        return jsonify(None)
    already_recovered = db.session.query(
        db.func.coalesce(db.func.sum(RABill.advance_recovery), 0)
    ).filter_by(project_id=pid).scalar()
    d = receipt.to_dict()
    d["recovered_so_far"] = float(already_recovered)
    d["remaining"] = float(Decimal(str(receipt.amount_received)) - Decimal(str(already_recovered)))
    return jsonify(d)


@ra_bp.route("/advance/<int:pid>", methods=["POST"])
@jwt_required()
def record_advance_receipt(pid):
    """One-time entry — Accounts records the actual advance received from
    the client. Blocked if already recorded (use PUT to correct)."""
    user = current_user()
    if user.role not in ("admin", "accounts"):
        return jsonify({"error": "Access denied"}), 403

    existing = AdvanceReceipt.query.filter_by(project_id=pid).first()
    if existing:
        return jsonify({"error": "Advance already recorded for this project. "
                                  "Contact admin to correct the existing entry."}), 400

    data = request.get_json()
    if not data.get("amount_received") or float(data["amount_received"]) <= 0:
        return jsonify({"error": "Enter a valid amount received"}), 400
    if not data.get("date_received"):
        return jsonify({"error": "Date received is required"}), 400

    receipt = AdvanceReceipt(
        project_id=pid,
        amount_received=data["amount_received"],
        date_received=date.fromisoformat(data["date_received"]),
        reference_no=data.get("reference_no", ""),
        notes=data.get("notes", ""),
        recorded_by=user.id,
    )
    db.session.add(receipt)
    db.session.commit()
    return jsonify(receipt.to_dict()), 201


@ra_bp.route("/advance/<int:rid>", methods=["PUT"])
@jwt_required()
def update_advance_receipt(rid):
    """Admin-only correction of a previously recorded advance receipt."""
    err = admin_required()
    if err: return err
    receipt = AdvanceReceipt.query.get_or_404(rid)
    data = request.get_json()
    if "amount_received" in data: receipt.amount_received = data["amount_received"]
    if "date_received" in data and data["date_received"]:
        receipt.date_received = date.fromisoformat(data["date_received"])
    if "reference_no" in data: receipt.reference_no = data["reference_no"]
    if "notes" in data: receipt.notes = data["notes"]
    db.session.commit()
    return jsonify(receipt.to_dict())


@ra_bp.route("/<int:rid>/status", methods=["PUT"])
@jwt_required()
def update_status(rid):
    ra = RABill.query.get_or_404(rid)
    data = request.get_json()
    ra.status = data.get("status", ra.status)
    if data.get("irn_number"): ra.irn_number = data["irn_number"]
    if ra.status == "submitted": ra.submitted_at = datetime.utcnow()
    db.session.commit()
    if ra.status == "submitted":
        project = Project.query.get(ra.project_id)
        try: notify_ra_generated(ra, project)
        except Exception as e: print(f"Notify error: {e}")
    return jsonify(ra.to_dict())
