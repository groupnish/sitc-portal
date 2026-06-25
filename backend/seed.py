"""
Run once to bootstrap:  python seed.py
Creates admin user + BEIL WO-249 project with all 97 BOQ items.
"""
from app import create_app
from extensions import db
from models.models import User, Project, BOQItem
from datetime import date

app = create_app()

BEIL_BOQ = [
    # (sr_no, description_short, po_qty, unit, rate, site_zone, item_type)
    ("S-1",  "Two Pole structure — 11KV outdoor substation", 1, "Nos.", 301900, "MPS SITE", "supply"),
    ("S-2",  "11 KV Gang Operated Disconnecting Switch 400A", 1, "Nos.", 76080, "MPS SITE", "supply"),
    ("S-3",  "Horn Gap Fuses 11KV 400A 250MVA", 4, "Nos.", 9060, "MPS SITE", "supply"),
    ("S-4",  "Lightning Arrestors 11KV 9KA valve type", 4, "Nos.", 29120, "MPS SITE", "supply"),
    ("S-5",  "11 KV HT Metering Cubicle 3CT & 3PT KPTCL approved", 1, "Nos.", 295100, "MPS SITE", "supply"),
    ("S-6",  "11KV Switchgear Panel (1×800A VCB + 5×630A VCB)", 1, "Nos.", 4212000, "MPS SITE", "supply"),
    ("S-7",  "Annunciator Panel (microprocessor based)", 1, "Nos.", 0, "MPS SITE", "supply"),
    ("S-8",  "70 KVAR 11KV 3PH Fixed Capacitor Panel", 4, "Nos.", 297250, "MPS SITE", "supply"),
    ("S-9",  "5 KVAR 11KV 3PH Fixed Capacitor Panel", 1, "Nos.", 290000, "MPS SITE", "supply"),
    ("S-10", "Temperature Scanner Panel 12-channel wall mounted", 1, "Nos.", 192670, "MPS SITE", "supply"),
    ("S-11", "63 KVA Copper wound Distribution Transformer 11KV/433V", 1, "Nos.", 506110, "MPS SITE", "supply"),
    ("S-12", "3.3 kV Capacitor Cubicle 125 KVAR for 230KW motor", 8, "Nos.", 408250, "MPS SITE", "supply"),
    ("S-13", "Control Panel Board Unit — LT floor mounting cubicle", 1, "Nos.", 121200, "MPS SITE", "supply"),
    ("S-14", "11 kV 3C 95 sqmm cable termination", 26, "Nos.", 11180, "MPS SITE", "supply"),
    ("S-15", "3.3 kV 3C 150 sqmm cable termination", 24, "Nos.", 17690, "MPS SITE", "supply"),
    ("S-16", "3.3 kV 3C 95 sqmm cable termination", 24, "Nos.", 16410, "MPS SITE", "supply"),
    ("S-17", "3.3 kV 3C 25 sqmm cable termination", 16, "Nos.", 15750, "MPS SITE", "supply"),
    ("S-18", "Cable termination 70 sqmm Al/Cu lugs (5 run)", 40, "Nos.", 990, "MPS SITE", "supply"),
    ("S-19", "Cable termination 400 sqmm (2 run)", 20, "Nos.", 3460, "MPS SITE", "supply"),
    ("S-20", "3.5 × 25 sqmm AL ARM cable termination", 4, "Nos.", 870, "MPS SITE", "supply"),
    ("S-21", "3 × 16 sqmm AL ARM cable termination", 10, "Nos.", 560, "MPS SITE", "supply"),
    ("S-22", "6C × 2.5 sqmm 1.1kV CU armoured cable termination", 46, "Nos.", 810, "MPS SITE", "supply"),
    ("S-23", "3C × 1.5 sqmm 1.1kV CU flexible cable termination", 10, "Nos.", 480, "MPS SITE", "supply"),
    ("S-24", "Structural steel for tray & panel base frame", 2, "Ton", 148500, "MPS SITE", "supply"),
    ("S-25", "Earthing — Maintenance free 80mm dia GI pipe earth pit", 6, "Nos.", 30920, "MPS SITE", "supply"),
    ("S-26", "Earthing — Maintenance free 50mm dia GI pipe earth pit", 20, "Nos.", 26600, "MPS SITE", "supply"),
    ("S-27", "Earthing — Maintenance free 50mm dia CU pipe earth pit", 20, "Nos.", 4250, "MPS SITE", "supply"),
    ("S-28", "25 × 6 mm Copper strip grounding", 100, "Mtr.", 1820, "MPS SITE", "supply"),
    ("S-29", "50 × 6 mm CU copper strip grounding", 200, "Mtr.", 3830, "MPS SITE", "supply"),
    ("S-30", "50 × 6 mm GI strip grounding", 400, "Mtr.", 400, "MPS SITE", "supply"),
    ("S-31", "8 SWG GI wire grounding", 200, "Mtr.", 70, "MPS SITE", "supply"),
    ("S-32", "20mm dia PVC conduit for generator/transformer room", 40, "Mtr.", 110, "MPS SITE", "supply"),
    ("S-33", "Loop wiring 2×1.5 sqmm copper — medium point", 4, "Nos.", 790, "MPS SITE", "supply"),
    ("S-34", "Loop wiring — long point above 6 mtrs", 8, "Nos.", 1290, "MPS SITE", "supply"),
    ("S-35", "6A flush socket with SP switch", 6, "Nos.", 400, "MPS SITE", "supply"),
    ("S-36", "Wiring 2×4 sqmm + 1×1.5 sqmm Cu lighting power circuit", 50, "Mtr.", 540, "MPS SITE", "supply"),
    ("S-37", "Polished wood board 10×8×1.5 inch", 2, "Nos.", 970, "MPS SITE", "supply"),
    ("S-38", "Polished wood board 20×20×2.5 inch", 1, "Nos.", 1110, "MPS SITE", "supply"),
    ("S-39", "16A porcelain fuse channel on wooden board", 2, "Nos.", 590, "MPS SITE", "supply"),
    ("S-40", "DP MCB supply and fixing", 1, "Nos.", 870, "MPS SITE", "supply"),
    ("S-41", "PBBC Bakelite batten holder 60W 230V", 1, "Nos.", 870, "MPS SITE", "supply"),
    ("S-42", "230V bell/buzzer with flush bell push", 1, "Nos.", 1080, "MPS SITE", "supply"),
    ("S-43", "Aluminium bulk head fitting with GI guard 15W CFL", 2, "Nos.", 510, "MPS SITE", "supply"),
    ("S-44", "1200mm ceiling fan sweep", 2, "Nos.", 2100, "MPS SITE", "supply"),
    ("S-45", "Fan regulator", 2, "Nos.", 1160, "MPS SITE", "supply"),
    ("S-46", "300mm dia exhaust fan sweep", 4, "Nos.", 2000, "MPS SITE", "supply"),
    ("S-47", "Fixing exhaust fan in wall niche with accessories", 4, "Nos.", 1440, "MPS SITE", "supply"),
    ("S-48", "1×36/40W fluorescent fitting complete with lamp", 22, "Nos.", 3450, "MPS SITE", "supply"),
    ("S-49", "Fixing 1×36/40W fluorescent tube on wall/ceiling", 22, "Nos.", 1010, "MPS SITE", "supply"),
    ("S-50", "Lighting DB (RCCB incomer + MCB outgoing)", 4, "Nos.", 35950, "MPS SITE", "supply"),
    ("S-51", "Street light pole MS 7.5 mtr sp-5", 4, "Nos.", 19780, "MPS SITE", "supply"),
    ("S-52", "Street light fitting 70W LED", 7, "Nos.", 4640, "MPS SITE", "supply"),
    ("S-53", "Fire bucket GI sheet 9 litres", 8, "Nos.", 830, "MPS SITE", "supply"),
    ("S-54", "Sand bucket set (4 buckets)", 1, "Nos.", 3240, "MPS SITE", "supply"),
    ("S-55", "Rubber mat 1M×2M 10mm thick LT grade", 10, "Nos.", 5790, "MPS SITE", "supply"),
    ("S-56", "Rubber mat 1M×2M 12mm thick HT grade", 4, "Nos.", 7220, "MPS SITE", "supply"),
    ("S-57", "Fire extinguisher CO2 type 4.5 litres", 8, "Nos.", 6080, "MPS SITE", "supply"),
    ("S-58", "Laminated shock treatment chart", 2, "Nos.", 1370, "MPS SITE", "supply"),
    ("S-59", "11KV grade hand gloves jointless", 2, "Nos.", 870, "MPS SITE", "supply"),
    ("S-60", "First aid box with kit", 2, "Nos.", 2860, "MPS SITE", "supply"),
    ("S-61", "Enamel danger boards 11kV/3.3kV/415V", 4, "Nos.", 940, "MPS SITE", "supply"),
    ("S-62", "Liaoning with electricity board & electrical inspector", 1, "Job", 143780, "MPS SITE", "supply"),
    ("S-63", "Soil resistivity report for earthing from govt. lab", 1, "Job", 28760, "MPS SITE", "supply"),
    ("S-64", "DP Structure — STP Site", 1, "Nos.", 464350, "STP SITE", "supply"),
    ("S-65", "Metering Panel — STP Site", 1, "Nos.", 786000, "STP SITE", "supply"),
    ("S-66", "LPBS — STP Site", 1, "Set", 15000, "STP SITE", "supply"),
    ("S-67", "Safety Equipments — STP Site", 1, "LS", 94720, "STP SITE", "supply"),
    ("S-68", "Liaoning — STP Site", 1, "LS", 110600, "STP SITE", "supply"),
    ("S-69", "11 KV HT Metering Cubicle KPTCL approved — SPS Site", 1, "Nos.", 328760, "SPS SITE", "supply"),
    ("S-70", "200 KVA Transformer 11000/430V 3Ph DYn11 — SPS Site", 1, "Nos.", 940100, "SPS SITE", "supply"),
    ("S-71", "Transformer sub-station erection double pole struct.", 2, "Nos.", 59730, "SPS SITE", "supply"),
    ("S-72", "Control Panel KUWSDB cubicle type — SPS Site", 1, "Nos.", 548910, "SPS SITE", "supply"),
    ("S-73", "70 KVAR Power shunt capacitor — SPS Site", 1, "NO.", 187090, "SPS SITE", "supply"),
    ("S-74", "3½×95 sqmm LT UG cable termination — SPS Site", 4, "Nos.", 1940, "SPS SITE", "supply"),
    ("S-75", "3.5×25 sqmm AL ARM cable — SPS Site", 12, "Nos.", 910, "SPS SITE", "supply"),
    ("S-76", "3×16 sqmm AL ARM cable — SPS Site", 10, "Nos.", 580, "SPS SITE", "supply"),
    ("S-77", "7C×1.5 sqmm 1.1kV CU armoured cable — SPS Site", 12, "Nos.", 840, "SPS SITE", "supply"),
    ("S-78", "3C×1.5 sqmm 1.1kV CU flexible cable — SPS Site", 12, "Nos.", 500, "SPS SITE", "supply"),
    ("S-79", "Structural steel for tray & panel base frame — SPS", 1, "Ton", 152460, "SPS SITE", "supply"),
    ("S-80", "Earthing 40mm GI pipe 2.5m with CC chamber — SPS", 10, "Nos.", 30920, "SPS SITE", "supply"),
    ("S-81", "Earthing 40mm GI pipe 2.5m in pit — SPS", 4, "Nos.", 4250, "SPS SITE", "supply"),
    ("S-82", "Earthing 40mm CU pipe 2.5m in pit — SPS", 4, "Nos.", 4250, "SPS SITE", "supply"),
    ("S-83", "25×6mm Copper strip grounding — SPS", 100, "Mtr.", 1820, "SPS SITE", "supply"),
    ("S-84", "25×6mm GI strip grounding — SPS", 60, "Mtr.", 250, "SPS SITE", "supply"),
    ("S-85", "50×6mm GI strip grounding — SPS", 150, "Mtr.", 400, "SPS SITE", "supply"),
    ("S-86", "600×600×3mm Copper plate — SPS", 4, "Mtr.", 12950, "SPS SITE", "supply"),
    ("S-87", "8 SWG GI wire — SPS", 200, "Mtr.", 70, "SPS SITE", "supply"),
    ("S-88", "20mm PVC conduit concealed in slab — SPS", 50, "Mtr.", 130, "SPS SITE", "supply"),
    ("S-89", "Point wiring short point upto 3m copper — SPS", 3, "Nos.", 530, "SPS SITE", "supply"),
    ("S-90", "Point wiring medium point 3–6m copper — SPS", 5, "Nos.", 720, "SPS SITE", "supply"),
    ("S-91", "Point wiring long point 6–10m copper — SPS", 3, "Nos.", 500, "SPS SITE", "supply"),
    ("S-92", "2-way 6A flush switch mounted on gang box — SPS", 2, "Nos.", 350, "SPS SITE", "supply"),
    ("S-93", "16A flush SP switch — SPS", 1, "Nos.", 280, "SPS SITE", "supply"),
    ("S-94", "16A flush universal socket — SPS", 1, "Nos.", 320, "SPS SITE", "supply"),
    ("S-95", "Sheet metal box 200×200×65mm — SPS", 4, "Nos.", 480, "SPS SITE", "supply"),
    ("S-96", "Sheet metal box 135×75×65mm — SPS", 4, "Nos.", 380, "SPS SITE", "supply"),
    ("S-97", "4mm plastic sheet with niches for switches — SPS", 50, "Mtr.", 120, "SPS SITE", "supply"),
]

