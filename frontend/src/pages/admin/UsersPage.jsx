import { useEffect, useState } from 'react'
import { users } from '../../services/api'
import toast from 'react-hot-toast'

const ROLES = ['admin','scm','accounts','site','management']
const ROLE_BADGE = {admin:'badge-gray',scm:'badge-teal',accounts:'badge-purple',site:'badge-coral',management:'badge-amber'}
const BLANK = {name:'',email:'',role:'scm',phone_whatsapp:'',password:'',notify_grn:true,notify_dispatch:true,notify_progress:true,notify_ra:true}

export default function UsersPage() {
  const [list, setList]       = useState([])
  const [form, setForm]       = useState(BLANK)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])
  const load = () => users.list().then(r=>setList(r.data)).catch(()=>{})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      if (editing) {
        await users.update(editing, form)
        toast.success('User updated')
      } else {
        await users.create(form)
        toast.success('User created — credentials: '+form.email+' / '+form.password)
      }
      setForm(BLANK); setEditing(null); setShowForm(false); load()
    } catch(e) { toast.error(e.response?.data?.error||'Error')
    } finally { setLoading(false) }
  }

  const editUser = u => {
    setForm({...u, password:'', phone_whatsapp:u.phone_whatsapp||''})
    setEditing(u.id); setShowForm(true)
    window.scrollTo(0,0)
  }

  const toggleActive = async u => {
    await users.update(u.id, {is_active:!u.is_active})
    toast.success(u.is_active?'User deactivated':'User activated')
    load()
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:14,fontWeight:500}}>User management</h2>
        <button className="btn btn-primary btn-sm" onClick={()=>{setForm(BLANK);setEditing(null);setShowForm(s=>!s)}}>
          {showForm?'Cancel':'+ Add user'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-header"><span className="card-title">{editing?'Edit user':'New user'}</span></div>
          <div className="card-body">
            <form onSubmit={submit}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full name *</label>
                  <input className="form-input" required value={form.name} onChange={e=>set('name',e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" required value={form.email} onChange={e=>set('email',e.target.value)} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-select" value={form.role} onChange={e=>set('role',e.target.value)}>
                    {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp number (with country code)</label>
                  <input className="form-input" placeholder="+919876543210" value={form.phone_whatsapp} onChange={e=>set('phone_whatsapp',e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{marginBottom:12}}>
                <label className="form-label">{editing?'New password (leave blank to keep current)':'Password *'}</label>
                <input className="form-input" type="password" required={!editing} value={form.password} onChange={e=>set('password',e.target.value)} />
              </div>
              <div style={{marginBottom:12}}>
                <div className="form-label" style={{marginBottom:8}}>Email notifications</div>
                <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                  {['notify_grn','notify_dispatch','notify_progress','notify_ra'].map(k=>(
                    <label key={k} style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer'}}>
                      <input type="checkbox" checked={form[k]} onChange={e=>set(k,e.target.checked)} />
                      {k.replace('notify_','')}
                    </label>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading?'Saving…':editing?'Update user':'Create user'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><span className="card-title">All users ({list.length})</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Email</th><th>Role</th><th>WhatsApp</th>
              <th>Notifications</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {list.map(u=>(
                <tr key={u.id} style={{opacity:u.is_active?1:.5}}>
                  <td style={{fontWeight:500}}>{u.name}</td>
                  <td style={{fontSize:12,color:'var(--text-s)'}}>{u.email}</td>
                  <td><span className={`badge ${ROLE_BADGE[u.role]||'badge-gray'}`}>{u.role}</span></td>
                  <td style={{fontSize:12}}>{u.phone_whatsapp||'—'}</td>
                  <td style={{fontSize:11}}>
                    {[u.notify_grn&&'GRN',u.notify_dispatch&&'Dispatch',u.notify_progress&&'Progress',u.notify_ra&&'RA'].filter(Boolean).join(', ')||'None'}
                  </td>
                  <td><span className={`badge ${u.is_active?'badge-green':'badge-gray'}`}>{u.is_active?'Active':'Inactive'}</span></td>
                  <td>
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn btn-sm" onClick={()=>editUser(u)}>Edit</button>
                      <button className="btn btn-sm" onClick={()=>toggleActive(u)}>{u.is_active?'Deactivate':'Activate'}</button>
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
