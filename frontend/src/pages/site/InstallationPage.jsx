import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { site, users } from '../../services/api'
import { openWhatsApp, progressWhatsAppMsg } from '../../utils/whatsapp'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]

export default function InstallationPage() {
  const { activeProject, user } = useAuth()
  const [items, setItems]       = useState([])
  const [current, setCurrent]   = useState({})
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(false)
  const [filter, setFilter]     = useState('all')
  const [progDate, setProgDate] = useState(today())

  // Admin edit-entries state
  const isAdmin = user?.role === 'admin'
  const [editItem, setEditItem]     = useState(null)   // BOQ item currently being reviewed
  const [entries, setEntries]       = useState([])      // full history for editItem
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null) // entry id being edited inline
  const [editForm, setEditForm]     = useState({ qty_installed: '', progress_date: '', notes: '' })
  const [savingEntry, setSavingEntry] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    load()
    users.waContacts().then(r => setContacts(r.data)).catch(() => {})
  }, [activeProject])

  const load = () => {
    setLoading(true)
    site.list(activeProject.id)
      .then(r => {
        // Only supply/erection items for installation
        const filtered = r.data.filter(i => i.item_type === 'supply' || i.item_type === 'erection')
        setItems(filtered)
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
    } catch (e) {
      toast.error('Error saving')
    } finally { setLoading(false) }
  }

  // ── Admin: view / edit entry history ──────────────────────────────────
  const openHistory = async (item) => {
    setEditItem(item)
    setEntriesLoading(true)
    setEditingEntry(null)
    try {
      const r = await site.entries(activeProject.id, item.id)
      setEntries(r.data)
    } catch (e) {
      toast.error('Could not load entry history')
    } finally {
      setEntriesLoading(false)
    }
  }

  const closeHistory = () => {
    setEditItem(null)
    setEntries([])
    setEditingEntry(null)
  }

  const startEditEntry = (entry) => {
    setEditingEntry(entry.id)
    setEditForm({
      qty_installed: entry.qty_installed,
      progress_date: entry.progress_date,
      notes: entry.notes || '',
    })
  }

  const cancelEditEntry = () => {
    setEditingEntry(null)
    setEditForm({ qty_installed: '', progress_date: '', notes: '' })
  }

  const saveEditEntry = async (entryId) => {
    setSavingEntry(true)
    try {
      await site.editEntry(entryId, {
        qty_installed: parseFloat(editForm.qty_installed || 0),
        progress_date: editForm.progress_date,
        notes: editForm.notes,
      })
      toast.success('Entry updated')
      setEditingEntry(null)
      // Refresh both the history list and the main table totals
      const r = await site.entries(activeProject.id, editItem.id)
      setEntries(r.data)
      load()
    } catch (e) {
      toast.error('Error updating entry')
    } finally {
      setSavingEntry(false)
    }
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
      {/* Summary stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Overall installation</div>
          <div className="stat-value">{totalPct}%</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${totalPct}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">BOQ items (supply/erection)</div>
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

      {/* Admin: entry history / edit panel */}
      {isAdmin && editItem && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--teal)' }}>
          <div className="card-header">
            <span className="card-title">
              Entry history — {editItem.sr_no} ({editItem.description.substring(0, 60)})
            </span>
            <button className="btn btn-sm" onClick={closeHistory}>Close</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Qty installed</th>
                  <th>Notes</th>
                  <th>Updated by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entriesLoading && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
                {!entriesLoading && entries.length === 0 && (
                  <tr><td colSpan={5} className="empty">No entries yet.</td></tr>
                )}
                {!entriesLoading && entries.map(e => (
                  <tr key={e.id}>
                    {editingEntry === e.id ? (
                      <>
                        <td>
                          <input type="date" className="form-input"
                            style={{ padding: '4px 6px', fontSize: 12 }}
                            value={editForm.progress_date}
                            onChange={ev => setEditForm(f => ({ ...f, progress_date: ev.target.value }))} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input type="number" step="any" className="form-input"
                            style={{ width: 90, padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                            value={editForm.qty_installed}
                            onChange={ev => setEditForm(f => ({ ...f, qty_installed: ev.target.value }))} />
                        </td>
                        <td>
                          <input type="text" className="form-input"
                            style={{ padding: '4px 6px', fontSize: 12, width: '100%' }}
                            value={editForm.notes}
                            onChange={ev => setEditForm(f => ({ ...f, notes: ev.target.value }))} />
                        </td>
                        <td style={{ fontSize: 12 }}>{e.updated_by_name}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-primary" disabled={savingEntry}
                              onClick={() => saveEditEntry(e.id)}>
                              {savingEntry ? '…' : 'Save'}
                            </button>
                            <button className="btn btn-sm" onClick={cancelEditEntry}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontSize: 12 }}>{e.progress_date}</td>
                        <td style={{ textAlign: 'right' }}>{e.qty_installed} {e.unit}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-s)' }}>{e.notes}</td>
                        <td style={{ fontSize: 12 }}>{e.updated_by_name}</td>
                        <td>
                          <button className="btn btn-sm" onClick={() => startEditEntry(e)}>Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Installation entry</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input className="form-input" type="date" value={progDate}
                onChange={e => setProgDate(e.target.value)}
                style={{ padding: '4px 8px', fontSize: 12 }} />
            </div>
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
            <button className="btn btn-primary btn-sm" onClick={save} disabled={loading}>
              {loading ? 'Saving…' : `Save ${pendingCount > 0 ? `(${pendingCount})` : ''}`}
            </button>
          </div>
        </div>

        <div className="alert alert-info" style={{ margin: '12px 16px 0', marginBottom: 0 }}>
          Enter qty installed <strong>in this period only</strong>. Previous total is shown for reference. 
          Current entry will be used for RA bill computation.
          {isAdmin && ' Click a row\'s Sr. No. to view/correct previous entries.'}
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
              {loading && (
                <tr><td colSpan={8} className="empty">Loading…</td></tr>
              )}
              {filtered.map(item => {
                const prev = item.total_installed || 0
                const curr = parseFloat(current[item.id] || 0)
                const total = prev + curr
                const pct = item.po_qty > 0 ? Math.min(Math.round(total / item.po_qty * 100), 100) : 0
                const prevPct = item.pct_installed || 0

                return (
                  <tr key={item.id} style={{ background: current[item.id] ? 'var(--teal-l)' : '' }}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {isAdmin ? (
                        <button
                          onClick={() => openHistory(item)}
                          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--teal)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 500, fontSize: 'inherit' }}
                          title="View / edit previous entries"
                        >
                          {item.sr_no}
                        </button>
                      ) : item.sr_no}
                    </td>
                    <td style={{ maxWidth: 180, fontSize: 12 }}>{item.description.substring(0, 80)}</td>
                    <td style={{ fontSize: 11 }}>{item.site_zone?.split(' ')[0]}</td>
                    <td style={{ textAlign: 'right' }}>{item.po_qty} {item.unit}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-s)' }}>{prev} {item.unit}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number" min="0" step="any"
                        style={{
                          width: 90, padding: '5px 8px',
                          border: '1px solid var(--teal)',
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
