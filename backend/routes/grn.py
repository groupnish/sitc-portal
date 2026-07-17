from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from models.models import (Project, BOQItem, User, GRN, DispatchNote,
                            SiteProgress, Notification, db)
from services.notifications import (notify_grn_created, notify_dispatch_created,
                                     notify_progress_updated)
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.exc import IntegrityError
import json, os

# ── helpers ──────────────────────────────────────────────────────────────────

def admin_required():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None

def current_user():
    return User.query.get(int(get_jwt_identity()))

# ── Projects ──────────────────────────────────────────────────────────────────

projects_bp = Blueprint("projects", __name__)

@projects_bp.route("/", methods=["GET"])
@jwt_required()
def list_projects():
    projects = Project.query.order_by(Project.created_at.desc()).all()
    return jsonify([p.to_dict() for p in projects])

@projects_bp.route("/", methods=["POST"])
@jwt_required()
def create_project():
    err = admin_required()
    if err: return err
    data = request.get_json()
    p = Project(**{k: v for k, v in data.items() if hasattr(Project, k)})
    if data.get("wo_date"): p.wo_date = date.fromisoformat(data["wo_date"])
    db.session.add(p); db.session.commit()
    return jsonify(p.to_dict()), 201

@projects_bp.route("/<int:pid>", methods=["GET"])
@jwt_required()
def get_project(pid):
    p = Project.query.get_or_404(pid)
    return jsonify(p.to_dict())

@projects_bp.route("/<int:pid>", methods=["PUT"])
@jwt_required()
def update_project(pid):
    err = admin_required()
    if err: return err
    p = Project.query.get_or_404(pid)
    data = request.get_json()
    for k, v in data.items():
        if hasattr(p, k) and k not in ["id","created_at"]:
            if k == "wo_date" and v: setattr(p, k, date.fromisoformat(v))
            else: setattr(p, k, v)
    db.session.commit()
    return jsonify(p.to_dict())

# ── BOQ ──────────────────────────────────────────────────────────────────────

boq_bp = Blueprint("boq", __name__)

@boq_bp.route("/<int:pid>", methods=["GET"])
@jwt_required()
def list_boq(pid):
    items = BOQItem.query.filter_by(project_id=pid, is_active=True)\
                         .order_by(BOQItem.sort_order, BOQItem.sr_no).all()
    return jsonify([i.to_dict() for i in items])

@boq_bp.route("/<int:pid>", methods=["POST"])
@jwt_required()
def add_boq_item(pid):
    err = admin_required()
    if err: return err
    data = request.get_json()
    item = BOQItem(project_id=pid, **{k: v for k, v in data.items() if hasattr(BOQItem, k)})
    db.session.add(item); db.session.commit()
    return jsonify(item.to_dict()), 201

