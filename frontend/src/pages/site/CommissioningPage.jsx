import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { site, users } from '../../services/api'
import { openWhatsApp, progressWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]

export default function CommissioningPage() {
  const { activeProject } = useAuth()
  const [items, setItems]     = useState([])
  const [current, setCurrent] = useState({})
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState('all')
  const [progDate, setProgDate] = useState(today())

  useEffect(() => {
    if (!activeProject) return
    load()
    users.waContacts().then(r => setContacts(r.data)).catch(() => {})
  }, [activeProject])

  const load = () => {
    setLoading(true)
    site.list(activeProject.id)
      .then(r => setItems(r.data))
      .finally(() => setLoading(false))
  }

  const setCurr = (id, val) => setCurrent(c => ({ ...c, [id]: val }))

  const save = async () => {
    const updates = Object.entries(current)
      .filter(([, v]) => v !== '' && parseFloat(v) > 0)
      .map(([id, v]) => ({
        boq_item_id: parseInt(id),
        qty_installed: 0,
        qty_commissioned: parseFloat(v),
        notes: `Commissioning entry — ${progDate}`,
        progress_date: progDate,
      }))

    if (!updates.length) { toast.error('No quantities entered'); return }
    setLoading(true)
    try {
      await site.update(activeProject.id, { updates })
      toast.success(`${updates.length} commissioning entries saved — Accounts notified`)
      setCurrent({})
      load()
    } catch (e) {
      toast.error('Error saving')
    } finally { setLoading(false) }
  }

  const zones = [...new Set(items.map(i => i.site_zone).filter(Boolean))]
  const filtered = filter === 'all' ? items : items.filter(i => i.site_zone === filter)

  const totalPct = items.length
    ? Math.round(items.reduce((a, i) => a + Math.min(i.pct_commissioned, 100), 0) / items.length)
    : 0

  const pendingCount = Object.values(current).filter(v => v !== '' && parseFloat(v) > 0).length

  const sendWA = contact => openWhatsApp(contact.phone, progressWhatsAppMsg(pendingCount, activeProject))

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Overall commissioning</div>
          <div className="stat-value">{totalPct}%</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${totalPct}%`, background: 'var(--purple)' }} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total BOQ items</div>
          <div className="stat-value">{items.length}</div>
          <div className="stat-sub">across all zones</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unsaved entries</div>
          <div className="stat-value" style={{ color: pendingCount > 0 ? 'var(--purple)' : 'var(--text)' }}>
            {pendingCount}
          </div>
          <div className="stat-sub">ready to save</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Commissioning entry</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="form-input" type="date" value={progDate}
              onChange={e => setProgDate(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }} />
            <select className="form-select" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
              value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All zones</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            {contacts.length > 0 && (
              <select className="form-select" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
                onChange={e => {
                  const c = contacts.find(x => x.id === parseInt(e.target.value))
                  if (c) sendWA(c)
                  e.target.value = ''
                }}>
                <option value="">WhatsApp update</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button className="btn btn-sm" onClick={save} disabled={loading}
              style={{ background: 'var(--purple)', color: '#fff', border: 'none' }}>
              {loading ? 'Saving…' : `Save ${pendingCount > 0 ? `(${pendingCount})` : ''}`}
            </button>
          </div>
        </div>

        <div className="alert alert-info" style={{ margin: '12px 16px 0', marginBottom: 0 }}>
          Enter qty commissioned <strong>in this period only</strong>. Previous total shown for reference.
          Current entry will be used for RA bill computation (Part 2 commissioning value).
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Description</th>
                <th>Zone</th>
                <th style={{ textAlign: 'right' }}>PO qty</th>
                <th style={{ textAlign: 'right' }}>Prev. comm.</th>
                <th style={{ textAlign: 'right', color: 'var(--purple)', minWidth: 110 }}>Current entry</th>
                <th style={{ textAlign: 'right' }}>Total comm.</th>
                <th style={{ minWidth: 120 }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
              {filtered.map(item => {
                const prev = item.total_commissioned || 0
                const curr = parseFloat(current[item.id] || 0)
                const total = prev + curr
                const pct = item.po_qty > 0 ? Math.min(Math.round(total / item.po_qty * 100), 100) : 0
                const prevPct = item.pct_commissioned || 0

                return (
                  <tr key={item.id} style={{ background: current[item.id] ? 'var(--purple-l)' : '' }}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{item.sr_no}</td>
                    <td style={{ maxWidth: 180, fontSize: 12 }}>{item.description.substring(0, 80)}</td>
                    <td style={{ fontSize: 11 }}>{item.site_zone?.split(' ')[0]}</td>
                    <td style={{ textAlign: 'right' }}>{item.po_qty} {item.unit}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-s)' }}>{prev} {item.unit}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number" min="0" step="any"
                        style={{
                          width: 90, padding: '5px 8px',
                          border: '1px solid var(--purple)',
                          borderRadius: 6, fontSize: 13,
                          background: 'var(--white)',
                          color: 'var(--text)',
                          textAlign: 'right'
                        }}
                        placeholder="0"
                        value={current[item.id] || ''}
                        onChange={e => setCurr(item.id, e.target.value)}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-s)', marginLeft: 4 }}>{item.unit}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{total.toFixed(total % 1 === 0 ? 0 : 2)} {item.unit}</td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ fontSize: 11, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-s)' }}>Prev: {prevPct}%</span>
                        <span style={{ color: 'var(--purple)', fontWeight: curr > 0 ? 600 : 400 }}>Now: {pct}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${prevPct}%`, opacity: 0.4, background: 'var(--purple)' }} />
                      </div>
                      <div className="progress-bar" style={{ marginTop: 2 }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--purple)' }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="empty">No items found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
