import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import GRNPage from './pages/scm/GRNPage'
import DispatchPage from './pages/scm/DispatchPage'
import InvoiceListPage from './pages/accounts/InvoiceListPage'
import RABillPage from './pages/ra/RABillPage'
import SiteProgressPage from './pages/site/SiteProgressPage'
import UsersPage from './pages/admin/UsersPage'
import ProjectsPage from './pages/admin/ProjectsPage'
import BOQPage from './pages/admin/BOQPage'
import ProfilePage from './pages/ProfilePage'

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',color:'var(--text-s)'}}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role) && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',color:'var(--text-s)',fontSize:'13px'}}>Loading portal...</div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="grn"      element={<PrivateRoute roles={['scm','admin']}><GRNPage /></PrivateRoute>} />
        <Route path="dispatch" element={<PrivateRoute roles={['scm','admin']}><DispatchPage /></PrivateRoute>} />
        <Route path="invoice"  element={<PrivateRoute roles={['accounts','admin']}><InvoiceListPage /></PrivateRoute>} />
        <Route path="ra"       element={<PrivateRoute roles={['accounts','admin']}><RABillPage /></PrivateRoute>} />
        <Route path="site"     element={<PrivateRoute roles={['site','admin']}><SiteProgressPage /></PrivateRoute>} />
        <Route path="users"    element={<PrivateRoute roles={['admin']}><UsersPage /></PrivateRoute>} />
        <Route path="projects" element={<PrivateRoute roles={['admin']}><ProjectsPage /></PrivateRoute>} />
        <Route path="boq"      element={<PrivateRoute roles={['admin']}><BOQPage /></PrivateRoute>} />
        <Route path="profile"  element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