@boq_bp.route("/<int:pid>/add-split-item", methods=["POST"])
@jwt_required()
def add_split_boq_item(pid):
    """
    Add ONE BOQ item with a total value; auto-generate 3 stage rows
    (Supply / Installation / Commissioning) with rates derived from the
    project's Payment Terms percentages (Supply %, Installation %,
    Commissioning % — set in Admin -> Projects -> Payment tab).
    All 3 rows share the SAME Item No. (sr_no) so they track together
    through Dispatch, Site Progress, RA Bill, and Reconciliation.
    """
    err = admin_required()
    if err: return err
    project = Project.query.get_or_404(pid)
    data = request.get_json()

    required = ["sr_no", "description", "po_qty", "unit", "total_rate"]
    missing = [f for f in required if not data.get(f) and data.get(f) != 0]
    if missing:
        return jsonify({"error": f"Missing required field(s): {', '.join(missing)}"}), 400

    sr_no        = str(data["sr_no"]).strip()
    description  = data["description"]
    po_qty       = float(data["po_qty"])
    unit         = data["unit"]
    total_rate   = float(data["total_rate"])
    hsn_code     = data.get("hsn_code", "")
    site_zone    = data.get("site_zone", "GENERAL")

    advance_pct = float(project.pt_advance_pct or 0)
    supply_pct  = float(project.pt_lc_pct or 0)
    install_pct = float(project.pt_installation_pct or 0)
    comm_pct    = float(project.pt_commissioning_pct or 0)

    pct_sum = advance_pct + supply_pct + install_pct + comm_pct
    if (supply_pct + install_pct + comm_pct) <= 0:
        return jsonify({
            "error": "Project's Supply %, Installation %, Commissioning % are not set "
                     "(sum is 0). Set them in Admin -> Projects -> Payment tab first."
        }), 400

    # advance_rate is stored ONLY on the Supply row — it represents the
    # per-unit Advance-stage portion of this item's total value, combined
    # with Supply when billed in the RA bill (once Advance Received is
    # recorded on the RA Bill page), and used to compute that item's own
    # advance recovery.
    advance_rate_per_unit = round(total_rate * advance_pct / 100, 2) if advance_pct > 0 else 0

    stages = [
        ("supply",        supply_pct,  ""),
        ("erection",      install_pct, "A"),
        ("commissioning", comm_pct,    "B"),
    ]

    created = []
    max_sort = db.session.query(db.func.coalesce(db.func.max(BOQItem.sort_order), 0))\
                          .filter_by(project_id=pid).scalar()

    for i, (item_type, pct, suffix) in enumerate(stages):
        if pct <= 0:
            continue  # skip stages with 0% — e.g. pure-supply items with no install/commission
        stage_rate = round(total_rate * pct / 100, 2)
        item = BOQItem(
            project_id=pid,
            sr_no=sr_no,                    # SAME item number across all 3 stage rows
            description=description,
            po_qty=po_qty,
            unit=unit,
            rate=stage_rate,
            amount=round(stage_rate * po_qty, 2),
            site_zone=site_zone,
            item_type=item_type,
            hsn_code=hsn_code,
            advance_rate=advance_rate_per_unit if item_type == "supply" else 0,
            sort_order=max_sort + i + 1,
        )
        db.session.add(item)
        created.append(item)

    db.session.commit()

    return jsonify({
        "message": f"Created {len(created)} stage row(s) for item {sr_no}",
        "split_pct_used": {"advance": advance_pct, "supply": supply_pct, "installation": install_pct, "commissioning": comm_pct},
        "items": [i.to_dict() for i in created],
    }), 201


@boq_bp.route("/<int:pid>/bulk", methods=["POST"])
@jwt_required()
def bulk_add_boq(pid):
    err = admin_required()
    if err: return err
    items_data = request.get_json()
    created = []
    for i, d in enumerate(items_data):
        item = BOQItem(project_id=pid, sort_order=i,
                       **{k: v for k, v in d.items() if hasattr(BOQItem, k)})
        db.session.add(item); created.append(item)
    db.session.commit()
    return jsonify([i.to_dict() for i in created]), 201

@boq_bp.route("/item/<int:iid>", methods=["PUT"])
@jwt_required()
def update_boq_item(iid):
    err = admin_required()
    if err: return err
    item = BOQItem.query.get_or_404(iid)
    data = request.get_json()
    for k, v in data.items():
        if hasattr(item, k): setattr(item, k, v)
    db.session.commit()
    return jsonify(item.to_dict())

@boq_bp.route("/item/<int:iid>", methods=["DELETE"])
@jwt_required()
def delete_boq_item(iid):
    err = admin_required()
    if err: return err
    item = BOQItem.query.get_or_404(iid)
    item.is_active = False
    db.session.commit()
    return jsonify({"message": "Deleted"})

# ── Users ─────────────────────────────────────────────────────────────────────

users_bp = Blueprint("users", __name__)

@users_bp.route("/", methods=["GET"])
@jwt_required()
def list_users():
    err = admin_required()
    if err: return err
    users = User.query.order_by(User.name).all()
    return jsonify([u.to_dict() for u in users])

@users_bp.route("/", methods=["POST"])
@jwt_required()
def create_user():
    err = admin_required()
    if err: return err
    data = request.get_json()
    if User.query.filter_by(email=data["email"].lower()).first():
        return jsonify({"error": "Email already exists"}), 400
    u = User(name=data["name"], email=data["email"].lower(),
             role=data["role"], phone_whatsapp=data.get("phone_whatsapp",""))
    u.set_password(data["password"])
    db.session.add(u); db.session.commit()
    return jsonify(u.to_dict()), 201

