"""
seed_reconciliation.py
Run ONCE to load the reconciliation data from RA Billing Master into the DB.
Usage: python seed_reconciliation.py
Add temporarily to Render start command:
  python seed_reconciliation.py && gunicorn app:app --workers 1 --bind 0.0.0.0:10000
"""
from app import create_app
from extensions import db
from models.models import Project, ReconciliationItem

RECON_DATA = [
    # (site, old_sr, description, old_rate, old_qty, billed_supply, billed_install, billed_comm, disposition)
    ("STP SITE","1","DP STRUCTURE",357191,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("STP SITE","2","11 KV VCB PANEL ( 1 I/C + 2 O/G )",1788402,1,1609561.8,89420.1,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","3","METERING PANEL",210140,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("STP SITE","4","TRANSFORMER 1600 Kva (1W+1S)",10002243,1,9002018.70,500112.15,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","5","DG set (750 Kva*2)",11192720,0,0,0,0,"DESCOPED (old WO Amd)"),
    ("STP SITE","6","BUS DUCT",452054,1,406848.6,22602.7,22602.7,"Closed — fully billed under old WO"),
    ("STP SITE","7.1","PCC+AFPC",2898284,1,2608455.6,144914.20,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","7.2","MCC-1",3826541,1,3443886.9,191327.05,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","7.3","MCC-2",668882,1,601993.80,33444.1,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","7.4","MLP",58190,1,52371,2909.5,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","8","LPBS",6396,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("STP SITE","9","CABLE",4057925,1,3652132.5,202896.25,202896.25,"Closed — fully billed under old WO"),
    ("STP SITE","10","CABLE TRAY & SUPPORTS",1500970,1,1350873,75048.5,75048.5,"Closed — fully billed under old WO"),
    ("STP SITE","11","CABLE TERMINATION",196235,1,176611.5,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","12","LIGHTING",1460234,1,1314210.60,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","13","EARTHING",1083377,1,975039.3,54168.85,54168.85,"Closed — fully billed under old WO"),
    ("STP SITE","14","STRUCTURAL STEEL",663600,1,597240,7963.2,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","15","SAFETY EQUIPMENTS",70161,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("STP SITE","16","LIASONING",110600,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("STP SITE","17","Soil resistivity TEST",22120,1,19908,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I1","Clamp on Type Ultrasonic Flow meter - 1200mm",374577,1,337119.3,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I2","Clamp on Type Ultrasonic Flow meter - 250mm",291674,1,262506.60,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I3","Differential Level Transmitter 0-8m",129508,2,233114.4,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I4","Ultrasonic Level Transmitter 0-8m",79573,1,71615.7,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I5","Ultrasonic Level Transmitter 0-8m (2)",79573,1,71615.7,0,0,"Closed — fully billed under old WO"),
    ("STP SITE","STP-I6","Chlorine Analyzer",205340,1,184806,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I7","DO Analyzer",288290,4,1037844,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I8","Hydrostatic Level Transmitter",107526,4,387093.6,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I9","Pressure Transmitter",28671,8,206431.2,11468.4,11468.4,"Closed — fully billed under old WO"),
    ("STP SITE","STP-I10","Pressure Gauge",4701,12,50770.8,0,0,"Pending I&C re-priced → Part 2"),
    ("STP SITE","STP-I11","PLC/SCADA",3349741,1,3014766.9,167487.05,0,"Pending I&C re-priced → Part 2"),
    ("SPS SITE","1.1","SITC 11 KV HT metering cubicle (KPTCL)",226730,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","2.1","SITC Transformer 200KVA 11000/430V",553000,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","3","Erection of Transformer Sub-Station",49770,2,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","4","DG SET",1493100,0,0,0,0,"DESCOPED (old WO Amd)"),
    ("SPS SITE","5.1","Control panel KUWSDB floor mounting",422236,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","6","Power shunt capacitor 70 KVAR",143911,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","7.1","11 KV XLPE Cable 3x95 sqmm (100m)",1067,100,96030,5335,5335,"Closed — fully billed under old WO"),
    ("SPS SITE","7.2","Main side cable 3.5x95 sqmm",673,160,96912,5384,5384,"Closed — fully billed under old WO"),
    ("SPS SITE","7.3","Load side cable AL ARM",401,160,57744,3208,3208,"Closed — fully billed under old WO"),
    ("SPS SITE","7.4","3.5x25 sqmm AL ARM cable",231,200,41580,2310,2310,"Closed — fully billed under old WO"),
    ("SPS SITE","7.5","3x16 sqmm AL ARM cable",157,300,42390,2355,2355,"Closed — fully billed under old WO"),
    ("SPS SITE","7.6","7cx1.5 sqmm 1.1kV cu arm cable",180,150,24300,1350,1350,"Closed — fully billed under old WO"),
    ("SPS SITE","7.7","3cx1.5 sqmm 1.1kV cu flexible cable",54,100,4860,270,270,"Closed — fully billed under old WO"),
    ("SPS SITE","8.1","Main side cable 3.5x95 sqmm (balance)",1486,4,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","8.2","3.5x25 sqmm AL ARM cable (balance)",694,12,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","8.3","3x16 sqmm AL ARM cable (balance)",444,10,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","9.5","Structural steel for tray & panel base frame",132720,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","10.1","Earthing GI pipe 40mm dia 2.5m (SPS)",23779,10,0,0,0,"Balance supply re-priced → Part 1"),
    ("SPS SITE","11.29","Street light fitting 70W LED",3567,4,12841.2,0,0,"Pending I&C re-priced → Part 2"),
    ("MPS SITE","1","Two Pole structure 11KV outdoor substation",201263,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("MPS SITE","2","11 KV HT metering cubicle (KPTCL)",226730,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("MPS SITE","3","11KV Switchgear Panel (1x800A VCB + 5x630A VCB)",3167584,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("MPS SITE","3.1","ANNUNCIATOR PANEL (microprocessor based)",0,1,0,0,0,"Not in new PO — confirm with BEIL"),
    ("MPS SITE","3.2","Temperature Scanner Panel 12-channel",148204,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("MPS SITE","4","Batteries, Battery Charger & DCDB 110V 200AH",1183420,1,1065078,0,0,"Pending I&C re-priced → Part 2"),
    ("MPS SITE","5","Transformer 1000KVA 11/3.3kV DYn11 (x4)",2317375,4,8342550,0,0,"Pending I&C re-priced → Part 2"),
    ("MPS SITE","6","63KVA Distribution Transformer 11KV/433V",389312,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("MPS SITE","7.1","DG Set (Generator — Descoped)",8836940,0,0,0,0,"DESCOPED (old WO Amd)"),
    ("MPS SITE","8","3.3KV Transformer Secondary Control Switchgear (x2)",3995978,2,7192760.40,399597.8,399597.8,"Closed — fully billed under old WO"),
    ("MPS SITE","8.1","Capacitor Cubicle 3.3kV 125KVAR (x8)",322241,8,0,0,0,"Balance supply re-priced → Part 1"),
    ("MPS SITE","9","Flux Compensated Magnetic Amplifier Soft Starters 350HP 3.3KV (x8)",566272,8,4077158.40,0,0,"Pending I&C re-priced → Part 2"),
    ("MPS SITE","10.1","Control panel board KUWSDB (1 No.)",93227,1,0,0,0,"Balance supply re-priced → Part 1"),
    ("MPS SITE","11","11KV XLPE Cable 3x95 sqmm (400m)",1108,400,398880,22160,22160,"Closed — fully billed under old WO"),
    ("MPS SITE","11.1","3.3kV Class Cable 3x150 sqmm (500m)",1216,500,547200,30400,30400,"Closed — fully billed under old WO"),
    ("MPS SITE","11.2","3x95 sqmm cable for motors (200m)",970,200,174600,9700,9700,"Closed — fully billed under old WO"),
    ("MPS SITE","11.3","3x25 sqmm cable for capacitor cubicle (200m)",626,200,112680,6260,6260,"Closed — fully billed under old WO"),
]

def seed():
    app = create_app()
    with app.app_context():
        project = Project.query.filter_by(code="J-2209").first()
        if not project:
            print("ERROR: Project J-2209 not found. Run seed.py first.")
            return

        # Clear existing reconciliation data for this project
        ReconciliationItem.query.filter_by(project_id=project.id).delete()
        db.session.commit()

        for site, old_sr, desc, old_rate, old_qty, b_sup, b_ins, b_com, disp in RECON_DATA:
            total = b_sup + b_ins + b_com
            item = ReconciliationItem(
                project_id=project.id,
                site=site, old_sr=str(old_sr), description=desc,
                old_rate=old_rate, old_qty=old_qty,
                billed_supply=b_sup, billed_install=b_ins, billed_comm=b_com,
                total_billed=total, disposition=disp,
            )
            db.session.add(item)

        db.session.commit()
        print(f"Seeded {len(RECON_DATA)} reconciliation items for project {project.code}")
        total_old = sum(r[5]+r[6]+r[7] for r in RECON_DATA)
        print(f"Total old WO billed: Rs. {total_old:,.2f}")

if __name__ == "__main__":
    seed()
