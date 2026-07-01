"""
Updated RA compute logic — separates previous vs current period entries.
The "current" entries are those added AFTER the last RA bill was saved.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.models import (Project, BOQItem, User, RABill, RABillLine,
                            SiteProgress, db)
from services.notifications import notify_ra_generated
from services.export import (generate_ra_excel, generate_ra_pdf,
                             generate_tax_invoice_pdf, generate_tax_invoice_excel,
                             generate_reconciliation_excel)
from datetime import date, datetime
from decimal import Decimal

ra_bp = Blueprint("ra", __name__)

def current_user():
    return User.query.get(int(get_jwt_identity()))


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

    lines = []
    supply_prev = Decimal("0"); supply_this = Decimal("0")
    ec_prev     = Decimal("0"); ec_this     = Decimal("0")

    for item in boq_items:
        rate = Decimal(str(item.rate))
        po_qty = Decimal(str(item.po_qty))

        # All progress entries for this item
        all_entries = SiteProgress.query.filter_by(
            project_id=pid, boq_item_id=item.id
        ).all()

        if item.item_type in ["supply", "erection"]:
            # Previous: entries up to last RA bill date
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

        amt_prev    = qty_prev_total * rate
        amt_this    = qty_curr       * rate
        amt_upto    = qty_upto       * rate
        amt_balance = qty_balance    * rate

        if item.item_type == "supply":
            supply_prev += amt_prev; supply_this += amt_this
        else:
            ec_prev += amt_prev; ec_this += amt_this

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
        })

    taxable   = supply_this + ec_this
    igst      = (taxable * Decimal(str(project.igst_rate)) / 100).quantize(Decimal("0.01"))
    cgst      = (taxable * Decimal(str(project.cgst_rate)) / 100).quantize(Decimal("0.01"))
    sgst      = (taxable * Decimal(str(project.sgst_rate)) / 100).quantize(Decimal("0.01"))
    gross     = taxable + igst + cgst + sgst
    adv_rec   = (supply_this * Decimal(str(project.pt_advance_pct)) / 100).quantize(Decimal("0.01"))
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
