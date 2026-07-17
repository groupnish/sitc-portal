from extensions import db
from datetime import datetime
import bcrypt

class User(db.Model):
    __tablename__ = "users"
    id            = db.Column(db.Integer, primary_key=True)
    name          = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role          = db.Column(db.String(30), nullable=False)
    # roles: admin | scm | accounts | site | management
    phone_whatsapp = db.Column(db.String(20))
    is_active     = db.Column(db.Boolean, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    notify_grn      = db.Column(db.Boolean, default=True)
    notify_dispatch = db.Column(db.Boolean, default=True)
    notify_progress = db.Column(db.Boolean, default=True)
    notify_ra       = db.Column(db.Boolean, default=True)

    def set_password(self, raw):
        self.password_hash = bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()

    def check_password(self, raw):
        return bcrypt.checkpw(raw.encode(), self.password_hash.encode())

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "email": self.email,
            "role": self.role, "phone_whatsapp": self.phone_whatsapp,
            "is_active": self.is_active,
            "notify_grn": self.notify_grn, "notify_dispatch": self.notify_dispatch,
            "notify_progress": self.notify_progress, "notify_ra": self.notify_ra,
        }


class Project(db.Model):
    __tablename__ = "projects"
    id            = db.Column(db.Integer, primary_key=True)
    code          = db.Column(db.String(50), unique=True, nullable=False)
    name          = db.Column(db.String(300), nullable=False)
    is_active     = db.Column(db.Boolean, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # Client / Buyer
    client_name    = db.Column(db.String(300))
    client_address = db.Column(db.Text)
    client_gstin   = db.Column(db.String(20))
    client_pan     = db.Column(db.String(20))

    # Seller / Our company
    seller_name    = db.Column(db.String(300))
    seller_address = db.Column(db.Text)
    seller_gstin   = db.Column(db.String(20))
    seller_pan     = db.Column(db.String(20))

    # Work Order
    wo_number      = db.Column(db.String(100))
    wo_date        = db.Column(db.Date)
    wo_value       = db.Column(db.Numeric(14, 2))
    amendment_no   = db.Column(db.String(20))
    place_of_supply = db.Column(db.String(100))
    hsn_sac_code   = db.Column(db.String(20), default="9954")

    # Site / Consignee
    site_name      = db.Column(db.String(300))
    site_address   = db.Column(db.Text)

    # Tax
    igst_rate      = db.Column(db.Numeric(5, 2), default=18.00)
    cgst_rate      = db.Column(db.Numeric(5, 2), default=0.00)
    sgst_rate      = db.Column(db.Numeric(5, 2), default=0.00)

    # Payment terms (JSON-ish stored as columns)
    pt_advance_pct          = db.Column(db.Numeric(5, 2), default=0)
    pt_lc_pct               = db.Column(db.Numeric(5, 2), default=0)
    pt_installation_pct     = db.Column(db.Numeric(5, 2), default=0)
    pt_commissioning_pct    = db.Column(db.Numeric(5, 2), default=0)
    pt_retention_pct        = db.Column(db.Numeric(5, 2), default=0)
    pt_ld_pct               = db.Column(db.Numeric(5, 2), default=0)
    pt_notes                = db.Column(db.Text)

    # Advance received
    advance_received_incl_gst = db.Column(db.Numeric(14, 2), default=0)

    # Project type determines billing workflow
    project_type   = db.Column(db.String(20), default="work_contract")

    # Invoice series
    invoice_prefix = db.Column(db.String(30), default="INV")
    current_ra_no  = db.Column(db.Integer, default=1)

    boq_items      = db.relationship("BOQItem", backref="project", lazy=True, cascade="all,delete")
    grns           = db.relationship("GRN", backref="project", lazy=True, cascade="all,delete")
    dispatches     = db.relationship("DispatchNote", backref="project", lazy=True, cascade="all,delete")
    ra_bills       = db.relationship("RABill", backref="project", lazy=True, cascade="all,delete")

    def to_dict(self):
        return {
            "id": self.id, "code": self.code, "name": self.name,
            "is_active": self.is_active,
            "client_name": self.client_name, "client_address": self.client_address,
            "client_gstin": self.client_gstin, "client_pan": self.client_pan,
            "seller_name": self.seller_name, "seller_address": self.seller_address,
            "seller_gstin": self.seller_gstin, "seller_pan": self.seller_pan,
            "wo_number": self.wo_number,
            "wo_date": self.wo_date.isoformat() if self.wo_date else None,
            "wo_value": float(self.wo_value) if self.wo_value else 0,
            "amendment_no": self.amendment_no,
            "place_of_supply": self.place_of_supply,
            "hsn_sac_code": self.hsn_sac_code,
            "site_name": self.site_name, "site_address": self.site_address,
            "igst_rate": float(self.igst_rate), "cgst_rate": float(self.cgst_rate),
            "sgst_rate": float(self.sgst_rate),
            "pt_advance_pct": float(self.pt_advance_pct),
            "pt_lc_pct": float(self.pt_lc_pct),
            "pt_installation_pct": float(self.pt_installation_pct),
            "pt_commissioning_pct": float(self.pt_commissioning_pct),
            "pt_retention_pct": float(self.pt_retention_pct),
            "pt_ld_pct": float(self.pt_ld_pct),
            "pt_notes": self.pt_notes,
            "advance_received_incl_gst": float(self.advance_received_incl_gst),
            "project_type": self.project_type or "work_contract",
            "invoice_prefix": self.invoice_prefix,
            "current_ra_no": self.current_ra_no,
        }


class BOQItem(db.Model):
    __tablename__ = "boq_items"
    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    sr_no       = db.Column(db.String(20), nullable=False)
    # customer_sr_no: the customer's own PO/WO BOQ line Sr. No. — separate
    # from sr_no (our internal Item No. used everywhere else in the system:
    # GRN, Dispatch, Installation, Commissioning, BOQ Manager). Only used to
    # relabel the "Sr." column in the RA Bill PDF/Excel so the document
    # matches the customer's own Work Order BOQ numbering for the approving
    # authority to sign off on. Falls back to sr_no when not set (e.g. items
    # not yet mapped to a customer PO line).
    customer_sr_no = db.Column(db.String(20))
    description = db.Column(db.Text, nullable=False)
    po_qty      = db.Column(db.Numeric(12, 3), nullable=False)
    unit        = db.Column(db.String(20), nullable=False)
    rate        = db.Column(db.Numeric(14, 2), default=0)
    amount      = db.Column(db.Numeric(14, 2), default=0)
    site_zone   = db.Column(db.String(50))
    item_type   = db.Column(db.String(20), default="supply")
    # item_type: supply | erection | commissioning
    hsn_code    = db.Column(db.String(20))
    # advance_rate: per-unit Advance-stage value for Supply items created via
    # "Add Split Item" (= total item rate * Advance% / 100, fixed at creation
    # time). Used to combine Advance+Supply into one RA bill line and to
    # compute that item's own advance recovery — only Supply rows use this.
    advance_rate = db.Column(db.Numeric(14, 2), default=0)
    milestone_type = db.Column(db.String(20), default="standard")
    sort_order  = db.Column(db.Integer, default=0)
    is_active   = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id, "project_id": self.project_id,
            "sr_no": self.sr_no, "description": self.description,
            "customer_sr_no": self.customer_sr_no or "",
            "po_qty": float(self.po_qty), "unit": self.unit,
            "rate": float(self.rate), "amount": float(self.amount),
            "site_zone": self.site_zone, "item_type": self.item_type,
            "hsn_code": self.hsn_code or "",
            "advance_rate": float(self.advance_rate or 0),
            "milestone_type": self.milestone_type, "sort_order": self.sort_order,
        }


