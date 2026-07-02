"""
migrate.py — run once to add new columns to existing tables.
Safe to run multiple times (uses IF NOT EXISTS).

Render start command (temporarily):
  python migrate.py && gunicorn app:app --workers 1 --bind 0.0.0.0:10000

Revert after successful deploy:
  gunicorn app:app --workers 1 --bind 0.0.0.0:10000
"""
from app import create_app
from extensions import db

def run():
    app = create_app()
    with app.app_context():
        conn = db.engine.connect()
        migrations = [
            # Project type
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(20) DEFAULT 'work_contract'",
            # BOQ HSN code
            "ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20)",
            # GRN HSN code
            "ALTER TABLE grns ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20)",
            # Dispatch BC fields
            "ALTER TABLE dispatch_notes ADD COLUMN IF NOT EXISTS bc_challan_no VARCHAR(50)",
            "ALTER TABLE dispatch_notes ADD COLUMN IF NOT EXISTS bc_invoice_no VARCHAR(50)",
            "ALTER TABLE dispatch_notes ADD COLUMN IF NOT EXISTS eway_bill_no VARCHAR(50)",
        ]
        for sql in migrations:
            try:
                conn.execute(db.text(sql))
                conn.commit()
                print(f"OK: {sql[:60]}...")
            except Exception as e:
                print(f"SKIP (already exists or error): {e}")
        conn.close()
        print("Migration complete.")

if __name__ == "__main__":
    run()
