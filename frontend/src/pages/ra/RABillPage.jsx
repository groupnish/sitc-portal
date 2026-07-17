import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ra, users } from '../../services/api'
import { openWhatsApp, raWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]
const fmt = n => `₹${Number(n).toLocaleString('en-IN', {minimumFractionDigits:2})}`

const pctStr = v => `${Number(v || 0)}%`

const STAGE_LABELS = { supply: 'Supply', erection: 'Installation', commissioning: 'Commissioning' }

// Mirrors the same grouping/stage-expansion logic used in the backend's
// RA Bill PDF/Excel generators (services/export.py) — groups items by Sr.
// No., and expands any item flagged advance_applicable (by compute_ra) into
// separate Advance/Supply sub-rows with their Payment Terms %. Kept as a
// client-side preview only — the actual PDF/Excel are still the source of
// truth once saved.
function buildPreviewHtml(computed, project, invoiceNo, invoiceDate) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
  const money = n => Number(n || 0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})
  const qty = n => Number(n || 0).toLocaleString('en-IN', {minimumFractionDigits:3, maximumFractionDigits:3})

  const groups = {}
  const order = []
  ;(computed.lines || []).forEach(li => {
    if (!groups[li.sr_no]) { groups[li.sr_no] = []; order.push(li.sr_no) }
    groups[li.sr_no].push(li)
  })

  const subRow = (label, unit, po_qty, rate, qp, ap, qt, at, qu, au, qb, ab) => `
    <tr>
      <td></td>
      <td style="padding-left:22px">• ${esc(label)}</td>
      <td style="text-align:center">${esc(unit)}</td>
      <td style="text-align:right">${qty(po_qty)}</td>
      <td style="text-align:right">${money(rate)}</td>
      <td style="text-align:right">${qty(qp)}</td>
      <td style="text-align:right">${money(ap)}</td>
      <td style="text-align:right">${qty(qt)}</td>
      <td style="text-align:right">${money(at)}</td>
      <td style="text-align:right">${qty(qu)}</td>
      <td style="text-align:right">${money(au)}</td>
      <td style="text-align:right">${qty(qb)}</td>
      <td style="text-align:right">${money(ab)}</td>
    </tr>`

  const flatRow = (sr, desc, unit, po_qty, rate, qp, ap, qt, at, qu, au, qb, ab) => `
    <tr>
      <td style="text-align:center;font-weight:600">${esc(sr)}</td>
      <td>${esc(desc)}</td>
      <td style="text-align:center">${esc(unit)}</td>
      <td style="text-align:right">${qty(po_qty)}</td>
      <td style="text-align:right">${money(rate)}</td>
      <td style="text-align:right">${qty(qp)}</td>
      <td style="text-align:right">${money(ap)}</td>
      <td style="text-align:right">${qty(qt)}</td>
      <td style="text-align:right">${money(at)}</td>
      <td style="text-align:right">${qty(qu)}</td>
      <td style="text-align:right">${money(au)}</td>
      <td style="text-align:right">${qty(qb)}</td>
      <td style="text-align:right">${money(ab)}</td>
    </tr>`

  let rowsHtml = ''
  order.forEach(sr_no => {
    const items = groups[sr_no]
    const desc = items[0].description
    const displaySr = items[0].customer_sr_no || sr_no

    const subRows = []
    items.forEach(li => {
      if (li.advance_applicable) {
        subRows.push(subRow(
          `Advance (${pctStr(li.advance_pct)})`, li.unit, li.po_qty, li.advance_rate,
          li.qty_prev, li.advance_amount_prev, li.qty_this, li.advance_amount_this,
          li.qty_upto, li.advance_amount_upto, li.qty_balance, li.advance_amount_balance,
        ))
        subRows.push(subRow(
          `Supply (${pctStr(li.supply_pct)})`, li.unit, li.po_qty, li.supply_only_rate,
          li.qty_prev, li.supply_only_amount_prev, li.qty_this, li.supply_only_amount_this,
          li.qty_upto, li.supply_only_amount_upto, li.qty_balance, li.supply_only_amount_balance,
        ))
      } else {
        const base = STAGE_LABELS[li.item_type] || li.item_type
        const pct = li.item_type === 'erection' ? project.pt_installation_pct
                  : li.item_type === 'commissioning' ? project.pt_commissioning_pct
                  : project.pt_lc_pct
        subRows.push(subRow(
          `${base} (${pctStr(pct)})`, li.unit, li.po_qty, li.rate,
          li.qty_prev, li.amount_prev, li.qty_this, li.amount_this,
          li.qty_upto, li.amount_upto, li.qty_balance, li.amount_balance,
        ))
      }
    })

    if (subRows.length > 1) {
      rowsHtml += `
        <tr style="background:#F1EFE8;font-weight:600">
          <td style="text-align:center">${esc(displaySr)}</td>
          <td colspan="12">${esc(desc)}</td>
        </tr>`
      rowsHtml += subRows.join('')
    } else {
      const li = items[0]
      rowsHtml += flatRow(
        displaySr, desc, li.unit, li.po_qty, li.rate,
        li.qty_prev, li.amount_prev, li.qty_this, li.amount_this,
        li.qty_upto, li.amount_upto, li.qty_balance, li.amount_balance,
      )
    }
  })

  const summaryRows = []
  summaryRows.push(['Supply value (this bill)', money(computed.supply_value_this), false])
  if (Number(project.pt_installation_pct || 0) > 0)
    summaryRows.push(['Installation value (this bill)', money(computed.installation_value_this), false])
  if (Number(project.pt_commissioning_pct || 0) > 0)
    summaryRows.push(['Commissioning value (this bill)', money(computed.commissioning_value_this), false])
  summaryRows.push(['Taxable value', money(computed.taxable_value), true])
  if (computed.igst_amount > 0) summaryRows.push([`IGST @ ${project.igst_rate}%`, money(computed.igst_amount), false])
  if (computed.cgst_amount > 0) {
    summaryRows.push([`CGST @ ${project.cgst_rate}%`, money(computed.cgst_amount), false])
    summaryRows.push([`SGST @ ${project.sgst_rate}%`, money(computed.sgst_amount), false])
  }
  summaryRows.push(['Gross total', money(computed.gross_total), true])
  summaryRows.push([`Less: Advance recovery (${project.pt_advance_pct}%)`, money(computed.advance_recovery), false])
  if (computed.retention_deduction > 0)
    summaryRows.push([`Less: Retention (${project.pt_retention_pct}%)`, money(computed.retention_deduction), false])
  summaryRows.push(['Net payable', money(computed.net_payable), true])

  const summaryHtml = summaryRows.map(([label, value, bold]) => `
    <tr style="${bold ? 'font-weight:700;background:#E1F5EE' : ''}">
      <td style="padding:6px 12px;border:1px solid #ccc">${esc(label)}</td>
      <td style="padding:6px 12px;border:1px solid #ccc;text-align:right">Rs. ${value}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RA Bill Preview — ${esc(invoiceNo)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #222; }
  h1 { font-size: 18px; text-align: center; color: #0F6E56; margin-bottom: 4px; }
  .sub { text-align: center; font-size: 12px; color: #555; margin-bottom: 16px; }
  .banner { background:#FFF8E1; border:1px solid #E8C468; color:#854F0B; padding:8px 12px; font-size:12px; margin-bottom:16px; border-radius:4px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 20px; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; }
  th { background: #E1F5EE; text-align:center; }
  .summary-table { width: 420px; margin-left: auto; font-size: 12px; }
</style></head>
<body>
  <div class="banner">PREVIEW ONLY — this RA Bill has not been saved yet. Values may change if new GRN/Dispatch/Site Progress entries are added before you save.</div>
  <h1>RA Bill No. ${esc(computed.ra_number)} — ${esc(project.name)}</h1>
  <div class="sub">Invoice No: ${esc(invoiceNo)} | Date: ${esc(invoiceDate)} | WO: ${esc(project.wo_number || '')} | HSN: ${esc(project.hsn_sac_code || '')}</div>
  <table>
    <thead><tr>
      <th>Sr.</th><th>Description</th><th>Unit</th><th>PO Qty</th><th>Rate</th>
      <th>Prev Qty</th><th>Prev Amt</th><th>This Qty</th><th>This Amt</th>
      <th>Upto Qty</th><th>Upto Amt</th><th>Bal Qty</th><th>Bal Amt</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <table class="summary-table"><tbody>${summaryHtml}</tbody></table>
</body></html>`
}