class GRN(db.Model):
    __tablename__ = "grns"
    id           = db.Column(db.Integer, primary_key=True)
    project_id   = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    grn_number   = db.Column(db.String(30), unique=True, nullable=False)
    grn_date     = db.Column(db.Date, nullable=False)
    boq_item_id  = db.Column(db.Integer, db.ForeignKey("boq_items.id"), nullable=False)
    qty_received = db.Column(db.Numeric(12, 3), nullable=False)
    vendor_name  = db.Column(db.String(200))
    challan_no   = db.Column(db.String(100))
    hsn_code     = db.Column(db.String(20))
    vehicle_no   = db.Column(db.String(30))
    remarks      = db.Column(db.Text)
    created_by   = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    status       = db.Column(db.String(20), default="received")

    boq_item     = db.relationship("BOQItem", backref="grns")
    creator      = db.relationship("User", backref="grns_created")

    def to_dict(self):
        try:
            boq_sr   = self.boq_item.sr_no if self.boq_item else ""
            boq_desc = self.boq_item.description[:80] if self.boq_item else ""
            boq_unit = self.boq_item.unit if self.boq_item else ""
        except Exception:
            boq_sr = boq_desc = boq_unit = ""
        try:
            creator_name = self.creator.name if self.creator else ""
        except Exception:
            creator_name = ""
        return {
            "id": self.id, "project_id": self.project_id,
            "grn_number": self.grn_number,
            "grn_date": self.grn_date.isoformat(),
            "boq_item_id": self.boq_item_id,
            "boq_item_sr": boq_sr,
            "boq_item_desc": boq_desc,
            "qty_received": float(self.qty_received),
            "unit": boq_unit,
            "vendor_name": self.vendor_name, "challan_no": self.challan_no,
            "hsn_code": self.hsn_code or "",
            "vehicle_no": self.vehicle_no, "remarks": self.remarks,
            "created_by_name": creator_name,
            "created_at": self.created_at.isoformat(), "status": self.status,
        }


