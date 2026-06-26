import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { dispatch } from '../../services/api'
import toast from 'react-hot-toast'

export default function InvoiceListPage() {
  const { activeProject } = useAuth()
  const [pending, setPending]   = useState([])
  const [all, setAll]           = useState([])
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (!activeProject) return
    load()
  }, [activeProject])

  const load = () => {
    dispatch.list(activeProject.id).then(r => {
      setAll(r.data)
      setPending(r.data.filter(d => d.invoice_status === 'pending'))
    })
  }

  const markInvoiced = async id => {
    try {
      await dispatch.markInvoiced(id)
      toast.success('Marked as invoiced')
      load()
    } catch { toast.error('Error') }
  }

  const totalPending = pending.reduce((a,d) => a + Number(d.amount), 0)

  const exportCSV = () => {
    const rows = [
      ['DN No','Date','BOQ Sr','Description','Qty','Unit','Rate','Amount','Site','Status'],
      ...pending.map(d=>[d.dn_number,d.dispatch_date,d.boq_item_sr,
        `"${d.boq_item_desc}"`,d.qty_dispatched,d.unit,d.boq_item_rate,d.amount,d.site_destination,d.invoice_status])
    ]
    const csv = rows.map(r=>r.join(',')).join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Invoice_List_${activeProject.code}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div className="stat-grid" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="stat-card">
          <div className="stat-label">Pending invoice items</div>
          <div className="stat-value">{pending.length}</div>
          <div className="stat-sub">dispatches not yet invoiced</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending value</div>
          <div className="stat-value">₹{(totalPending/100000).toFixed(2)}L</div>
          <div className="stat-sub">excl. GST</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total dispatches</div>
          <div className="stat-value">{all.length}</div>
          <div className="stat-sub">all time</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Pending invoice list — enter in ERP to raise invoice</span>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-sm" onClick={exportCSV}>Export CSV</button>
          </div>
        </div>
        <div className="alert alert-info" style={{margin:'12px 16px 0'}}>
          These items have been dispatched but not yet invoiced. Export to CSV and enter in your ERP. Then mark each as invoiced.
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>DN no.</th><th>Date</th><th>BOQ item</th><th>Qty</th><th>Unit</th>
              <th>Rate (₹)</th><th>Amount (₹)</th><th>Site</th><th>Action</th>
            </tr></thead>
            <tbody>
              {pending.length===0 && <tr><td colSpan={9} className="empty">No pending invoice items. All dispatches have been invoiced.</td></tr>}
              {pending.map(d=>(
                <tr key={d.id}>
                  <td style={{fontWeight:500}}>{d.dn_number}</td>
                  <td>{d.dispatch_date}</td>
                  <td><span style={{fontWeight:500}}>{d.boq_item_sr}</span><br/><span style={{fontSize:11,color:'var(--text-s)'}}>{d.boq_item_desc.substring(0,50)}</span></td>
                  <td>{d.qty_dispatched}</td>
                  <td>{d.unit}</td>
                  <td>{Number(d.boq_item_rate).toLocaleString('en-IN')}</td>
                  <td style={{fontWeight:500}}>₹{Number(d.amount).toLocaleString('en-IN')}</td>
                  <td style={{fontSize:11}}>{d.site_destination?.split('—')[0]}</td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={()=>markInvoiced(d.id)}>
                      Mark invoiced
                    </button>
                  </td>
                </tr>
              ))}
              {pending.length > 0 && (
                <tr style={{background:'var(--teal-l)'}}>
                  <td colSpan={6} style={{fontWeight:600,textAlign:'right'}}>Total pending (excl. GST)</td>
                  <td style={{fontWeight:600}}>₹{totalPending.toLocaleString('en-IN')}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
