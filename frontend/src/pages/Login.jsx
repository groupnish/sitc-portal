import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || 'https://sitc-portal.onrender.com/api'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]       = useState({ email:'', password:'' })
  const [loading, setLoading] = useState(false)
  const [waking, setWaking]   = useState(false)
  const [ready, setReady]     = useState(false)

  // Wake up backend as soon as login page loads
  useEffect(() => {
    setWaking(true)
    const wake = async () => {
      try {
        // Ping the backend to wake it up
        await fetch(`${API_URL}/auth/me`, {
          method: 'GET',
          signal: AbortSignal.timeout(60000)
        })
      } catch(e) {
        // Any response (even 401) means backend is awake
      } finally {
        setWaking(false)
        setReady(true)
      }
    }
    wake()
  }, [])

  const handle = async e => {
    e.preventDefault()
    if (waking) {
      toast('Server is starting up, please wait a moment...', { icon: '⏳' })
      return
    }
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch(err) {
      toast.error(err.response?.data?.error || 'Login failed — please try again')
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

        {/* Wake-up status indicator */}
        {waking && (
          <div style={{
            margin:'12px 0 0',
            padding:'8px 12px',
            background:'var(--amber-l)',
            borderRadius:'var(--radius)',
            fontSize:12,
            color:'var(--amber)',
            textAlign:'center',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            gap:8
          }}>
            <span style={{animation:'spin 1s linear infinite',display:'inline-block'}}>⏳</span>
            Starting server... please wait ({`~30 seconds on first load`})
          </div>
        )}
        {ready && !waking && (
          <div style={{
            margin:'12px 0 0',
            padding:'6px 12px',
            background:'var(--teal-l)',
            borderRadius:'var(--radius)',
            fontSize:12,
            color:'var(--teal-d)',
            textAlign:'center'
          }}>
            ✓ Server ready — you can login now
          </div>
        )}

        <form onSubmit={handle} style={{marginTop:16}}>
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
          <button className="btn btn-primary"
            style={{width:'100%', justifyContent:'center', opacity: waking ? 0.6 : 1}}
            disabled={loading || waking}>
            {waking ? 'Starting server...' : loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{marginTop:16,fontSize:11,color:'var(--text-s)',textAlign:'center'}}>
          Contact Admin to reset your password
        </p>
      </div>
    </div>
  )
}