class DispatchNote(db.Model):
    __tablename__ = "dispatch_notes"
    id            = db.Column(db.Integer, primary_key=True)
    project_id    = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    dn_number     = db.Column(db.String(30), unique=True, nullable=False)
    dispatch_date = db.Column(db.Date, nullable=False)
    boq_item_id   = db.Column(db.Integer, db.ForeignKey("boq_items.id"), nullable=False)
    qty_dispatched = db.Column(db.Numeric(12, 3), nullable=False)
    site_destination = db.Column(db.String(100))
    vehicle_no    = db.Column(db.String(30))
    driver_name   = db.Column(db.String(100))
    lr_number     = db.Column(db.String(50))
    bc_challan_no = db.Column(db.String(50))
    bc_invoice_no = db.Column(db.String(50))
    eway_bill_no  = db.Column(db.String(50))
    remarks       = db.Column(db.Text)
    created_by    = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    invoice_status = db.Column(db.String(20), default="pending")
    # invoice_status: pending | invoiced

    boq_item      = db.relationship("BOQItem", backref="dispatches")
    creator       = db.relationship("User", backref="dispatches_created")

    def to_dict(self):
        try:
            boq_sr   = self.boq_item.sr_no if self.boq_item else ""
            boq_desc = self.boq_item.description[:80] if self.boq_item else ""
            boq_rate = float(self.boq_item.rate) if self.boq_item else 0
            boq_unit = self.boq_item.unit if self.boq_item else ""
            amount   = boq_rate * float(self.qty_dispatched)
        except Exception:
            boq_sr = boq_desc = boq_unit = ""; boq_rate = amount = 0
        try:
            creator_name = self.creator.name if self.creator else ""
        except Exception:
            creator_name = ""
        return {
            "id": self.id, "project_id": self.project_id,
            "dn_number": self.dn_number,
            "dispatch_date": self.dispatch_date.isoformat(),
            "boq_item_id": self.boq_item_id,
            "boq_item_sr": boq_sr,
            "boq_item_desc": boq_desc,
            "boq_item_rate": boq_rate,
            "qty_dispatched": float(self.qty_dispatched),
            "unit": boq_unit,
            "amount": amount,
            "site_destination": self.site_destination,
            "vehicle_no": self.vehicle_no, "driver_name": self.driver_name,
            "lr_number": self.lr_number,
            "bc_challan_no": self.bc_challan_no or "",
            "bc_invoice_no": self.bc_invoice_no or "",
            "eway_bill_no": self.eway_bill_no or "",
            "remarks": self.remarks,
            "created_by_name": creator_name,
            "created_at": self.created_at.isoformat(),
            "invoice_status": self.invoice_status,
        }


