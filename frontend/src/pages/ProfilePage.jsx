import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { auth, users } from '../services/api'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { user } = useAuth()
  const [pwd, setPwd] = useState({ current_password:'', new_password:'' })
  const [loading, setLoading] = useState(false)

  const changePwd = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await auth.changePwd(pwd)
      toast.success('Password changed')
      setPwd({ current_password:'', new_password:'' })
    } catch(e) { toast.error(e.response?.data?.error||'Error')
    } finally { setLoading(false) }
  }

  const ROLE_BADGE = {admin:'badge-gray',scm:'badge-teal',accounts:'badge-purple',site:'badge-coral',management:'badge-amber'}

  return (
    <div style={{maxWidth:500}}>
      <div className="card">
        <div className="card-header"><span className="card-title">My profile</span></div>
        <div className="card-body">
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20}}>
            <div style={{width:52,height:52,borderRadius:'50%',background:'var(--teal-l)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:600,color:'var(--teal)'}}>
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{fontWeight:500,fontSize:15}}>{user?.name}</div>
              <div style={{fontSize:12,color:'var(--text-s)'}}>{user?.email}</div>
              <span className={`badge ${ROLE_BADGE[user?.role]||'badge-gray'}`} style={{marginTop:4}}>{user?.role}</span>
            </div>
          </div>
          <div style={{fontSize:13,color:'var(--text-s)'}}>
            WhatsApp: {user?.phone_whatsapp || '— not set (contact Admin)'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Change password</span></div>
        <div className="card-body">
          <form onSubmit={changePwd}>
            <div className="form-group" style={{marginBottom:12}}>
              <label className="form-label">Current password</label>
              <input className="form-input" type="password" required value={pwd.current_password} onChange={e=>setPwd(p=>({...p,current_password:e.target.value}))} />
            </div>
            <div className="form-group" style={{marginBottom:16}}>
              <label className="form-label">New password</label>
              <input className="form-input" type="password" required minLength={6} value={pwd.new_password} onChange={e=>setPwd(p=>({...p,new_password:e.target.value}))} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading?'Saving…':'Change password'}</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">PWA install guide</span></div>
        <div className="card-body" style={{fontSize:13,lineHeight:1.8,color:'var(--text-s)'}}>
          <strong style={{color:'var(--text)'}}>Android (Chrome):</strong><br/>
          Open this portal in Chrome → tap 3-dot menu → "Add to Home Screen" → Install<br/><br/>
          <strong style={{color:'var(--text)'}}>iPhone / iPad (Safari only):</strong><br/>
          Open in Safari → tap Share button → scroll down → "Add to Home Screen" → Add<br/><br/>
          After installing, the portal opens full-screen like a native app with an icon on your home screen.
        </div>
      </div>
    </div>
  )
}