export default function RABillPage() {
  const { activeProject, user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [raList, setRaList]     = useState([])
  const [computed, setComputed] = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [advance, setAdvance] = useState(null)       // null = loading, false = not recorded, object = recorded
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [advanceForm, setAdvanceForm] = useState({ amount_received:'', date_received: today(), reference_no:'', notes:'' })
  const [advanceSaving, setAdvanceSaving] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    loadRA()
    loadAdvance()
    users.waContacts().then(r=>setContacts(r.data)).catch(()=>{})
  }, [activeProject])

  const loadAdvance = () => {
    ra.getAdvance(activeProject.id)
      .then(r => setAdvance(r.data || false))
      .catch(() => setAdvance(false))
  }

  const submitAdvance = async e => {
    e.preventDefault()
    setAdvanceSaving(true)
    try {
      await ra.recordAdvance(activeProject.id, {
        ...advanceForm,
        amount_received: parseFloat(advanceForm.amount_received),
      })
      toast.success('Advance received recorded')
      setShowAdvanceForm(false)
      loadAdvance()
    } catch(e) { toast.error(e.response?.data?.error || 'Error recording advance') }
    finally { setAdvanceSaving(false) }
  }

  const loadRA = () => ra.list(activeProject.id).then(r=>setRaList(r.data))

  const compute = async () => {
    setLoading(true)
    try {
      const r = await ra.compute(activeProject.id, { invoice_date: invoiceDate })
      setComputed(r.data)
      setInvoiceNo(r.data.invoice_no)
      toast.success('RA bill computed — review and save')
    } catch(e) { toast.error(e.response?.data?.error||'Compute error')
    } finally { setLoading(false) }
  }

  const openPreview = () => {
    if (!computed) return
    const html = buildPreviewHtml(computed, activeProject, invoiceNo, invoiceDate)
    const win = window.open('', '_blank')
    if (!win) { toast.error('Popup blocked — allow popups for this site to preview'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const save = async () => {
    if (!computed) return
    setSaving(true)
    try {
      const payload = { ...computed, invoice_no: invoiceNo, invoice_date: invoiceDate }
      const r = await ra.save(activeProject.id, payload)
      toast.success(`RA Bill #${r.data.ra_number} saved`)
      setComputed(null)
      loadRA()
    } catch(e) { toast.error(e.response?.data?.error||'Save error')
    } finally { setSaving(false) }
  }

  const downloadFile = (id, type) => {
    const url = type==='pdf' ? ra.pdfUrl(id) : ra.xlsxUrl(id)
    const token = localStorage.getItem('access_token')
    fetch(url, { headers:{ Authorization:`Bearer ${token}` }})
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `RA_${id}.${type==='pdf'?'pdf':'xlsx'}`
        a.click()
      }).catch(()=>toast.error('Download failed'))
  }

  const downloadTaxInvoice = (id, type) => {
    const url = type==='pdf' ? ra.taxInvoicePdfUrl(id) : ra.taxInvoiceXlsxUrl(id)
    const token = localStorage.getItem('access_token')
    fetch(url, { headers:{ Authorization:`Bearer ${token}` }})
      .then(r => { if(!r.ok) throw new Error('Download failed'); return r.blob() })
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `TaxInvoice_${id}.${type==='pdf'?'pdf':'xlsx'}`
        a.click()
      }).catch(()=>toast.error('Tax Invoice download failed'))
  }

  const updateStatus = async (id, status) => {
    try {
      await ra.status(id, { status })
      toast.success(`Status updated to ${status}`)
      loadRA()
    } catch { toast.error('Error') }
  }

  const deleteRA = async (bill) => {
    if (!confirm(`Permanently delete RA Bill #${bill.ra_number} (${bill.invoice_no})? This cannot be undone.`)) return
    try {
      await ra.delete(bill.id)
      toast.success(`RA Bill #${bill.ra_number} deleted`)
      loadRA()
    } catch(e) { toast.error(e.response?.data?.error || 'Delete failed') }
  }

  const sendWA = (bill, contact) => openWhatsApp(contact.phone, raWhatsAppMsg(bill, activeProject))

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div className="card">
        <div className="card-header"><span className="card-title">RA bill generator — {activeProject.code}</span></div>
        <div className="card-body">
          <div className="form-grid" style={{marginBottom:16}}>
            <div className="form-group">
              <label className="form-label">Invoice date</label>
              <input className="form-input" type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice number</label>
              <input className="form-input" type="text" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder={`${activeProject.invoice_prefix}/001`} />
            </div>
          </div>
          {/* ── Advance Received card — one-time entry ────────────────────────── */}
          {advance === false && !showAdvanceForm && (
            <div className="alert alert-warning" style={{ marginBottom: 16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
              <span>No advance received recorded for this project yet — RA bills won't deduct any advance recovery until this is entered.</span>
              <button className="btn btn-sm btn-primary" onClick={() => setShowAdvanceForm(true)}>
                Record Advance Received
              </button>
            </div>
          )}

          {showAdvanceForm && (
            <div className="card" style={{ marginBottom: 16, border: '2px solid var(--teal)' }}>
              <div className="card-header"><span className="card-title">Record Advance Received (one-time entry)</span></div>
              <div className="card-body">
                <form onSubmit={submitAdvance}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Amount received (₹) *</label>
                      <input className="form-input" type="number" step="any" required
                        value={advanceForm.amount_received}
                        onChange={e => setAdvanceForm(f => ({ ...f, amount_received: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date received *</label>
                      <input className="form-input" type="date" required
                        value={advanceForm.date_received}
                        onChange={e => setAdvanceForm(f => ({ ...f, date_received: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Reference no. (bank UTR / cheque no.)</label>
                    <input className="form-input" value={advanceForm.reference_no}
                      onChange={e => setAdvanceForm(f => ({ ...f, reference_no: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Notes</label>
                    <input className="form-input" value={advanceForm.notes}
                      onChange={e => setAdvanceForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" type="submit" disabled={advanceSaving}>
                      {advanceSaving ? 'Saving…' : 'Save advance received'}
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => setShowAdvanceForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {advance && (
            <div className="alert alert-success" style={{ marginBottom: 16, fontSize: 12 }}>
              <b>Advance received:</b> ₹{Number(advance.amount_received).toLocaleString('en-IN')} on {advance.date_received}
              {advance.reference_no ? ` · Ref: ${advance.reference_no}` : ''}
              {' — '}<b>Recovered so far:</b> ₹{Number(advance.recovered_so_far).toLocaleString('en-IN')}
              {' · '}<b>Remaining:</b> ₹{Number(advance.remaining).toLocaleString('en-IN')}
            </div>
          )}

          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <button className="btn btn-primary" onClick={compute} disabled={loading}>
              {loading?'Computing…':'Compute RA bill'}
            </button>
            {computed && <button className="btn" onClick={()=>setComputed(null)}>Clear</button>}
          </div>

          {computed && (
            <div>
              {computed.period_note && (
                <div className="alert alert-info" style={{marginBottom:12}}>
                  Period: {computed.period_note}
                </div>
              )}
              <div className="summary-box" style={{marginBottom:16}}>
                <div className="summary-row"><span>RA bill no.</span><span style={{fontWeight:500}}>#{computed.ra_number}</span></div>
                <div style={{padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:12,color:'var(--text-s)'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'right'}}>
                    <span style={{textAlign:'left',fontWeight:500}}>Part</span>
                    <span style={{fontWeight:500}}>Prev bills</span>
                    <span style={{fontWeight:500,color:'var(--teal)'}}>This bill</span>
                  </div>
                </div>
                <div style={{padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'right'}}>
                    <span style={{textAlign:'left'}}>Supply</span>
                    <span style={{color:'var(--text-s)'}}>₹{Number(computed.supply_value_prev).toLocaleString('en-IN')}</span>
                    <span style={{color:'var(--teal)',fontWeight:500}}>₹{Number(computed.supply_value_this).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div style={{padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'right'}}>
                    <span style={{textAlign:'left'}}>Installation</span>
                    <span style={{color:'var(--text-s)'}}>₹{Number(computed.installation_value_prev).toLocaleString('en-IN')}</span>
                    <span style={{color:'var(--teal)',fontWeight:500}}>₹{Number(computed.installation_value_this).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div style={{padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'right'}}>
                    <span style={{textAlign:'left'}}>Commissioning</span>
                    <span style={{color:'var(--text-s)'}}>₹{Number(computed.commissioning_value_prev).toLocaleString('en-IN')}</span>
                    <span style={{color:'var(--teal)',fontWeight:500}}>₹{Number(computed.commissioning_value_this).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div className="summary-row"><span style={{fontWeight:500}}>Taxable value (this bill)</span><span style={{fontWeight:500}}>{fmt(computed.taxable_value)}</span></div>
                {computed.igst_amount > 0 && <div className="summary-row"><span>IGST {activeProject.igst_rate}%</span><span>{fmt(computed.igst_amount)}</span></div>}
                {computed.cgst_amount > 0 && <>
                  <div className="summary-row"><span>CGST {activeProject.cgst_rate}%</span><span>{fmt(computed.cgst_amount)}</span></div>
                  <div className="summary-row"><span>SGST {activeProject.sgst_rate}%</span><span>{fmt(computed.sgst_amount)}</span></div>
                </>}
                <div className="summary-row"><span style={{fontWeight:500}}>Gross total</span><span style={{fontWeight:500}}>{fmt(computed.gross_total)}</span></div>
                <div className="summary-row">
                  <span>
                    Less: Advance recovery ({activeProject.pt_advance_pct}%)
                    {computed.advance_info && !computed.advance_info.recorded && (
                      <span style={{fontSize:10,color:'var(--coral)',marginLeft:6}}>(no advance recorded — ₹0 deducted)</span>
                    )}
                    {computed.advance_info && computed.advance_info.recorded && computed.advance_info.remaining_before_this_bill <= 0 && (
                      <span style={{fontSize:10,color:'var(--text-s)',marginLeft:6}}>(fully recovered)</span>
                    )}
                  </span>
                  <span style={{color:'var(--coral)'}}>— {fmt(computed.advance_recovery)}</span>
                </div>
                {computed.retention_deduction > 0 && <div className="summary-row"><span>Less: Retention</span><span style={{color:'var(--coral)'}}>— {fmt(computed.retention_deduction)}</span></div>}
                <div className="summary-row total"><span>Net payable</span><span style={{fontSize:16,fontWeight:700}}>{fmt(computed.net_payable)}</span></div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button className="btn" onClick={openPreview}>
                  👁 Preview
                </button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving?'Saving…':'Save RA bill'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">RA bill register ({raList.length})</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>RA no.</th><th>Invoice no.</th><th>Date</th>
              <th>Taxable</th><th>Net payable</th><th>Status</th>
              <th>RA Bill</th><th>Tax Invoice</th><th>WhatsApp</th><th>Action</th><th></th>
            </tr></thead>
            <tbody>
              {raList.length===0 && <tr><td colSpan={11} className="empty">No RA bills yet. Compute and save your first bill above.</td></tr>}
              {raList.map(bill=>(
                <tr key={bill.id}>
                  <td style={{fontWeight:600}}>RA-{bill.ra_number}</td>
                  <td>{bill.invoice_no}</td>
                  <td>{bill.invoice_date}</td>
                  <td>{fmt(bill.taxable_value)}</td>
                  <td style={{fontWeight:600,color:'var(--teal)'}}>{fmt(bill.net_payable)}</td>
                  <td>
                    <span className={`badge ${
                      bill.status==='paid'?'badge-green':
                      bill.status==='approved'?'badge-teal':
                      bill.status==='submitted'?'badge-purple':'badge-amber'
                    }`}>{bill.status}</span>
                  </td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button className="btn btn-sm" onClick={()=>downloadFile(bill.id,'pdf')} title="Download RA Bill PDF">PDF</button>
                      <button className="btn btn-sm" onClick={()=>downloadFile(bill.id,'excel')} title="Download RA Bill Excel">XLS</button>
                    </div>
                  </td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button className="btn btn-sm btn-primary" onClick={()=>downloadTaxInvoice(bill.id,'pdf')} title="Download Tax Invoice PDF" style={{background:'var(--purple)',borderColor:'var(--purple)'}}>INV PDF</button>
                      <button className="btn btn-sm btn-primary" onClick={()=>downloadTaxInvoice(bill.id,'excel')} title="Download Tax Invoice Excel" style={{background:'var(--purple)',borderColor:'var(--purple)'}}>INV XLS</button>
                    </div>
                  </td>
                  <td>
                    {contacts.length>0 && (
                      <select className="form-select" style={{fontSize:11,padding:'3px 6px',width:120}}
                        onChange={e=>{ const c=contacts.find(x=>x.id===parseInt(e.target.value)); if(c)sendWA(bill,c); e.target.value='' }}>
                        <option value="">Send via WA</option>
                        {contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    {bill.status==='draft' && (
                      <button className="btn btn-sm btn-primary" onClick={()=>updateStatus(bill.id,'submitted')}>Submit</button>
                    )}
                    {bill.status==='submitted' && (
                      <button className="btn btn-sm" onClick={()=>updateStatus(bill.id,'approved')}>Approve</button>
                    )}
                    {bill.status==='approved' && (
                      <button className="btn btn-sm" onClick={()=>updateStatus(bill.id,'paid')}>Mark paid</button>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-sm btn-danger"
                        onClick={()=>deleteRA(bill)}
                        title="Delete RA Bill permanently">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