class SiteProgress(db.Model):
    __tablename__ = "site_progress"
    id           = db.Column(db.Integer, primary_key=True)
    project_id   = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    boq_item_id  = db.Column(db.Integer, db.ForeignKey("boq_items.id"), nullable=False)
    progress_date = db.Column(db.Date, nullable=False)
    qty_installed    = db.Column(db.Numeric(12, 3), default=0)
    qty_commissioned = db.Column(db.Numeric(12, 3), default=0)
    notes        = db.Column(db.Text)
    updated_by   = db.Column(db.Integer, db.ForeignKey("users.id"))
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow)

    boq_item     = db.relationship("BOQItem", backref="progress_entries")
    updater      = db.relationship("User", backref="progress_updates")

    def to_dict(self):
        return {
            "id": self.id, "project_id": self.project_id,
            "boq_item_id": self.boq_item_id,
            "boq_item_sr": self.boq_item.sr_no if self.boq_item else "",
            "boq_item_desc": self.boq_item.description[:80] if self.boq_item else "",
            "po_qty": float(self.boq_item.po_qty) if self.boq_item else 0,
            "unit": self.boq_item.unit if self.boq_item else "",
            "progress_date": self.progress_date.isoformat(),
            "qty_installed": float(self.qty_installed),
            "qty_commissioned": float(self.qty_commissioned),
            "notes": self.notes,
            "updated_by_name": self.updater.name if self.updater else "",
            "updated_at": self.updated_at.isoformat(),
        }


class RABill(db.Model):
    __tablename__ = "ra_bills"
    id            = db.Column(db.Integer, primary_key=True)
    project_id    = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    ra_number     = db.Column(db.Integer, nullable=False)
    invoice_no    = db.Column(db.String(50))
    invoice_date  = db.Column(db.Date)
    period_from   = db.Column(db.Date)
    period_to     = db.Column(db.Date)

    supply_value_prev   = db.Column(db.Numeric(14, 2), default=0)
    supply_value_this   = db.Column(db.Numeric(14, 2), default=0)
    supply_value_upto   = db.Column(db.Numeric(14, 2), default=0)

    ec_value_prev       = db.Column(db.Numeric(14, 2), default=0)  # derived: installation+commissioning (kept for Tax Invoice/Reconciliation compatibility)
    ec_value_this       = db.Column(db.Numeric(14, 2), default=0)
    ec_value_upto       = db.Column(db.Numeric(14, 2), default=0)

    installation_value_prev   = db.Column(db.Numeric(14, 2), default=0)
    installation_value_this   = db.Column(db.Numeric(14, 2), default=0)
    installation_value_upto   = db.Column(db.Numeric(14, 2), default=0)

    commissioning_value_prev  = db.Column(db.Numeric(14, 2), default=0)
    commissioning_value_this  = db.Column(db.Numeric(14, 2), default=0)
    commissioning_value_upto  = db.Column(db.Numeric(14, 2), default=0)

    taxable_value       = db.Column(db.Numeric(14, 2), default=0)
    igst_amount         = db.Column(db.Numeric(14, 2), default=0)
    cgst_amount         = db.Column(db.Numeric(14, 2), default=0)
    sgst_amount         = db.Column(db.Numeric(14, 2), default=0)
    gross_total         = db.Column(db.Numeric(14, 2), default=0)
    advance_recovery    = db.Column(db.Numeric(14, 2), default=0)
    retention_deduction = db.Column(db.Numeric(14, 2), default=0)
    other_deductions    = db.Column(db.Numeric(14, 2), default=0)
    net_payable         = db.Column(db.Numeric(14, 2), default=0)

    status        = db.Column(db.String(20), default="draft")
    # status: draft | submitted | approved | paid
    irn_number    = db.Column(db.String(100))
    pdf_drive_url = db.Column(db.String(500))
    excel_drive_url = db.Column(db.String(500))
    notes         = db.Column(db.Text)

    created_by    = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    submitted_at  = db.Column(db.DateTime)

    line_items    = db.relationship("RABillLine", backref="ra_bill", lazy=True, cascade="all,delete")
    creator       = db.relationship("User", backref="ra_bills_created")

    def to_dict(self):
        return {
            "id": self.id, "project_id": self.project_id,
            "ra_number": self.ra_number, "invoice_no": self.invoice_no,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "period_from": self.period_from.isoformat() if self.period_from else None,
            "period_to": self.period_to.isoformat() if self.period_to else None,
            "supply_value_prev": float(self.supply_value_prev),
            "supply_value_this": float(self.supply_value_this),
            "supply_value_upto": float(self.supply_value_upto),
            "ec_value_prev": float(self.ec_value_prev),
            "ec_value_this": float(self.ec_value_this),
            "ec_value_upto": float(self.ec_value_upto),
            "installation_value_prev": float(self.installation_value_prev or 0),
            "installation_value_this": float(self.installation_value_this or 0),
            "installation_value_upto": float(self.installation_value_upto or 0),
            "commissioning_value_prev": float(self.commissioning_value_prev or 0),
            "commissioning_value_this": float(self.commissioning_value_this or 0),
            "commissioning_value_upto": float(self.commissioning_value_upto or 0),
            "taxable_value": float(self.taxable_value),
            "igst_amount": float(self.igst_amount),
            "cgst_amount": float(self.cgst_amount),
            "sgst_amount": float(self.sgst_amount),
            "gross_total": float(self.gross_total),
            "advance_recovery": float(self.advance_recovery),
            "retention_deduction": float(self.retention_deduction),
            "net_payable": float(self.net_payable),
            "status": self.status,
            "irn_number": self.irn_number,
            "pdf_drive_url": self.pdf_drive_url,
            "excel_drive_url": self.excel_drive_url,
            "notes": self.notes,
            "created_by_name": self.creator.name if self.creator else "",
            "created_at": self.created_at.isoformat(),
        }


