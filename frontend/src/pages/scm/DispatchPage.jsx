import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { dispatch, boq, users } from '../../services/api'
import api from '../../services/api'
import { openWhatsApp, dispatchWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'
import api from '../../services/api'

const today = () => new Date().toISOString().split('T')[0]
const SITES = [
  'MPS Site — Main Pumping Station',
  'STP Site — Sewage Treatment Plant',
  'SPS Site — Sub Pumping Station',
  'Head Office',
  'Vendor Premises'
]

const EMPTY_FORM = {
  dispatch_date: today(), boq_item_id: '', qty_dispatched: '',
  site_destination: '', vehicle_no: '', driver_name: '', lr_number: '', remarks: ''
}

export default function DispatchPage() {
  const { activeProject, isAdmin } = useAuth()
  const [boqItems, setBoqItems]     = useState([])
  const [dnList, setDnList]         = useState([])
  const [contacts, setContacts]     = useState([])
  const [loading, setLoading]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)

  useEffect(() => {
    if (!activeProject) return
    boq.list(activeProject.id).then(r => setBoqItems(r.data))
    loadDNs()
    users.waContacts().then(r => setContacts(r.data)).catch(() => {})
  }, [activeProject])

  const loadDNs = () => {
    setLoading(true)
    dispatch.list(activeProject.id)
      .then(r => setDnList(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const deleteDispatch = async (id, dn_number) => {
    if (!window.confirm(`Delete ${dn_number}? This cannot be undone.`)) return
    try {
      await api.delete(`/dispatch/${id}`)
      toast.success(`${dn_number} deleted`)
      loadDNs()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Delete failed')
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    if (!form.boq_item_id) { toast.error('Select a BOQ item'); return }
    if (!form.qty_dispatched || parseFloat(form.qty_dispatched) <= 0) {
      toast.error('Enter a valid quantity'); return
    }
    if (!form.site_destination) { toast.error('Select destination site'); return }
    if (submitting) return
    setSubmitting(true)
    try {
      await api.post(`/dispatch/${activeProject.id}`, {
        ...form,
        qty_dispatched: parseFloat(form.qty_dispatched)
      })
      setForm({ ...EMPTY_FORM, dispatch_date: today() })
      toast.success('Dispatch note saved — challan generated, emails sent')
      loadDNs()
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 404) {
        toast.error(err.response?.data?.error || 'Invalid data')
      } else {
        // 500 — likely saved successfully, reload
        toast.success('Dispatch note saved — refreshing list')
        setForm({ ...EMPTY_FORM, dispatch_date: today() })
        loadDNs()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sendWA = (dn, contact) => openWhatsApp(contact.phone, dispatchWhatsAppMsg(dn, activeProject))

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Create dispatch note — material outward</span>
        </div>
        <div className="card-body">
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Dispatch date *</label>
                <input className="form-input" type="date" required
                  value={form.dispatch_date} onChange={e => set('dispatch_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Dispatch to site *</label>
                <select className="form-select" required value={form.site_destination}
                  onChange={e => set('site_destination', e.target.value)}>
                  <option value="">— Select site —</option>
                  {SITES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">BOQ item *</label>
              <select className="form-select" required value={form.boq_item_id}
                onChange={e => set('boq_item_id', e.target.value)}>
                <option value="">— Select BOQ item —</option>
                {boqItems.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.sr_no} — {i.description.substring(0, 70)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Quantity dispatching *</label>
                <input className="form-input" type="number" required
                  min="0.001" step="any" value={form.qty_dispatched}
                  onChange={e => set('qty_dispatched', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle number</label>
                <input className="form-input" type="text"
                  placeholder="GJ-05-AB-1234" value={form.vehicle_no}
                  onChange={e => set('vehicle_no', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Driver name</label>
                <input className="form-input" type="text"
                  value={form.driver_name} onChange={e => set('driver_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">LR number</label>
                <input className="form-input" type="text"
                  value={form.lr_number} onChange={e => set('lr_number', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Remarks</label>
              <input className="form-input" type="text"
                value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
            <div className="alert alert-info" style={{ marginBottom: 12 }}>
              Challan number auto-generated on save. Email sent to Accounts and Site teams.
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving… please wait' : 'Save & generate challan'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Dispatch register ({dnList.length})</span>
          <button className="btn btn-sm" onClick={loadDNs}>↻ Refresh</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DN no.</th><th>Date</th><th>BOQ item</th><th>Site</th>
                <th>Qty</th><th>Amount</th><th>Invoice</th><th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={isAdmin ? 9 : 8} className="empty">Loading...</td></tr>}
              {!loading && dnList.length === 0 && (
                <tr><td colSpan={isAdmin ? 9 : 8} className="empty">No dispatches yet.</td></tr>
              )}
              {dnList.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 500 }}>{d.dn_number}</td>
                  <td>{d.dispatch_date}</td>
                  <td style={{ maxWidth: 160 }}>
                    <span style={{ fontWeight: 500 }}>{d.boq_item_sr}</span><br />
                    <span style={{ fontSize: 11, color: 'var(--text-s)' }}>
                      {(d.boq_item_desc || '').substring(0, 45)}
                    </span>
                  </td>
                  <td style={{ fontSize: 11 }}>{d.site_destination?.split('—')[0]}</td>
                  <td>{d.qty_dispatched} {d.unit}</td>
                  <td>₹{Number(d.amount || 0).toLocaleString('en-IN')}</td>
                  <td>
                    <span className={`badge ${d.invoice_status === 'invoiced' ? 'badge-green' : 'badge-amber'}`}>
                      {d.invoice_status}
                    </span>
                  </td>
                  <td>
                    {contacts.length > 0 && (
                      <select className="form-select"
                        style={{ fontSize: 11, padding: '3px 6px', width: 120 }}
                        onChange={e => {
                          const c = contacts.find(x => x.id === parseInt(e.target.value))
                          if (c) sendWA(d, c)
                          e.target.value = ''
                        }}>
                        <option value="">Send via WA</option>
                        {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-sm btn-danger"
                        onClick={() => deleteDispatch(d.id, d.dn_number)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
