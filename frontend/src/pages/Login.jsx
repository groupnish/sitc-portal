import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]     = useState({ email:'', password:'' })
  const [loading, setLoading] = useState(false)

  const handle = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch(err) {
      toast.error(err.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <img src="/sitc-portal/logo.png" alt="Group Nish Logo"
            style={{width:140, height:'auto', marginBottom:12, display:'block', margin:'0 auto 12px'}} />
          <h1 style={{fontSize:18, color:'#1a1a18', fontWeight:600}}>Project Tracker</h1>
          <p style={{fontSize:11, color:'var(--text-s)', marginTop:3}}>
            SCM · Dispatch · Site Progress · RA Bills
          </p>
        </div>
        <form onSubmit={handle} style={{marginTop:24}}>
          <div className="form-group" style={{marginBottom:12}}>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" required
              value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
              placeholder="you@groupnish.com" autoFocus />
          </div>
          <div className="form-group" style={{marginBottom:20}}>
            <label className="form-label">Password</label>
            <input className="form-input" type="password" required
              value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}
              placeholder="••••••••" />
          </div>
          <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{marginTop:16,fontSize:11,color:'var(--text-s)',textAlign:'center'}}>
          Contact Admin to reset your password
        </p>
      </div>
    </div>
  )
}