class RABillLine(db.Model):
    __tablename__ = "ra_bill_lines"
    id            = db.Column(db.Integer, primary_key=True)
    ra_bill_id    = db.Column(db.Integer, db.ForeignKey("ra_bills.id"), nullable=False)
    boq_item_id   = db.Column(db.Integer, db.ForeignKey("boq_items.id"), nullable=False)
    qty_prev      = db.Column(db.Numeric(12, 3), default=0)
    qty_this      = db.Column(db.Numeric(12, 3), default=0)
    qty_upto      = db.Column(db.Numeric(12, 3), default=0)
    qty_balance   = db.Column(db.Numeric(12, 3), default=0)
    amount_prev   = db.Column(db.Numeric(14, 2), default=0)
    amount_this   = db.Column(db.Numeric(14, 2), default=0)
    amount_upto   = db.Column(db.Numeric(14, 2), default=0)
    amount_balance = db.Column(db.Numeric(14, 2), default=0)

    # ── Advance / Supply stage breakdown (Payment Terms driven) ──────────
    # amount_prev/this/upto/balance above stay as the TOTAL for that item
    # (backward compatible with any existing consumer). The two blocks below
    # split that total into its Advance-stage and Supply-stage portions so
    # the RA Bill document can show them as separate sub-rows under each
    # item. advance_rate = 0 means the Advance stage was not applicable/
    # active for this item on this bill (advance not yet recorded, or
    # item_type isn't "supply") — in that case supply_only_* mirrors
    # amount_* exactly and no Advance sub-row should be rendered.
    advance_rate            = db.Column(db.Numeric(14, 2), default=0)
    advance_amount_prev     = db.Column(db.Numeric(14, 2), default=0)
    advance_amount_this     = db.Column(db.Numeric(14, 2), default=0)
    advance_amount_upto     = db.Column(db.Numeric(14, 2), default=0)
    advance_amount_balance  = db.Column(db.Numeric(14, 2), default=0)

    supply_only_amount_prev    = db.Column(db.Numeric(14, 2), default=0)
    supply_only_amount_this    = db.Column(db.Numeric(14, 2), default=0)
    supply_only_amount_upto    = db.Column(db.Numeric(14, 2), default=0)
    supply_only_amount_balance = db.Column(db.Numeric(14, 2), default=0)

    boq_item      = db.relationship("BOQItem", backref="ra_lines")

    def to_dict(self):
        return {
            "id": self.id, "ra_bill_id": self.ra_bill_id,
            "boq_item_id": self.boq_item_id,
            "sr_no": self.boq_item.sr_no if self.boq_item else "",
            "description": self.boq_item.description if self.boq_item else "",
            "unit": self.boq_item.unit if self.boq_item else "",
            "rate": float(self.boq_item.rate) if self.boq_item else 0,
            "po_qty": float(self.boq_item.po_qty) if self.boq_item else 0,
            "item_type": self.boq_item.item_type if self.boq_item else "",
            "qty_prev": float(self.qty_prev), "qty_this": float(self.qty_this),
            "qty_upto": float(self.qty_upto), "qty_balance": float(self.qty_balance),
            "amount_prev": float(self.amount_prev), "amount_this": float(self.amount_this),
            "amount_upto": float(self.amount_upto), "amount_balance": float(self.amount_balance),
            "advance_rate": float(self.advance_rate or 0),
            "advance_applicable": float(self.advance_rate or 0) > 0,
            "advance_amount_prev": float(self.advance_amount_prev or 0),
            "advance_amount_this": float(self.advance_amount_this or 0),
            "advance_amount_upto": float(self.advance_amount_upto or 0),
            "advance_amount_balance": float(self.advance_amount_balance or 0),
            "supply_only_amount_prev": float(self.supply_only_amount_prev or 0),
            "supply_only_amount_this": float(self.supply_only_amount_this or 0),
            "supply_only_amount_upto": float(self.supply_only_amount_upto or 0),
            "supply_only_amount_balance": float(self.supply_only_amount_balance or 0),
        }






