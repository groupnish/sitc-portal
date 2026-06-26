import { createContext, useContext, useState, useEffect } from 'react'
import { auth, projects } from '../services/api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [projectList, setProjectList] = useState([])
  const [activeProject, setActiveProject] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      auth.me()
        .then(r => { setUser(r.data); loadProjects() })
        .catch(() => { localStorage.clear(); setLoading(false) })
    } else setLoading(false)
  }, [])

  const loadProjects = async () => {
    try {
      const r = await projects.list()
      setProjectList(r.data)
      const saved = localStorage.getItem('active_project')
      if (saved) {
        const found = r.data.find(p => p.id === parseInt(saved))
        if (found) setActiveProject(found)
        else if (r.data.length) setActiveProject(r.data[0])
      } else if (r.data.length) setActiveProject(r.data[0])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  const login = async (email, password) => {
    const r = await auth.login({ email, password })
    localStorage.setItem('access_token',  r.data.access_token)
    localStorage.setItem('refresh_token', r.data.refresh_token)
    setUser(r.data.user)
    await loadProjects()
    return r.data.user
  }

  const logout = () => {
    localStorage.clear()
    setUser(null)
    setActiveProject(null)
    setProjectList([])
  }

  const switchProject = p => {
    setActiveProject(p)
    localStorage.setItem('active_project', p.id)
  }

  const isAdmin      = user?.role === 'admin'
  const isSCM        = user?.role === 'scm' || isAdmin
  const isAccounts   = user?.role === 'accounts' || isAdmin
  const isSite       = user?.role === 'site' || isAdmin
  const isManagement = user?.role === 'management' || isAdmin

  return (
    <Ctx.Provider value={{
      user, loading, login, logout,
      projectList, activeProject, switchProject, loadProjects,
      isAdmin, isSCM, isAccounts, isSite, isManagement
    }}>
      {children}
    </Ctx.Provider>
  )
}
