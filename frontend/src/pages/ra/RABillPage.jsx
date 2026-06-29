import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ra, users } from '../../services/api'
import { openWhatsApp, raWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]
const fmt = n => `₹${Number(n).toLocaleString('en-IN', {minimumFractionDigits:2})}`

export default function RABillPage() {
  const { activeProject } = useAuth()
  const [raList, setRaList]     = useState([])
  const [computed, setComputed] = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())

  useEffect(() => {
    if (!activeProject) return
    loadRA()
    users.waContacts().then(r=>setContacts(r.data)).catch(()=>{})
  }, [activeProject])

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

  const updateStatus = async (id, status) => {
    try {
      await ra.status(id, { status })
      toast.success(`Status updated to ${status}`)
      loadRA()
    } catch { toast.error('Error') }
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
                    <span style={{textAlign:'left'}}>Supply (Part 1)</span>
                    <span style={{color:'var(--text-s)'}}>₹{Number(computed.supply_value_prev).toLocaleString('en-IN')}</span>
                    <span style={{color:'var(--teal)',fontWeight:500}}>₹{Number(computed.supply_value_this).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div style={{padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'right'}}>
                    <span style={{textAlign:'left'}}>E&C (Part 2)</span>
                    <span style={{color:'var(--text-s)'}}>₹{Number(computed.ec_value_prev).toLocaleString('en-IN')}</span>
                    <span style={{color:'var(--teal)',fontWeight:500}}>₹{Number(computed.ec_value_this).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div className="summary-row"><span style={{fontWeight:500}}>Taxable value (this bill)</span><span style={{fontWeight:500}}>{fmt(computed.taxable_value)}</span></div>
                {computed.igst_amount > 0 && <div className="summary-row"><span>IGST {activeProject.igst_rate}%</span><span>{fmt(computed.igst_amount)}</span></div>}
                {computed.cgst_amount > 0 && <>
                  <div className="summary-row"><span>CGST {activeProject.cgst_rate}%</span><span>{fmt(computed.cgst_amount)}</span></div>
                  <div className="summary-row"><span>SGST {activeProject.sgst_rate}%</span><span>{fmt(computed.sgst_amount)}</span></div>
                </>}
                <div className="summary-row"><span style={{fontWeight:500}}>Gross total</span><span style={{fontWeight:500}}>{fmt(computed.gross_total)}</span></div>
                <div className="summary-row"><span>Less: Advance recovery ({activeProject.pt_advance_pct}%)</span><span style={{color:'var(--coral)'}}>— {fmt(computed.advance_recovery)}</span></div>
                {computed.retention_deduction > 0 && <div className="summary-row"><span>Less: Retention</span><span style={{color:'var(--coral)'}}>— {fmt(computed.retention_deduction)}</span></div>}
                <div className="summary-row total"><span>Net payable</span><span style={{fontSize:16,fontWeight:700}}>{fmt(computed.net_payable)}</span></div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
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
              <th>Download</th><th>WhatsApp</th><th>Action</th>
            </tr></thead>
            <tbody>
              {raList.length===0 && <tr><td colSpan={9} className="empty">No RA bills yet. Compute and save your first bill above.</td></tr>}
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
                      <button className="btn btn-sm" onClick={()=>downloadFile(bill.id,'pdf')} title="Download PDF">PDF</button>
                      <button className="btn btn-sm" onClick={()=>downloadFile(bill.id,'excel')} title="Download Excel">XLS</button>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