class POInvoice(db.Model):
    """Item-wise Tax Invoice for Purchase Order type projects."""
    __tablename__ = "po_invoices"
    id            = db.Column(db.Integer, primary_key=True)
    project_id    = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    invoice_no    = db.Column(db.String(100), nullable=False)
    invoice_date  = db.Column(db.Date, nullable=False)
    subtotal      = db.Column(db.Numeric(14, 2), default=0)
    igst_amount   = db.Column(db.Numeric(14, 2), default=0)
    cgst_amount   = db.Column(db.Numeric(14, 2), default=0)
    sgst_amount   = db.Column(db.Numeric(14, 2), default=0)
    gross_total   = db.Column(db.Numeric(14, 2), default=0)
    status        = db.Column(db.String(20), default="draft")
    notes         = db.Column(db.Text)
    created_by    = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    project       = db.relationship("Project", backref="po_invoices")
    items         = db.relationship("POInvoiceItem", backref="invoice",
                                    cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "project_id": self.project_id,
            "invoice_no": self.invoice_no,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "subtotal": float(self.subtotal or 0),
            "igst_amount": float(self.igst_amount or 0),
            "cgst_amount": float(self.cgst_amount or 0),
            "sgst_amount": float(self.sgst_amount or 0),
            "gross_total": float(self.gross_total or 0),
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "items": [i.to_dict() for i in self.items],
        }


class POInvoiceItem(db.Model):
    """One line item in a PO Invoice — linked to a DispatchNote."""
    __tablename__ = "po_invoice_items"
    id            = db.Column(db.Integer, primary_key=True)
    po_invoice_id = db.Column(db.Integer, db.ForeignKey("po_invoices.id"), nullable=False)
    dn_id         = db.Column(db.Integer, db.ForeignKey("dispatch_notes.id"), nullable=False)
    boq_item_id   = db.Column(db.Integer, db.ForeignKey("boq_items.id"), nullable=False)
    qty           = db.Column(db.Numeric(12, 3), default=0)
    rate          = db.Column(db.Numeric(14, 2), default=0)
    amount        = db.Column(db.Numeric(14, 2), default=0)
    hsn_code      = db.Column(db.String(20))

    dn            = db.relationship("DispatchNote", backref="po_invoice_items")
    boq_item      = db.relationship("BOQItem", backref="po_invoice_items")

    def to_dict(self):
        return {
            "id": self.id,
            "po_invoice_id": self.po_invoice_id,
            "dn_id": self.dn_id,
            "dn_number": self.dn.dn_number if self.dn else "",
            "boq_item_id": self.boq_item_id,
            "sr_no": self.boq_item.sr_no if self.boq_item else "",
            "description": self.boq_item.description if self.boq_item else "",
            "unit": self.boq_item.unit if self.boq_item else "",
            "hsn_code": self.hsn_code or (self.boq_item.hsn_code if self.boq_item else "") or "",
            "qty": float(self.qty or 0),
            "rate": float(self.rate or 0),
            "amount": float(self.amount or 0),
        }



