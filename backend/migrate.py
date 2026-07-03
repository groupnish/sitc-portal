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
            # PO Invoice tables (created via SQLAlchemy create_all)
            "CREATE TABLE IF NOT EXISTS po_invoices (id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id), invoice_no VARCHAR(100) NOT NULL, invoice_date DATE NOT NULL, subtotal NUMERIC(14,2) DEFAULT 0, igst_amount NUMERIC(14,2) DEFAULT 0, cgst_amount NUMERIC(14,2) DEFAULT 0, sgst_amount NUMERIC(14,2) DEFAULT 0, gross_total NUMERIC(14,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'draft', notes TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS po_invoice_items (id SERIAL PRIMARY KEY, po_invoice_id INTEGER REFERENCES po_invoices(id), dn_id INTEGER REFERENCES dispatch_notes(id), boq_item_id INTEGER REFERENCES boq_items(id), qty NUMERIC(12,3) DEFAULT 0, rate NUMERIC(14,2) DEFAULT 0, amount NUMERIC(14,2) DEFAULT 0, hsn_code VARCHAR(20))",
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
