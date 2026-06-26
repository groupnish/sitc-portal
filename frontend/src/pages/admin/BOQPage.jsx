// BOQPage.jsx
import { useEffect, useState } from 'react'
import { boq, projects } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const BLANK = {sr_no:'',description:'',po_qty:'',unit:'Nos.',rate:'',site_zone:'MPS SITE',item_type:'supply'}
const ZONES = ['MPS SITE','STP SITE','SPS SITE','GENERAL']
const TYPES = ['supply','erection','commissioning']

export function BOQPage() {
  const { activeProject } = useAuth()
  const [items, setItems]   = useState([])
  const [form, setForm]     = useState(BLANK)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')

  useEffect(() => { if(activeProject) load() }, [activeProject])
  const load = () => boq.list(activeProject.id).then(r=>setItems(r.data))
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const submit = async e => {
    e.preventDefault()
    const data = {...form, po_qty:parseFloat(form.po_qty), rate:parseFloat(form.rate||0), amount:parseFloat(form.po_qty)*parseFloat(form.rate||0)}
    try {
      if (editing) { await boq.update(editing, data); toast.success('Item updated') }
      else { await boq.add(activeProject.id, data); toast.success('Item added') }
      setForm(BLANK); setEditing(null); setShowForm(false); load()
    } catch(e) { toast.error(e.response?.data?.error||'Error') }
  }

  const del = async id => {
    if (!confirm('Delete this BOQ item?')) return
    await boq.del(id); toast.success('Deleted'); load()
  }

  const filtered = filter==='all' ? items : items.filter(i=>i.site_zone===filter)
  const total = items.reduce((a,i)=>a+i.amount,0)

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:14,fontWeight:500}}>BOQ manager — {activeProject.code} ({items.length} items)</h2>
        <button className="btn btn-primary btn-sm" onClick={()=>{setForm(BLANK);setEditing(null);setShowForm(s=>!s)}}>
          {showForm?'Cancel':'+ Add item'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-header"><span className="card-title">{editing?'Edit BOQ item':'New BOQ item'}</span></div>
          <div className="card-body">
            <form onSubmit={submit}>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Sr. no. *</label><input className="form-input" required value={form.sr_no} onChange={e=>set('sr_no',e.target.value)} placeholder="S-1" /></div>
                <div className="form-group"><label className="form-label">Unit *</label><input className="form-input" required value={form.unit} onChange={e=>set('unit',e.target.value)} /></div>
              </div>
              <div className="form-group" style={{marginBottom:12}}><label className="form-label">Description *</label><textarea className="form-textarea" required value={form.description} onChange={e=>set('description',e.target.value)} /></div>
              <div className="form-grid form-grid-3">
                <div className="form-group"><label className="form-label">PO qty *</label><input className="form-input" type="number" required value={form.po_qty} onChange={e=>set('po_qty',e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Rate (₹)</label><input className="form-input" type="number" value={form.rate} onChange={e=>set('rate',e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Site zone</label><select className="form-select" value={form.site_zone} onChange={e=>set('site_zone',e.target.value)}>{ZONES.map(z=><option key={z}>{z}</option>)}</select></div>
              </div>
              <div className="form-group" style={{marginBottom:12}}><label className="form-label">Item type</label><select className="form-select" value={form.item_type} onChange={e=>set('item_type',e.target.value)}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <button className="btn btn-primary" type="submit">{editing?'Update':'Add item'}</button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">BOQ items — Total: ₹{(total/100000).toFixed(2)}L</span>
          <select className="form-select" style={{width:'auto',fontSize:12,padding:'4px 8px'}} value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">All zones</option>
            {ZONES.map(z=><option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sr.</th><th>Description</th><th>Zone</th><th>Type</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {filtered.map(i=>(
                <tr key={i.id}>
                  <td style={{fontWeight:500}}>{i.sr_no}</td>
                  <td style={{maxWidth:200,fontSize:12}}>{i.description.substring(0,80)}</td>
                  <td style={{fontSize:11}}>{i.site_zone}</td>
                  <td><span className={`badge ${i.item_type==='supply'?'badge-teal':i.item_type==='erection'?'badge-coral':'badge-amber'}`}>{i.item_type}</span></td>
                  <td>{i.po_qty}</td>
                  <td>{i.unit}</td>
                  <td>{Number(i.rate).toLocaleString('en-IN')}</td>
                  <td>₹{Number(i.amount).toLocaleString('en-IN')}</td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button className="btn btn-sm" onClick={()=>{setForm({...i,po_qty:i.po_qty,rate:i.rate});setEditing(i.id);setShowForm(true);window.scrollTo(0,0)}}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={()=>del(i.id)}>Del</button>
                    </div>
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

export default BOQPage