class AdvanceReceipt(db.Model):
    """One-time record of actual advance payment received from client.
    Entered once by Accounts on the RA Bill page (not at project setup,
    since advance is rarely known/received at project creation time).
    Used as a running-balance pool: each RA bill recovers against this
    pool until it's fully exhausted, then recovery stops."""
    __tablename__ = "advance_receipts"
    id              = db.Column(db.Integer, primary_key=True)
    project_id      = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False, unique=True)
    amount_received = db.Column(db.Numeric(14, 2), nullable=False)
    date_received   = db.Column(db.Date, nullable=False)
    reference_no    = db.Column(db.String(100))
    notes           = db.Column(db.Text)
    recorded_by     = db.Column(db.Integer, db.ForeignKey("users.id"))
    recorded_at     = db.Column(db.DateTime, default=datetime.utcnow)

    project = db.relationship("Project", backref=db.backref("advance_receipt", uselist=False))
    recorder = db.relationship("User", backref="advance_receipts_recorded")

    def to_dict(self):
        return {
            "id": self.id, "project_id": self.project_id,
            "amount_received": float(self.amount_received),
            "date_received": self.date_received.isoformat() if self.date_received else None,
            "reference_no": self.reference_no or "",
            "notes": self.notes or "",
            "recorded_by_name": self.recorder.name if self.recorder else "",
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }

class ReconciliationItem(db.Model):
    """Frozen audit of old WO (Gharpure) billings vs new PO (BEIL Amd-3) disposition."""
    __tablename__ = "reconciliation_items"
    id             = db.Column(db.Integer, primary_key=True)
    project_id     = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    site           = db.Column(db.String(50))
    old_sr         = db.Column(db.String(20))
    description    = db.Column(db.Text)
    old_rate       = db.Column(db.Numeric(14, 2), default=0)
    old_qty        = db.Column(db.Numeric(12, 3), default=0)
    billed_supply  = db.Column(db.Numeric(14, 2), default=0)
    billed_install = db.Column(db.Numeric(14, 2), default=0)
    billed_comm    = db.Column(db.Numeric(14, 2), default=0)
    total_billed   = db.Column(db.Numeric(14, 2), default=0)
    disposition    = db.Column(db.String(200))

    def to_dict(self):
        return {
            "id": self.id, "project_id": self.project_id,
            "site": self.site, "old_sr": self.old_sr,
            "description": self.description,
            "old_rate": float(self.old_rate or 0),
            "old_qty": float(self.old_qty or 0),
            "billed_supply": float(self.billed_supply or 0),
            "billed_install": float(self.billed_install or 0),
            "billed_comm": float(self.billed_comm or 0),
            "total_billed": float(self.total_billed or 0),
            "disposition": self.disposition or "",
        }

class Notification(db.Model):
    __tablename__ = "notifications"
    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey("projects.id"))
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"))
    event_type  = db.Column(db.String(50))
    message     = db.Column(db.Text)
    is_read     = db.Column(db.Boolean, default=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    ref_id      = db.Column(db.Integer)
    ref_type    = db.Column(db.String(30))

    def to_dict(self):
        return {
            "id": self.id, "project_id": self.project_id,
            "event_type": self.event_type, "message": self.message,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat(),
            "ref_id": self.ref_id, "ref_type": self.ref_type,
        }
