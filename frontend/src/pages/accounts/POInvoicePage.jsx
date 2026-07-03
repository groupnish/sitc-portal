// POInvoicePage.jsx — Purchase Order item-wise Tax Invoice
// For projects with project_type === 'purchase_order'
// Invoice items are selected from the Dispatch / Outward list
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ra, dispatch } from '../../services/api'
import toast from 'react-hot-toast'

const fmt = n => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function POInvoicePage() {
  const { activeProject, user } = useAuth()
  const isAdmin     = user?.role === 'admin'
  const isAccounts  = user?.role === 'accounts'
  const canAct      = isAdmin || isAccounts

  const [dnList, setDnList]           = useState([])
  const [selected, setSelected]       = useState({})   // { dn_id: true }
  const [invoiceNo, setInvoiceNo]     = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [poInvoices, setPoInvoices]   = useState([])   // saved PO invoices

  useEffect(() => {
    if (!activeProject) return
    load()
  }, [activeProject])

  const load = async () => {
    setLoading(true)
    try {
      const [dnRes, invRes] = await Promise.all([
        dispatch.list(activeProject.id),
        ra.listPOInvoices(activeProject.id),
      ])
      setDnList(dnRes.data)
      setPoInvoices(invRes.data)
    } catch { toast.error('Could not load data') }
    finally { setLoading(false) }
  }

  const toggleSelect = (id) => {
    setSelected(s => ({ ...s, [id]: !s[id] }))
  }

  const selectedDNs   = dnList.filter(d => selected[d.id])
  const subtotal      = selectedDNs.reduce((a, d) => a + Number(d.amount), 0)
  const igst          = subtotal * 0.18
  const gross         = subtotal + igst

  const validate = () => {
    if (!invoiceNo.trim()) { toast.error('Invoice number is required'); return false }
    if (selectedDNs.length === 0) { toast.error('Select at least one dispatch item'); return false }
    return true
  }

  const generateInvoice = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const res = await ra.savePOInvoice(activeProject.id, {
        invoice_no:   invoiceNo,
        invoice_date: invoiceDate,
        dn_ids:       selectedDNs.map(d => d.id),
        subtotal,
        igst_amount:  igst,
        gross_total:  gross,
      })
      toast.success(`PO Invoice ${invoiceNo} saved`)
      setSelected({})
      setInvoiceNo('')
      // Auto-download PDF
      downloadPDF(res.data.id)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error saving invoice')
    } finally { setSaving(false) }
  }

  const deletePOInvoice = async (inv) => {
    if (!confirm(`Delete Invoice ${inv.invoice_no}? Dispatch items will be marked pending again.`)) return
    try {
      await ra.deletePOInvoice(inv.id)
      toast.success(`Invoice ${inv.invoice_no} deleted`)
      load()
    } catch(e) { toast.error(e.response?.data?.error || 'Delete failed') }
  }

  const downloadPDF = (invId) => {
    const url = ra.poInvoicePdfUrl(invId)
    const token = localStorage.getItem('access_token')
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob() })
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `POInvoice_${invId}.pdf`
        a.click()
      }).catch(() => toast.error('PDF download failed'))
  }

  // Filter: only show invoiced dispatches separately
  const pendingDNs   = dnList.filter(d => d.invoice_status === 'pending')
  const invoicedDNs  = dnList.filter(d => d.invoice_status === 'invoiced')

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  if (activeProject.project_type !== 'purchase_order') {
    return (
      <div className="alert alert-info" style={{ margin: 24 }}>
        This page is for <strong>Purchase Order</strong> projects only.<br />
        The current project <strong>{activeProject.code}</strong> is a <strong>Work Contract</strong> — use the <strong>RA Bill</strong> page instead.
      </div>
    )
  }

  return (
    <div>
      {/* Company header */}
      <div style={{
        textAlign: 'center', marginBottom: 20, paddingBottom: 16,
        borderBottom: '2px solid var(--teal)',
      }}>
        <img
          src="/sitc-portal/assets/logo_full.png"
          alt="Group Nish"
          style={{ height: 60, marginBottom: 6 }}
          onError={e => { e.target.style.display='none' }}
        />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>
          TAX INVOICE — PURCHASE ORDER
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-s)', marginTop: 2 }}>
          {activeProject?.name} &nbsp;·&nbsp; {activeProject?.client_name}
        </div>
      </div>

      {/* Summary stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Pending items</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingDNs.length}</div>
          <div className="stat-sub">dispatches not yet invoiced</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Selected for invoice</div>
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{selectedDNs.length}</div>
          <div className="stat-sub">Rs. {(subtotal/100000).toFixed(2)}L excl. GST</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Already invoiced</div>
          <div className="stat-value">{invoicedDNs.length}</div>
          <div className="stat-sub">dispatches</div>
        </div>
      </div>

      {/* Invoice generator */}
      {canAct && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Generate PO Invoice — select dispatch items</span>
          </div>
          <div className="card-body">
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Invoice No. *</label>
                <input className="form-input" value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  placeholder={`${activeProject.invoice_prefix || 'INV'}/2627/001`} />
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Date *</label>
                <input className="form-input" type="date" value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)} />
              </div>
            </div>

            <div className="alert alert-info" style={{ marginBottom: 12 }}>
              Select dispatch items below to include in this invoice. Only pending (not yet invoiced) items are shown.
            </div>

            {/* Pending dispatch items for selection */}
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={pendingDNs.length > 0 && pendingDNs.every(d => selected[d.id])}
                        onChange={e => {
                          const next = {}
                          if (e.target.checked) pendingDNs.forEach(d => { next[d.id] = true })
                          setSelected(next)
                        }} />
                    </th>
                    <th>DN No.</th>
                    <th>Date</th>
                    <th>Item No.</th>
                    <th>Description</th>
                    <th>HSN</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Rate (Rs.)</th>
                    <th style={{ textAlign: 'right' }}>Amount (Rs.)</th>
                    <th>Site</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={11} className="empty">Loading…</td></tr>}
                  {!loading && pendingDNs.length === 0 && (
                    <tr><td colSpan={11} className="empty">No pending dispatch items. All dispatches have been invoiced.</td></tr>
                  )}
                  {pendingDNs.map(d => (
                    <tr key={d.id} style={{ background: selected[d.id] ? 'var(--teal-l)' : '' }}>
                      <td>
                        <input type="checkbox" checked={!!selected[d.id]}
                          onChange={() => toggleSelect(d.id)} />
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 12 }}>{d.dn_number}</td>
                      <td style={{ fontSize: 12 }}>{d.dispatch_date}</td>
                      <td style={{ fontWeight: 500, fontSize: 12 }}>{d.boq_item_sr}</td>
                      <td style={{ fontSize: 12, maxWidth: 180 }}>{(d.boq_item_desc || '').substring(0, 60)}</td>
                      <td style={{ fontSize: 11 }}>{d.hsn_code || d.boq_item_hsn || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{d.qty_dispatched}</td>
                      <td style={{ fontSize: 11 }}>{d.unit}</td>
                      <td style={{ textAlign: 'right' }}>{Number(d.boq_item_rate).toLocaleString('en-IN')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>Rs. {Number(d.amount).toLocaleString('en-IN')}</td>
                      <td style={{ fontSize: 11 }}>{d.site_destination}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invoice summary */}
            {selectedDNs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <table style={{ marginLeft: 'auto', width: 320, borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '4px 8px' }}>Subtotal (excl. GST)</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(subtotal)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px 8px' }}>IGST @ 18%</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(igst)}</td>
                    </tr>
                    <tr style={{ background: 'var(--teal-l)', fontWeight: 600 }}>
                      <td style={{ padding: '6px 8px', borderTop: '1px solid var(--border)' }}>Gross Total (incl. GST)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', borderTop: '1px solid var(--border)' }}>{fmt(gross)}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={generateInvoice} disabled={saving}>
                    {saving ? 'Saving…' : `Save & Download Invoice (${selectedDNs.length} items)`}
                  </button>
                  <button className="btn btn-sm" onClick={() => setSelected({})}>Clear selection</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Already invoiced history */}
      {/* Saved PO Invoices register */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">PO Invoice register ({poInvoices.length})</span>
        </div>
        {poInvoices.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>No invoices generated yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice No.</th><th>Date</th><th>Items</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                  <th style={{ textAlign: 'right' }}>GST</th>
                  <th style={{ textAlign: 'right' }}>Gross Total</th>
                  <th>Status</th><th>Download</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {poInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 500 }}>{inv.invoice_no}</td>
                    <td style={{ fontSize: 12 }}>{inv.invoice_date}</td>
                    <td style={{ fontSize: 12 }}>{inv.items?.length || 0} items</td>
                    <td style={{ textAlign: 'right' }}>{fmt(inv.subtotal)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(inv.igst_amount + inv.cgst_amount + inv.sgst_amount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--teal)' }}>{fmt(inv.gross_total)}</td>
                    <td><span className="badge badge-green">{inv.status}</span></td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => downloadPDF(inv.id)}>
                        PDF
                      </button>
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => deletePOInvoice(inv)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