@users_bp.route("/<int:uid>", methods=["PUT"])
@jwt_required()
def update_user(uid):
    me = current_user()
    if me.role != "admin" and me.id != uid:
        return jsonify({"error": "Forbidden"}), 403
    u = User.query.get_or_404(uid)
    data = request.get_json()
    allowed = ["name","phone_whatsapp","notify_grn","notify_dispatch","notify_progress","notify_ra"]
    if me.role == "admin": allowed += ["role","is_active","email"]
    for k in allowed:
        if k in data: setattr(u, k, data[k])
    if me.role == "admin" and data.get("password"):
        u.set_password(data["password"])
    db.session.commit()
    return jsonify(u.to_dict())

@users_bp.route("/whatsapp-contacts", methods=["GET"])
@jwt_required()
def wa_contacts():
    users = User.query.filter(User.is_active==True, User.phone_whatsapp!="").all()
    return jsonify([{"id": u.id, "name": u.name, "role": u.role,
                     "phone": u.phone_whatsapp} for u in users])

# ── GRN ──────────────────────────────────────────────────────────────────────

grn_bp = Blueprint("grn", __name__)

def next_grn_number(pid):
    """Generate next GRN number based on the highest existing suffix,
    not row count — avoids collisions after deletes or concurrent saves."""
    existing = GRN.query.filter_by(project_id=pid).with_entities(GRN.grn_number).all()
    max_seq = 0
    for (num,) in existing:
        try:
            seq = int(num.split("-")[-1])
            max_seq = max(max_seq, seq)
        except (ValueError, IndexError):
            continue
    return f"GRN-{pid:03d}-{max_seq+1:04d}"

@grn_bp.route("/<int:pid>", methods=["GET"])
@jwt_required()
def list_grns(pid):
    grns = GRN.query.filter_by(project_id=pid).order_by(GRN.created_at.desc()).all()
    return jsonify([g.to_dict() for g in grns])

@grn_bp.route("/<int:pid>", methods=["POST"])
@jwt_required()
def create_grn(pid):
    data = request.get_json()
    project = Project.query.get_or_404(pid)

    max_attempts = 5
    grn = None
    for attempt in range(max_attempts):
        grn = GRN(
            project_id=pid,
            grn_number=next_grn_number(pid),
            grn_date=date.fromisoformat(data["grn_date"]),
            boq_item_id=data["boq_item_id"],
            qty_received=data["qty_received"],
            vendor_name=data.get("vendor_name",""),
            challan_no=data.get("challan_no",""),
            hsn_code=data.get("hsn_code",""),
            vehicle_no=data.get("vehicle_no",""),
            remarks=data.get("remarks",""),
            created_by=int(get_jwt_identity())
        )
        db.session.add(grn)
        try:
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            if attempt == max_attempts - 1:
                return jsonify({"error": "Could not generate a unique GRN number — please retry"}), 500
            continue

    # Store values before session expires
    grn_id     = grn.id
    grn_number = grn.grn_number
    grn_date   = grn.grn_date.isoformat()
    qty        = float(grn.qty_received)
    # Send email notification
    try:
        notify_grn_created(grn, project)
    except Exception as e:
        print(f"Notify error: {e}")
    # Return simple safe response — no relationship access
    return jsonify({
        "id": grn_id,
        "grn_number": grn_number,
        "grn_date": grn_date,
        "qty_received": qty,
        "boq_item_id": data["boq_item_id"],
        "project_id": pid,
        "status": "received",
        "vendor_name": data.get("vendor_name",""),
        "challan_no": data.get("challan_no",""),
        "hsn_code": data.get("hsn_code",""),
        "vehicle_no": data.get("vehicle_no",""),
        "remarks": data.get("remarks",""),
    }), 201

@grn_bp.route("/<int:gid>", methods=["GET"])
@jwt_required()
def get_grn(gid):
    return jsonify(GRN.query.get_or_404(gid).to_dict())

@grn_bp.route("/<int:gid>", methods=["DELETE"])
@jwt_required()
def delete_grn(gid):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    grn = GRN.query.get_or_404(gid)
    grn_number = grn.grn_number
    db.session.delete(grn)
    db.session.commit()
    return jsonify({"message": f"GRN {grn_number} deleted"})

