import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://sitc-portal.onrender.com/api'

const api = axios.create({ baseURL: API_URL, withCredentials: false })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  async err => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const res = await axios.post(`${API_URL}/auth/refresh`,{},{ headers:{ Authorization:`Bearer ${refresh}` }})
          localStorage.setItem('access_token', res.data.access_token)
          err.config.headers.Authorization = `Bearer ${res.data.access_token}`
          return api(err.config)
        } catch {
          localStorage.clear()
          window.location.href = '/sitc-portal/'
        }
      }
    }
    return Promise.reject(err)
  }
)

export const auth = {
  login:  d => api.post('/auth/login', d),
  me:     () => api.get('/auth/me'),
  changePwd: d => api.put('/auth/change-password', d),
}
export const projects = {
  list:   () => api.get('/projects/'),
  get:    id => api.get(`/projects/${id}`),
  create: d  => api.post('/projects/', d),
  update: (id,d) => api.put(`/projects/${id}`, d),
}
export const boq = {
  list:   pid => api.get(`/boq/${pid}`),
  add:    (pid,d) => api.post(`/boq/${pid}`, d),
  bulk:   (pid,d) => api.post(`/boq/${pid}/bulk`, d),
  update: (id,d) => api.put(`/boq/item/${id}`, d),
  del:    id => api.delete(`/boq/item/${id}`),
  importExcel: (pid, file, preview=false) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/boq/${pid}/import-excel?preview=${preview}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}
export const grn = {
  list:   pid => api.get(`/grn/${pid}`),
  create: (pid,d) => api.post(`/grn/${pid}`, d),
  get:    id => api.get(`/grn/${id}`),
}
export const dispatch = {
  list:        pid => api.get(`/dispatch/${pid}`),
  create:      (pid,d) => api.post(`/dispatch/${pid}`, d),
  pending:     pid => api.get(`/dispatch/pending-invoice/${pid}`),
  markInvoiced:id => api.put(`/dispatch/${id}/mark-invoiced`),
}
export const site = {
  list:       pid => api.get(`/site/${pid}`),
  update:     (pid,d) => api.post(`/site/${pid}/update`, d),
  entries:    (pid,boqItemId) => api.get(`/site/entries/${pid}/${boqItemId}`),
  editEntry:  (id,d) => api.put(`/site/entry/${id}`, d),
}
export const ra = {
  list:              pid => api.get(`/ra/${pid}`),
  compute:           (pid,d) => api.post(`/ra/${pid}/compute`, d),
  save:              (pid,d) => api.post(`/ra/${pid}/save`, d),
  status:            (id,d) => api.put(`/ra/${id}/status`, d),
  pdfUrl:            id => `${API_URL}/ra/${id}/export/pdf`,
  xlsxUrl:           id => `${API_URL}/ra/${id}/export/excel`,
  taxInvoicePdfUrl:  id => `${API_URL}/ra/${id}/export/tax-invoice/pdf`,
  taxInvoiceXlsxUrl: id => `${API_URL}/ra/${id}/export/tax-invoice/excel`,
  reconciliation:    pid => api.get(`/ra/reconciliation/${pid}`),
  reconciliationXlsxUrl: pid => `${API_URL}/ra/reconciliation/${pid}/export/excel`,
}
export const users = {
  list:       () => api.get('/users/'),
  create:     d  => api.post('/users/', d),
  update:     (id,d) => api.put(`/users/${id}`, d),
  waContacts: () => api.get('/users/whatsapp-contacts'),
}
export const notifications = {
  list:       pid => api.get(`/notifications/?project_id=${pid}`),
  read:       id  => api.put(`/notifications/${id}/read`),
  readAll:    () => api.put('/notifications/read-all'),
}

export default api
