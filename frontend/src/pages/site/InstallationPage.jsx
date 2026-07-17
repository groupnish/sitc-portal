import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { site, users } from '../../services/api'
import { openWhatsApp, progressWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]

// Inline history panel rendered right below the clicked row
function InlineHistoryPanel({ item, projectId, onClose }) {
  const [entries, setEntries]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditingId]   = useState(null)
  const [editForm, setEditForm]     = useState({ qty_installed: '', progress_date: '', notes: '' })
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    site.entries(projectId, item.id)
      .then(r => setEntries(r.data))
      .catch(() => toast.error('Could not load history'))
      .finally(() => setLoading(false))
  }, [projectId, item.id])

  const startEdit = (e) => {
    setEditingId(e.id)
    setEditForm({ qty_installed: e.qty_installed, progress_date: e.progress_date, notes: e.notes || '' })
  }

  const saveEdit = async (eid) => {
    setSaving(true)
    try {
      await site.editEntry(eid, {
        qty_installed:  parseFloat(editForm.qty_installed || 0),
        progress_date:  editForm.progress_date,
        notes:          editForm.notes,
      })
      toast.success('Entry updated')
      setEditingId(null)
      const r = await site.entries(projectId, item.id)
      setEntries(r.data)
    } catch { toast.error('Error updating entry') }
    finally { setSaving(false) }
  }

  return (
    <tr>
      <td colSpan={8} style={{ padding: 0 }}>
        <div style={{
          background: 'var(--teal-l)', border: '2px solid var(--teal)',
          borderRadius: 10, margin: '4px 0', padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
              Entry history — {item.sr_no}: {item.description.substring(0, 60)}
            </span>
            <button className="btn btn-sm" onClick={onClose}>Close ✕</button>
          </div>
          {loading && <div style={{ fontSize: 12, color: 'var(--text-s)' }}>Loading…</div>}
          {!loading && entries.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-s)' }}>No entries yet.</div>}
          {!loading && entries.length > 0 && (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 500 }}>Qty Installed</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 500 }}>Notes</th>
                  <th style={{ padding: '5px 8px', fontWeight: 500 }}>By</th>
                  <th style={{ padding: '5px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                    {editingId === e.id ? (
                      <>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="date" className="form-input" style={{ padding: '3px 6px', fontSize: 12 }}
                            value={editForm.progress_date}
                            onChange={ev => setEditForm(f => ({ ...f, progress_date: ev.target.value }))} />
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                          <input type="number" step="any" className="form-input"
                            style={{ width: 90, padding: '3px 6px', fontSize: 12, textAlign: 'right' }}
                            value={editForm.qty_installed}
                            onChange={ev => setEditForm(f => ({ ...f, qty_installed: ev.target.value }))} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="text" className="form-input" style={{ padding: '3px 6px', fontSize: 12 }}
                            value={editForm.notes}
                            onChange={ev => setEditForm(f => ({ ...f, notes: ev.target.value }))} />
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-s)' }}>{e.updated_by_name}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-primary" disabled={saving}
                              onClick={() => saveEdit(e.id)}>{saving ? '…' : 'Save'}</button>
                            <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '5px 8px' }}>{e.progress_date}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 500 }}>
                          {e.qty_installed} {item.unit}
                        </td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-s)' }}>{e.notes}</td>
                        <td style={{ padding: '5px 8px', fontSize: 11, color: 'var(--text-s)' }}>{e.updated_by_name}</td>
                        <td style={{ padding: '5px 8px' }}>
                          <button className="btn btn-sm" onClick={() => startEdit(e)}>Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function InstallationPage() {
  const { activeProject, user } = useAuth()
  const [items, setItems]       = useState([])
  const [current, setCurrent]   = useState({})
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(false)
  const [filter, setFilter]     = useState('all')
  const [progDate, setProgDate] = useState(today())
  const [openHistoryId, setOpenHistoryId] = useState(null)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!activeProject) return
    load()
    users.waContacts().then(r => setContacts(r.data)).catch(() => {})
  }, [activeProject])

  const load = () => {
    setLoading(true)
    site.list(activeProject.id)
      .then(r => {
        setItems(r.data.filter(i => i.item_type === 'supply' || i.item_type === 'erection'))
      })
      .finally(() => setLoading(false))
  }

  const setCurr = (id, val) => setCurrent(c => ({ ...c, [id]: val }))

  const save = async () => {
    const updates = Object.entries(current)
      .filter(([, v]) => v !== '' && parseFloat(v) > 0)
      .map(([id, v]) => ({
        boq_item_id: parseInt(id),
        qty_installed: parseFloat(v),
        qty_commissioned: 0,
        notes: `Installation entry — ${progDate}`,
        progress_date: progDate,
      }))
    if (!updates.length) { toast.error('No quantities entered'); return }
    setLoading(true)
    try {
      await site.update(activeProject.id, { updates })
      toast.success(`${updates.length} installation entries saved — Accounts notified`)
      setCurrent({})
      load()
    } catch { toast.error('Error saving') }
    finally { setLoading(false) }
  }

  const zones = [...new Set(items.map(i => i.site_zone).filter(Boolean))]
  const filtered = filter === 'all' ? items : items.filter(i => i.site_zone === filter)

  const totalPct = items.length
    ? Math.round(items.reduce((a, i) => a + Math.min(i.pct_installed, 100), 0) / items.length)
    : 0
  const pendingCount = Object.values(current).filter(v => v !== '' && parseFloat(v) > 0).length
  const sendWA = contact => openWhatsApp(contact.phone, progressWhatsAppMsg(pendingCount, activeProject))

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Overall installation</div>
          <div className="stat-value">{totalPct}%</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${totalPct}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">BOQ items (supply/installation)</div>
          <div className="stat-value">{items.length}</div>
          <div className="stat-sub">across all zones</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unsaved entries</div>
          <div className="stat-value" style={{ color: pendingCount > 0 ? 'var(--teal)' : 'var(--text)' }}>
            {pendingCount}
          </div>
          <div className="stat-sub">ready to save</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Installation entry</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="form-input" type="date" value={progDate}
              onChange={e => setProgDate(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12 }} />
            <select className="form-select" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
              value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All zones</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            {contacts.length > 0 && (
              <select className="form-select" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
                onChange={e => { const c = contacts.find(x => x.id === parseInt(e.target.value)); if (c) sendWA(c); e.target.value = '' }}>
                <option value="">WhatsApp update</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button className="btn btn-primary btn-sm" onClick={save} disabled={loading}>
              {loading ? 'Saving…' : `Save ${pendingCount > 0 ? `(${pendingCount})` : ''}`}
            </button>
          </div>
        </div>

        <div className="alert alert-info" style={{ margin: '12px 16px 0', marginBottom: 0 }}>
          Enter qty installed <strong>in this period only</strong>. Previous total is shown for reference.
          {isAdmin && ' Admin: click any Sr. No. to view/edit previous entries inline.'}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Description</th>
                <th>Zone</th>
                <th style={{ textAlign: 'right' }}>PO qty</th>
                <th style={{ textAlign: 'right' }}>Prev. installed</th>
                <th style={{ textAlign: 'right', color: 'var(--teal)', minWidth: 110 }}>Current entry</th>
                <th style={{ textAlign: 'right' }}>Total installed</th>
                <th style={{ minWidth: 120 }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
              {filtered.map(item => {
                const prev    = item.total_installed || 0
                const curr    = parseFloat(current[item.id] || 0)
                const total   = prev + curr
                const pct     = item.po_qty > 0 ? Math.min(Math.round(total / item.po_qty * 100), 100) : 0
                const prevPct = item.pct_installed || 0
                const isOpen  = openHistoryId === item.id

                return (
                  <>
                    <tr key={item.id} style={{ background: current[item.id] ? 'var(--teal-l)' : isOpen ? '#f0fdf8' : '' }}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {isAdmin ? (
                          <button onClick={() => setOpenHistoryId(isOpen ? null : item.id)}
                            style={{ background: 'none', border: 'none', padding: 0,
                              color: 'var(--teal)', textDecoration: 'underline',
                              cursor: 'pointer', fontWeight: 500, fontSize: 'inherit' }}
                            title="View/edit previous entries">
                            {item.sr_no}
                          </button>
                        ) : item.sr_no}
                      </td>
                      <td style={{ maxWidth: 180, fontSize: 12 }}>{item.description.substring(0, 80)}</td>
                      <td style={{ fontSize: 11 }}>{item.site_zone?.split(' ')[0]}</td>
                      <td style={{ textAlign: 'right' }}>{item.po_qty} {item.unit}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-s)' }}>{prev} {item.unit}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input type="number" min="0" step="any"
                          style={{ width: 90, padding: '5px 8px', border: '1px solid var(--teal)',
                            borderRadius: 6, fontSize: 13, background: 'var(--white)',
                            color: 'var(--text)', textAlign: 'right' }}
                          placeholder="0" value={current[item.id] || ''}
                          onChange={e => setCurr(item.id, e.target.value)} />
                        <span style={{ fontSize: 11, color: 'var(--text-s)', marginLeft: 4 }}>{item.unit}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        {total.toFixed(total % 1 === 0 ? 0 : 2)} {item.unit}
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ fontSize: 11, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-s)' }}>Prev: {prevPct}%</span>
                          <span style={{ color: 'var(--teal)', fontWeight: curr > 0 ? 600 : 400 }}>Now: {pct}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${prevPct}%`, opacity: 0.4 }} />
                        </div>
                        <div className="progress-bar" style={{ marginTop: 2 }}>
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                    {isAdmin && isOpen && (
                      <InlineHistoryPanel
                        key={`hist-${item.id}`}
                        item={item}
                        projectId={activeProject.id}
                        onClose={() => setOpenHistoryId(null)}
                      />
                    )}
                  </>
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
