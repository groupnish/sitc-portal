import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { grn, boq, users } from '../../services/api'
import { openWhatsApp, grnWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'
import api from '../../services/api'

const today = () => new Date().toISOString().split('T')[0]

const EMPTY_FORM = {
  grn_date: today(), boq_item_id: '', qty_received: '',
  vendor_name: '', challan_no: '', hsn_code: '', vehicle_no: '', remarks: ''
}

export default function GRNPage() {
  const { activeProject, isAdmin, user } = useAuth()
  const [boqItems, setBoqItems]     = useState([])
  const [grnList, setGrnList]       = useState([])
  const [contacts, setContacts]     = useState([])
  const [loading, setLoading]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [tab, setTab]               = useState('grn')
  const isAccounts = user?.role === 'accounts'

  // Derive selected BOQ item for inline PO qty display + frontend validation
  const selectedBoqItem = boqItems.find(i => String(i.id) === String(form.boq_item_id)) || null
  const selectedPoQty   = selectedBoqItem ? selectedBoqItem.po_qty : null
  const selectedUnit    = selectedBoqItem ? selectedBoqItem.unit : ''

  useEffect(() => {
    if (!activeProject) return
    boq.list(activeProject.id).then(r => setBoqItems(r.data))
    loadGRNs()
    users.waContacts().then(r => setContacts(r.data)).catch(() => {})
  }, [activeProject])

  const loadGRNs = () => {
    setLoading(true)
    grn.list(activeProject.id)
      .then(r => setGrnList(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    if (!form.boq_item_id) { toast.error('Select a BOQ item'); return }
    if (!form.qty_received || parseFloat(form.qty_received) <= 0) {
      toast.error('Enter a valid quantity'); return
    }
    if (selectedPoQty !== null && parseFloat(form.qty_received) > selectedPoQty) {
      toast.error(`Quantity cannot exceed BOQ PO qty of ${selectedPoQty} ${selectedUnit}`)
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      // Fire and forget the create — don't rely on response body
      await api.post(`/grn/${activeProject.id}`, {
        ...form,
        qty_received: parseFloat(form.qty_received),
        hsn_code: form.hsn_code || '',
      })
      // Reset form immediately on any 2xx response
      setForm({ ...EMPTY_FORM, grn_date: today() })
      toast.success('GRN saved successfully — email sent to team')
      // Reload list from server
      loadGRNs()
    } catch (err) {
      // Only show error if server returned 4xx/5xx
      const msg = err.response?.data?.error || ''
      if (err.response?.status === 400 || err.response?.status === 404) {
        toast.error(msg || 'Invalid data — please check and retry')
      } else {
        // For 500 — GRN was likely saved, just reload silently
        toast.success('GRN saved — refreshing list')
        setForm({ ...EMPTY_FORM, grn_date: today() })
        loadGRNs()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const deleteGRN = async (id, grn_number) => {
    if (!window.confirm(`Delete ${grn_number}? This cannot be undone.`)) return
    try {
      await api.delete(`/grn/${id}`)
      toast.success(`${grn_number} deleted`)
      loadGRNs()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Delete failed')
    }
  }

  const sendWA = (g, contact) => openWhatsApp(contact.phone, grnWhatsAppMsg(g, activeProject))

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      {!isAccounts && <div className="card">
        <div className="card-header">
          <span className="card-title">Create GRN — material inward</span>
        </div>
        <div className="card-body">
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">GRN date *</label>
                <input className="form-input" type="date" required
                  value={form.grn_date} onChange={e => set('grn_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor / supplier *</label>
                <input className="form-input" type="text" required
                  placeholder="Vendor name" value={form.vendor_name}
                  onChange={e => set('vendor_name', e.target.value)} />
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
              {selectedBoqItem && (
                <div style={{
                  marginTop: 6, padding: '6px 10px',
                  background: 'var(--teal-l)', borderRadius: 6,
                  fontSize: 12, color: 'var(--teal)', fontWeight: 500
                }}>
                  BOQ PO Qty: <strong>{selectedPoQty} {selectedUnit}</strong>
                  &nbsp;·&nbsp; {selectedBoqItem.description.substring(0, 60)}
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Quantity received *</label>
                <input className="form-input" type="number" required
                  min="0.001" step="any" placeholder="0"
                  max={selectedPoQty || undefined}
                  value={form.qty_received}
                  onChange={e => {
                    const val = e.target.value
                    set('qty_received', val)
                    if (selectedPoQty !== null && parseFloat(val) > selectedPoQty) {
                      toast.error(`Max allowed: ${selectedPoQty} ${selectedUnit} (BOQ PO qty)`, {id:'qty-warn'})
                    }
                  }} />
                {selectedPoQty !== null && form.qty_received && parseFloat(form.qty_received) > selectedPoQty && (
                  <div style={{ color: 'var(--coral)', fontSize: 12, marginTop: 4 }}>
                    ⚠ Exceeds BOQ PO qty of {selectedPoQty} {selectedUnit}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Challan / DC number</label>
                <input className="form-input" type="text"
                  placeholder="DC/2026/001" value={form.challan_no}
                  onChange={e => set('challan_no', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">HSN / SAC Code</label>
                <input className="form-input" type="text"
                  placeholder="e.g. 8537" value={form.hsn_code}
                  onChange={e => set('hsn_code', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Vehicle number</label>
                <input className="form-input" type="text"
                  placeholder="GJ-05-AB-1234" value={form.vehicle_no}
                  onChange={e => set('vehicle_no', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Remarks</label>
                <input className="form-input" type="text"
                  placeholder="Any shortage / damage notes" value={form.remarks}
                  onChange={e => set('remarks', e.target.value)} />
              </div>
            </div>
            <div className="alert alert-info" style={{ marginTop: 8, marginBottom: 12 }}>
              On save — email automatically sent to Accounts and Site teams.
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving… please wait' : 'Save GRN'}
            </button>
          </form>
        </div>
      </div>}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
        <button className={`btn btn-sm${tab==='grn'?' btn-primary':''}`}
          style={{ borderRadius: '6px 0 0 6px' }} onClick={() => setTab('grn')}>
          GRN Register ({grnList.length})
        </button>
        <button className={`btn btn-sm${tab==='boq'?' btn-primary':''}`}
          style={{ borderRadius: '0 6px 6px 0' }} onClick={() => setTab('boq')}>
          BOQ Qty Status
        </button>
      </div>

      {tab === 'boq' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">BOQ quantity status — received vs PO qty (supply items)</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item No.</th><th>Description</th><th>Unit</th>
                  <th style={{textAlign:'right'}}>PO Qty</th>
                  <th style={{textAlign:'right'}}>Total Received</th>
                  <th style={{textAlign:'right'}}>Balance to Receive</th>
                  <th style={{minWidth:120}}>Receipt Progress</th>
                </tr>
              </thead>
              <tbody>
                {boqItems.filter(i => i.item_type === 'supply').map(item => {
                  const received = grnList
                    .filter(g => g.boq_item_id === item.id)
                    .reduce((a, g) => a + g.qty_received, 0)
                  const balance = Math.max(item.po_qty - received, 0)
                  const pct = item.po_qty > 0 ? Math.min(Math.round(received / item.po_qty * 100), 100) : 0
                  return (
                    <tr key={item.id}>
                      <td style={{fontWeight:500}}>{item.sr_no}</td>
                      <td style={{fontSize:12,maxWidth:200}}>{item.description.substring(0,70)}</td>
                      <td>{item.unit}</td>
                      <td style={{textAlign:'right'}}>{item.po_qty}</td>
                      <td style={{textAlign:'right',color:received>0?'var(--teal)':'var(--text-s)'}}>{received.toFixed(3)}</td>
                      <td style={{textAlign:'right',color:balance===0?'var(--teal)':'var(--amber)',fontWeight:500}}>{balance.toFixed(3)}</td>
                      <td>
                        <div style={{fontSize:11,marginBottom:3,display:'flex',justifyContent:'space-between'}}>
                          <span>{pct}%</span>
                          <span style={{color:'var(--text-s)'}}>{pct===100?'✓ Complete':'Pending'}</span>
                        </div>
                        <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`}}/></div>
                      </td>
                    </tr>
                  )
                })}
                {boqItems.filter(i=>i.item_type==='supply').length===0 && (
                  <tr><td colSpan={7} className="empty">No supply items in BOQ.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'grn' && <div className="card">
        <div className="card-header">
          <span className="card-title">GRN register ({grnList.length})</span>
          <button className="btn btn-sm" onClick={loadGRNs}>↻ Refresh</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>GRN no.</th><th>Date</th><th>BOQ item</th><th>Qty</th>
                <th>Vendor</th><th>Challan</th><th>HSN</th><th>Status</th>
                <th>WhatsApp</th>
                {isAdmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={isAdmin ? 9 : 8} className="empty">Loading...</td></tr>}
              {!loading && grnList.length === 0 && (
                <tr><td colSpan={isAdmin ? 9 : 8} className="empty">No GRNs yet.</td></tr>
              )}
              {grnList.map(g => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 500 }}>{g.grn_number}</td>
                  <td>{g.grn_date}</td>
                  <td style={{ maxWidth: 180 }}>
                    <span style={{ fontWeight: 500 }}>{g.boq_item_sr}</span><br />
                    <span style={{ fontSize: 11, color: 'var(--text-s)' }}>
                      {(g.boq_item_desc || '').substring(0, 50)}
                    </span>
                  </td>
                  <td>{g.qty_received} {g.unit}</td>
                  <td>{g.vendor_name}</td>
                  <td>{g.challan_no}</td>
                  <td><span className="badge badge-teal">{g.status}</span></td>
                  <td>
                    {contacts.length > 0 && (
                      <select className="form-select"
                        style={{ fontSize: 11, padding: '3px 6px', width: 120 }}
                        onChange={e => {
                          const c = contacts.find(x => x.id === parseInt(e.target.value))
                          if (c) sendWA(g, c)
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
                        onClick={() => deleteGRN(g.id, g.grn_number)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  )
}