# ── Dispatch ──────────────────────────────────────────────────────────────────

dispatch_bp = Blueprint("dispatch", __name__)

def next_dn_number(pid):
    """Generate next DN number based on the highest existing suffix,
    not row count — avoids collisions after deletes or concurrent saves."""
    existing = DispatchNote.query.filter_by(project_id=pid).with_entities(DispatchNote.dn_number).all()
    max_seq = 0
    for (num,) in existing:
        try:
            seq = int(num.split("-")[-1])
            max_seq = max(max_seq, seq)
        except (ValueError, IndexError):
            continue
    return f"DN-{pid:03d}-{max_seq+1:04d}"

@dispatch_bp.route("/<int:pid>", methods=["GET"])
@jwt_required()
def list_dispatches(pid):
    dns = DispatchNote.query.filter_by(project_id=pid).order_by(DispatchNote.created_at.desc()).all()
    return jsonify([d.to_dict() for d in dns])

@dispatch_bp.route("/<int:pid>", methods=["POST"])
@jwt_required()
def create_dispatch(pid):
    data = request.get_json()
    project = Project.query.get_or_404(pid)

    max_attempts = 5
    dn = None
    for attempt in range(max_attempts):
        dn = DispatchNote(
            project_id=pid,
            dn_number=next_dn_number(pid),
            dispatch_date=date.fromisoformat(data["dispatch_date"]),
            boq_item_id=data["boq_item_id"],
            qty_dispatched=data["qty_dispatched"],
            site_destination=data.get("site_destination",""),
            vehicle_no=data.get("vehicle_no",""),
            driver_name=data.get("driver_name",""),
            lr_number=data.get("lr_number",""),
            bc_challan_no=data.get("bc_challan_no",""),
            bc_invoice_no=data.get("bc_invoice_no",""),
            eway_bill_no=data.get("eway_bill_no",""),
            remarks=data.get("remarks",""),
            created_by=int(get_jwt_identity())
        )
        db.session.add(dn)
        try:
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            if attempt == max_attempts - 1:
                return jsonify({"error": "Could not generate a unique DN number — please retry"}), 500
            continue

    # Store values before session expires
    dn_id      = dn.id
    dn_number  = dn.dn_number
    dn_date    = dn.dispatch_date.isoformat()
    qty        = float(dn.qty_dispatched)
    # Send email notification
    try:
        notify_dispatch_created(dn, project)
    except Exception as e:
        print(f"Notify error: {e}")
    # Return simple safe response — no relationship access
    return jsonify({
        "id": dn_id,
        "dn_number": dn_number,
        "dispatch_date": dn_date,
        "qty_dispatched": qty,
        "boq_item_id": data["boq_item_id"],
        "project_id": pid,
        "invoice_status": "pending",
        "site_destination": data.get("site_destination",""),
        "vehicle_no": data.get("vehicle_no",""),
        "driver_name": data.get("driver_name",""),
        "lr_number": data.get("lr_number",""),
        "bc_challan_no": data.get("bc_challan_no",""),
        "bc_invoice_no": data.get("bc_invoice_no",""),
        "eway_bill_no": data.get("eway_bill_no",""),
        "remarks": data.get("remarks",""),
    }), 201

@dispatch_bp.route("/<int:did>/delete", methods=["DELETE"])
@jwt_required()
def delete_dispatch(did):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    dn = DispatchNote.query.get_or_404(did)
    dn_number = dn.dn_number
    db.session.delete(dn)
    db.session.commit()
    return jsonify({"message": f"Dispatch {dn_number} deleted"})

@dispatch_bp.route("/pending-invoice/<int:pid>", methods=["GET"])
@jwt_required()
def pending_invoice(pid):
    dns = DispatchNote.query.filter_by(project_id=pid, invoice_status="pending").all()
    return jsonify([d.to_dict() for d in dns])

@dispatch_bp.route("/<int:did>/mark-invoiced", methods=["PUT"])
@jwt_required()
def mark_invoiced(did):
    dn = DispatchNote.query.get_or_404(did)
    dn.invoice_status = "invoiced"
    db.session.commit()
    return jsonify(dn.to_dict())

# ── Site Progress ─────────────────────────────────────────────────────────────

site_bp = Blueprint("site", __name__)