with app.app_context():
    db.create_all()

    # Admin user
    if not User.query.filter_by(email="admin@company.com").first():
        admin = User(name="Admin User", email="admin@company.com", role="admin",
                     phone_whatsapp="+919999999999")
        admin.set_password("Admin@1234")
        db.session.add(admin)
        print("Admin created: admin@company.com / Admin@1234")

    # Sample users
    sample_users = [
        ("SCM User", "scm@company.com", "scm", "+919111111111"),
        ("Accounts User", "accounts@company.com", "accounts", "+919222222222"),
        ("Site Engineer", "site@company.com", "site", "+919333333333"),
        ("Management", "mgmt@company.com", "management", "+919444444444"),
    ]
    for name, email, role, phone in sample_users:
        if not User.query.filter_by(email=email).first():
            u = User(name=name, email=email, role=role, phone_whatsapp=phone)
            u.set_password("Pass@1234")
            db.session.add(u)
            print(f"User created: {email} / Pass@1234")

    db.session.commit()

    # BEIL Project
    if not Project.query.filter_by(code="BEIL-WO249").first():
        project = Project(
            code="BEIL-WO249",
            name="70 MLD STP Belagavi — E&I Package",
            client_name="BEIL Infrastructure Limited",
            client_address="70 MLD STP Halaga, Near NH-4 Service Road, Halaga, Belagavi - 590020, Karnataka",
            client_gstin="29AAACB8075F1ZK",
            client_pan="AAACB8075F",
            seller_name="Nish Techno Projects Private Limited",
            seller_address="C-20/2, Hojiwala Industrial Estate, Road No-15, Near G.N. Flour Mill, Sachin-Palsana Road, Sachin, Surat - 394230, Gujarat",
            seller_gstin="24AAGCS2925K1Z9",
            seller_pan="AAGCS2925K",
            wo_number="STP BELAGAVI 70 MLD/Elect/W/249/Amd-3",
            wo_date=date(2026, 5, 15),
            wo_value=24181612,
            amendment_no="Amd-3",
            place_of_supply="KARNATAKA (29)",
            hsn_sac_code="9954",
            site_name="BEIL Infrastructure Limited — 70 MLD STP",
            site_address="Halga Village, Yedurappa Road, Nr. Alarwad Bridge, Near NH-4 Service Road, Belagavi-590020, Karnataka",
            igst_rate=18,
            cgst_rate=0,
            sgst_rate=0,
            pt_advance_pct=20,
            pt_lc_pct=80,
            pt_installation_pct=80,
            pt_commissioning_pct=20,
            pt_retention_pct=0,
            pt_ld_pct=0.5,
            pt_notes="Part-1: 20% advance + 80% through 60-days usance LC from shipment. Part-2: 80% on installation + 20% on commissioning, pro-rata, 15 days from RA certification.",
            advance_received_incl_gst=4751482.40,
            invoice_prefix="NT/WC/2627",
            current_ra_no=1,
        )
        db.session.add(project)
        db.session.flush()

        for i, (sr, desc, qty, unit, rate, zone, itype) in enumerate(BEIL_BOQ):
            item = BOQItem(
                project_id=project.id,
                sr_no=sr, description=desc, po_qty=qty,
                unit=unit, rate=rate, amount=qty*rate,
                site_zone=zone, item_type=itype, sort_order=i
            )
            db.session.add(item)

        db.session.commit()
        print(f"BEIL project created with {len(BEIL_BOQ)} BOQ items")
    else:
        print("BEIL project already exists")

print("\nSeed complete. Run: python app.py")
