import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { site, users } from '../../services/api'
import { openWhatsApp, progressWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]

export default function SiteProgressPage() {
  const { activeProject, user } = useAuth()
  const [items, setItems]     = useState([])
  const [updates, setUpdates] = useState({})
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    if (!activeProject) return
    load()
    users.waContacts().then(r=>setContacts(r.data)).catch(()=>{})
  }, [activeProject])

  const load = () => {
    setLoading(true)
    site.list(activeProject.id).then(r=>setItems(r.data)).finally(()=>setLoading(false))
  }

  const setUpd = (id,key,val) => setUpdates(u=>({ ...u, [id]:{ ...(u[id]||{}), [key]:val } }))

  const save = async () => {
    const payload = Object.entries(updates)
      .filter(([,v]) => (v.qty_installed||0)>0 || (v.qty_commissioned||0)>0)
      .map(([id,v]) => ({
        boq_item_id: parseInt(id),
        qty_installed:    parseFloat(v.qty_installed||0),
        qty_commissioned: parseFloat(v.qty_commissioned||0),
        notes: v.notes||'',
        progress_date: today(),
      }))
    if (!payload.length) { toast.error('No updates to save'); return }
    setLoading(true)
    try {
      await site.update(activeProject.id, { updates: payload })
      toast.success(`${payload.length} item(s) saved — Accounts team notified`)
      setUpdates({})
      load()
    } catch(e) { toast.error('Error saving progress')
    } finally { setLoading(false) }
  }

  const zones = [...new Set(items.map(i=>i.site_zone).filter(Boolean))]
  const filtered = filter==='all' ? items : items.filter(i=>i.site_zone===filter)

  const totalPct = items.length ? Math.round(items.reduce((a,i)=>a+i.pct_installed,0)/items.length) : 0

  const sendWA = contact => {
    const count = Object.keys(updates).filter(id => {
      const u = updates[id]
      return (u?.qty_installed||0)>0 || (u?.qty_commissioned||0)>0
    }).length
    openWhatsApp(contact.phone, progressWhatsAppMsg(count||items.length, activeProject))
  }

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div className="stat-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
        <div className="stat-card">
          <div className="stat-label">Overall progress</div>
          <div className="stat-value">{totalPct}%</div>
          <div className="progress-bar" style={{marginTop:8}}><div className="progress-fill" style={{width:`${totalPct}%`}}/></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total BOQ items</div>
          <div className="stat-value">{items.length}</div>
          <div className="stat-sub">across all sites</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Updates pending</div>
          <div className="stat-value">{Object.keys(updates).length}</div>
          <div className="stat-sub">unsaved changes</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Site progress entry</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <select className="form-select" style={{fontSize:12,padding:'4px 8px',width:'auto'}}
              value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="all">All sites</option>
              {zones.map(z=><option key={z} value={z}>{z}</option>)}
            </select>
            {contacts.length>0 && (
              <select className="form-select" style={{fontSize:12,padding:'4px 8px',width:'auto'}}
                onChange={e=>{ const c=contacts.find(x=>x.id===parseInt(e.target.value)); if(c)sendWA(c); e.target.value='' }}>
                <option value="">WhatsApp update</option>
                {contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button className="btn btn-primary btn-sm" onClick={save} disabled={loading}>
              {loading?'Saving…':'Save progress'}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Sr.</th><th>Description</th><th>Site</th>
              <th>PO qty</th><th>Installed</th><th>Commissioned</th>
              <th>This update — installed</th><th>This update — comm.</th><th>Progress</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="empty">Loading…</td></tr>}
              {filtered.map(item=>(
                <tr key={item.id}>
                  <td style={{fontWeight:500,whiteSpace:'nowrap'}}>{item.sr_no}</td>
                  <td style={{maxWidth:200,fontSize:12}}>{item.description.substring(0,80)}</td>
                  <td style={{fontSize:11}}>{item.site_zone?.split(' ')[0]}</td>
                  <td style={{textAlign:'right'}}>{item.po_qty} {item.unit}</td>
                  <td style={{textAlign:'right'}}>{item.total_installed}</td>
                  <td style={{textAlign:'right'}}>{item.total_commissioned}</td>
                  <td>
                    <input type="number" min="0" step="any"
                      style={{width:70,padding:'4px 6px',border:'1px solid var(--border)',borderRadius:6,fontSize:12}}
                      placeholder="0"
                      value={updates[item.id]?.qty_installed||''}
                      onChange={e=>setUpd(item.id,'qty_installed',e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min="0" max={item.po_qty} step="0.5"
                      style={{width:70,padding:'4px 6px',border:'1px solid var(--border)',borderRadius:6,fontSize:12}}
                      placeholder="0"
                      value={updates[item.id]?.qty_commissioned||''}
                      onChange={e=>setUpd(item.id,'qty_commissioned',e.target.value)} />
                  </td>
                  <td style={{minWidth:100}}>
                    <div style={{fontSize:11,marginBottom:3}}>{item.pct_installed}%</div>
                    <div className="progress-bar"><div className="progress-fill" style={{width:`${Math.min(item.pct_installed,100)}%`}}/></div>
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