@site_bp.route("/<int:pid>", methods=["GET"])
@jwt_required()
def list_progress(pid):
    boq = BOQItem.query.filter_by(project_id=pid, is_active=True)\
                        .order_by(BOQItem.sort_order).all()
    result = []
    for item in boq:
        entries = SiteProgress.query.filter_by(project_id=pid, boq_item_id=item.id)\
                                    .order_by(SiteProgress.progress_date.desc()).all()
        total_inst = sum(float(e.qty_installed) for e in entries)
        total_comm = sum(float(e.qty_commissioned) for e in entries)
        result.append({
            **item.to_dict(),
            "total_installed": total_inst,
            "total_commissioned": total_comm,
            "pct_installed": round(total_inst / float(item.po_qty) * 100, 1) if float(item.po_qty) else 0,
            "pct_commissioned": round(total_comm / float(item.po_qty) * 100, 1) if float(item.po_qty) else 0,
            "history": [e.to_dict() for e in entries[:5]],
        })
    return jsonify(result)

@site_bp.route("/<int:pid>/update", methods=["POST"])
@jwt_required()
def update_progress(pid):
    data = request.get_json()
    project = Project.query.get_or_404(pid)
    user = current_user()
    updates = data.get("updates", [])
    count = 0
    for upd in updates:
        if upd.get("qty_installed", 0) == 0 and upd.get("qty_commissioned", 0) == 0:
            continue
        sp = SiteProgress(
            project_id=pid,
            boq_item_id=upd["boq_item_id"],
            progress_date=date.fromisoformat(upd.get("progress_date", date.today().isoformat())),
            qty_installed=upd.get("qty_installed", 0),
            qty_commissioned=upd.get("qty_commissioned", 0),
            notes=upd.get("notes", ""),
            updated_by=user.id
        )
        db.session.add(sp); count += 1
    db.session.commit()
    if count > 0:
        try: notify_progress_updated(project, user.name, count)
        except Exception as e: print(f"Notify error: {e}")
    return jsonify({"message": f"{count} items updated"})

@site_bp.route("/entry/<int:eid>", methods=["PUT"])
@jwt_required()
def update_progress_entry(eid):
    """Admin-only: correct a previously logged site progress entry."""
    err = admin_required()
    if err: return err
    entry = SiteProgress.query.get_or_404(eid)
    data = request.get_json()
    if "qty_installed" in data:
        entry.qty_installed = data["qty_installed"]
    if "qty_commissioned" in data:
        entry.qty_commissioned = data["qty_commissioned"]
    if "progress_date" in data and data["progress_date"]:
        entry.progress_date = date.fromisoformat(data["progress_date"])
    if "notes" in data:
        entry.notes = data["notes"]
    db.session.commit()
    return jsonify(entry.to_dict())

@site_bp.route("/entries/<int:pid>/<int:boq_item_id>", methods=["GET"])
@jwt_required()
def list_progress_entries(pid, boq_item_id):
    """Full entry history for one BOQ item (used by admin edit UI)."""
    entries = SiteProgress.query.filter_by(
        project_id=pid, boq_item_id=boq_item_id
    ).order_by(SiteProgress.progress_date.desc(), SiteProgress.id.desc()).all()
    return jsonify([e.to_dict() for e in entries])

# ── Notifications ─────────────────────────────────────────────────────────────

notif_bp = Blueprint("notifications", __name__)

@notif_bp.route("/", methods=["GET"])
@jwt_required()
def list_notifs():
    uid = int(get_jwt_identity())
    pid = request.args.get("project_id")
    q = Notification.query.filter_by(user_id=uid)
    if pid: q = q.filter_by(project_id=int(pid))
    notifs = q.order_by(Notification.created_at.desc()).limit(50).all()
    return jsonify([n.to_dict() for n in notifs])

@notif_bp.route("/<int:nid>/read", methods=["PUT"])
@jwt_required()
def mark_read(nid):
    n = Notification.query.get_or_404(nid)
    n.is_read = True; db.session.commit()
    return jsonify(n.to_dict())

@notif_bp.route("/read-all", methods=["PUT"])
@jwt_required()
def mark_all_read():
    uid = int(get_jwt_identity())
    Notification.query.filter_by(user_id=uid, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All marked read"})
