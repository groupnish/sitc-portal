import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { grn, boq, users } from '../../services/api'
import { openWhatsApp, grnWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]

export default function GRNPage() {
  const { activeProject } = useAuth()
  const [boqItems, setBoqItems]   = useState([])
  const [grnList, setGrnList]     = useState([])
  const [contacts, setContacts]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [form, setForm] = useState({
    grn_date: today(), boq_item_id:'', qty_received:'',
    vendor_name:'', challan_no:'', vehicle_no:'', remarks:''
  })

  useEffect(() => {
    if (!activeProject) return
    boq.list(activeProject.id).then(r => setBoqItems(r.data))
    loadGRNs()
    users.waContacts().then(r => setContacts(r.data)).catch(()=>{})
  }, [activeProject])

  const loadGRNs = () => {
    grn.list(activeProject.id).then(r => setGrnList(r.data))
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const submit = async e => {
    e.preventDefault()
    if (!form.boq_item_id) { toast.error('Select a BOQ item'); return }
    setLoading(true)
    try {
      await grn.create(activeProject.id, { ...form, qty_received: parseFloat(form.qty_received) })
      toast.success('GRN created — email sent to Accounts & Site')
      setForm({ grn_date:today(), boq_item_id:'', qty_received:'', vendor_name:'', challan_no:'', vehicle_no:'', remarks:'' })
      loadGRNs()
    } catch(e) { toast.error(e.response?.data?.error || 'Error creating GRN')
    } finally { setLoading(false) }
  }

  const sendWA = (g, contact) => {
    const msg = grnWhatsAppMsg(g, activeProject)
    openWhatsApp(contact.phone, msg)
  }

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Create GRN — material inward</span>
        </div>
        <div className="card-body">
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">GRN date *</label>
                <input className="form-input" type="date" required value={form.grn_date} onChange={e=>set('grn_date',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor / supplier *</label>
                <input className="form-input" type="text" required placeholder="Vendor name" value={form.vendor_name} onChange={e=>set('vendor_name',e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{marginBottom:12}}>
              <label className="form-label">BOQ item *</label>
              <select className="form-select" required value={form.boq_item_id} onChange={e=>set('boq_item_id',e.target.value)}>
                <option value="">— Select BOQ item —</option>
                {boqItems.map(i=><option key={i.id} value={i.id}>{i.sr_no} — {i.description.substring(0,70)}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Quantity received *</label>
                <input className="form-input" type="number" required min="0" step="any" placeholder="0" value={form.qty_received} onChange={e=>set('qty_received',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Challan / DC number</label>
                <input className="form-input" type="text" placeholder="DC/2026/001" value={form.challan_no} onChange={e=>set('challan_no',e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Vehicle number</label>
                <input className="form-input" type="text" placeholder="GJ-05-AB-1234" value={form.vehicle_no} onChange={e=>set('vehicle_no',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Remarks</label>
                <input className="form-input" type="text" placeholder="Any shortage / damage notes" value={form.remarks} onChange={e=>set('remarks',e.target.value)} />
              </div>
            </div>
            <div className="alert alert-info" style={{marginTop:8,marginBottom:12}}>
              On save — email automatically sent to Accounts and Site teams.
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save GRN'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">GRN register ({grnList.length})</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>GRN no.</th><th>Date</th><th>BOQ item</th><th>Qty</th>
              <th>Vendor</th><th>Challan</th><th>Status</th><th>WhatsApp</th>
            </tr></thead>
            <tbody>
              {grnList.length === 0 && <tr><td colSpan={8} className="empty">No GRNs yet.</td></tr>}
              {grnList.map(g => (
                <tr key={g.id}>
                  <td style={{fontWeight:500}}>{g.grn_number}</td>
                  <td>{g.grn_date}</td>
                  <td style={{maxWidth:180}}><span style={{fontWeight:500}}>{g.boq_item_sr}</span><br/><span style={{fontSize:11,color:'var(--text-s)'}}>{g.boq_item_desc.substring(0,50)}</span></td>
                  <td>{g.qty_received} {g.unit}</td>
                  <td>{g.vendor_name}</td>
                  <td>{g.challan_no}</td>
                  <td><span className="badge badge-teal">{g.status}</span></td>
                  <td>
                    {contacts.length > 0 && (
                      <select className="form-select" style={{fontSize:11,padding:'3px 6px',width:120}} onChange={e=>{
                        const c=contacts.find(x=>x.id===parseInt(e.target.value))
                        if(c) sendWA(g,c)
                        e.target.value=''
                      }}>
                        <option value="">Send via WA</option>
                        {contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
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
