import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { applyResponsiveTableLabels } from '../utils/responsiveTable'
import toast from 'react-hot-toast'

const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>

const ICONS = {
  home:     "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  truck:    "M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  package:  "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 001 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  invoice:  "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  receipt:  "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  factory:  "M2 20h20M6 20V10l6-6 6 6v10M10 20v-5h4v5",
  users:    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z",
  folder:   "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z",
  list:     "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  user:     "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  logout:   "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  menu:     "M3 12h18M3 6h18M3 18h18",
  bell:     "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
}

export default function Layout() {
  const { user, logout, projectList, activeProject, switchProject, isAdmin, isSCM, isAccounts, isSite } = useAuth()
  const [sideOpen, setSideOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => { logout(); navigate('/login') }

  // Auto-tag tables for the mobile card layout (index.css .table-cards rules)
  // on every navigation and shortly after, to catch tables that render
  // asynchronously once their data finishes loading.
  useEffect(() => {
    applyResponsiveTableLabels()
    const t1 = setTimeout(applyResponsiveTableLabels, 300)
    const t2 = setTimeout(applyResponsiveTableLabels, 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [location.pathname])



  const roleBadge = { admin:'badge-gray', scm:'badge-teal', accounts:'badge-purple', site:'badge-coral', management:'badge-amber' }

  return (
    <div className="app-shell">
      {/* Overlay */}
      <div className={`sidebar-overlay ${sideOpen ? 'show' : ''}`} onClick={() => setSideOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${sideOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/sitc-portal/logo.png" alt="Group Nish"
            style={{width:'100%', maxWidth:150, height:'auto', display:'block', margin:'0 auto'}} />
        </div>

        {projectList.length > 0 && (
          <div className="project-switcher">
            <label>Active project</label>
            <select value={activeProject?.id||''} onChange={e=>{
              const p=projectList.find(x=>x.id===parseInt(e.target.value))
              if(p) switchProject(p)
            }}>
              {projectList.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name.substring(0,30)}</option>)}
            </select>
          </div>
        )}

        <div className="nav-section">Main</div>
        <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/" end onClick={()=>setSideOpen(false)}>
          <Icon d={ICONS.home}/> Dashboard
        </NavLink>

        {isSCM && <>
          <div className="nav-section">SCM</div>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/grn" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.truck}/> Material inward
          </NavLink>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/dispatch" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.package}/> Dispatch / outward
          </NavLink>
        </>}

        {isAccounts && <>
          <div className="nav-section">Accounts</div>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/invoice" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.invoice}/> Invoice list
          </NavLink>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/ra" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.receipt}/> RA bill
          </NavLink>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/reconciliation" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.list}/> Reconciliation
          </NavLink>
        </>}

        {isSite && <>
          <div className="nav-section">Projects</div>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/installation" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.factory}/> Installation
          </NavLink>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/commissioning" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.settings}/> Commissioning
          </NavLink>
        </>}

        {isAdmin && <>
          <div className="nav-section">Admin</div>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/projects" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.folder}/> Projects
          </NavLink>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/boq" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.list}/> BOQ manager
          </NavLink>
          <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/users" onClick={()=>setSideOpen(false)}>
            <Icon d={ICONS.users}/> Users
          </NavLink>
        </>}

        <NavLink className={({isActive})=>`nav-item${isActive?' active':''}`} to="/profile" onClick={()=>setSideOpen(false)}>
          <Icon d={ICONS.user}/> My profile
        </NavLink>
        <div className="nav-item" onClick={handleLogout} style={{cursor:'pointer',color:'var(--coral)'}}>
          <Icon d={ICONS.logout}/> Logout
        </div>

      </aside>

      {/* Main */}
      <div className="main-area">
        <header className="topbar">
          <button className="menu-btn" onClick={()=>setSideOpen(s=>!s)} aria-label="Menu">
            <Icon d={ICONS.menu}/>
          </button>
          <span className="topbar-title">{activeProject?.name || 'Project Tracker — Group Nish'}</span>
          <div className="topbar-actions">
            <span className={`badge ${roleBadge[user?.role]||'badge-gray'}`}>{user?.role}</span>
            <span style={{fontSize:12,color:'var(--text-s)'}}>{user?.name}</span>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
