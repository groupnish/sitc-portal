// BOQPage.jsx
import { useEffect, useState, useRef } from 'react'
import { boq } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const BLANK = { sr_no:'', description:'', po_qty:'', unit:'Nos.', rate:'', site_zone:'MPS SITE', item_type:'supply', hsn_code:'' }
const ZONES = ['MPS SITE','STP SITE','SPS SITE','GENERAL']
const TYPES = ['supply','erection','commissioning']

// Inline edit form rendered inside the table row
function InlineEditForm({ item, onSave, onCancel }) {
  const [form, setForm] = useState({
    sr_no:      item.sr_no,
    description:item.description,
    po_qty:     item.po_qty,
    unit:       item.unit,
    rate:       item.rate,
    site_zone:  item.site_zone,
    item_type:  item.item_type,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const data = {
      ...form,
      po_qty: parseFloat(form.po_qty),
      rate:   parseFloat(form.rate || 0),
      amount: parseFloat(form.po_qty) * parseFloat(form.rate || 0),
    }
    try {
      await boq.update(item.id, data)
      toast.success('Item updated')
      onSave()
    } catch(e) {
      toast.error(e.response?.data?.error || 'Error updating item')
    } finally { setSaving(false) }
  }

  return (
    <tr>
      <td colSpan={9} style={{ padding: 0 }}>
        <div style={{
          background: 'var(--teal-l)',
          border: '2px solid var(--teal)',
          borderRadius: 10,
          padding: '14px 16px',
          margin: '4px 0',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', marginBottom: 10 }}>
            ✏ Editing: {item.sr_no}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="form-group">
              <label className="form-label">Item No. *</label>
              <input className="form-input" value={form.sr_no}
                onChange={e => set('sr_no', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Unit *</label>
              <input className="form-input" value={form.unit}
                onChange={e => set('unit', e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Description *</label>
            <textarea className="form-textarea" style={{ minHeight: 56 }} value={form.description}
              onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="form-group">
              <label className="form-label">PO Qty *</label>
              <input className="form-input" type="number" step="any" value={form.po_qty}
                onChange={e => set('po_qty', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Rate (₹)</label>
              <input className="form-input" type="number" step="any" value={form.rate}
                onChange={e => set('rate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Site Zone</label>
              <select className="form-select" value={form.site_zone}
                onChange={e => set('site_zone', e.target.value)}>
                {ZONES.map(z => <option key={z}>{z}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Item Type</label>
              <select className="form-select" value={form.item_type}
                onChange={e => set('item_type', e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  )
}

export function BOQPage() {
  const { activeProject, user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [items, setItems]     = useState([])
  const [form, setForm]       = useState(BLANK)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [editingId, setEditingId] = useState(null) // inline edit

  // Import Excel state
  const fileInputRef = useRef(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  useEffect(() => { if (activeProject) load() }, [activeProject])
  const load = () => boq.list(activeProject.id).then(r => setItems(r.data))
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Add new item ──────────────────────────────────────────────────────────
  const submit = async e => {
    e.preventDefault()
    const data = {
      ...form,
      po_qty: parseFloat(form.po_qty),
      rate:   parseFloat(form.rate || 0),
      amount: parseFloat(form.po_qty) * parseFloat(form.rate || 0),
    }
    try {
      await boq.add(activeProject.id, data)
      toast.success('Item added')
      setForm(BLANK); setShowForm(false); load()
    } catch(e) { toast.error(e.response?.data?.error || 'Error') }
  }

  const del = async id => {
    if (!confirm('Delete this BOQ item?')) return
    await boq.del(id); toast.success('Deleted'); load()
  }

  // ── Import Excel handlers ────────────────────────────────────────────────
  const onFilePicked = async e => {
    const file = e.target.files[0]
    if (!file) return
    setPendingFile(file)
    setImporting(true)
    try {
      const res = await boq.importExcel(activeProject.id, file, true)
      setImportPreview(res.data)
    } catch(err) {
      toast.error(err.response?.data?.error || 'Could not read file')
      setPendingFile(null)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!pendingFile) return
    setImporting(true)
    try {
      const res = await boq.importExcel(activeProject.id, pendingFile, false)
      toast.success(res.data.message)
      setImportPreview(null); setPendingFile(null); load()
    } catch(err) {
      toast.error(err.response?.data?.error || 'Import failed')
    } finally { setImporting(false) }
  }

  const cancelImport = () => { setImportPreview(null); setPendingFile(null) }

  // ── Filter + search ──────────────────────────────────────────────────────
  const filtered = items
    .filter(i => filter === 'all' || i.site_zone === filter)
    .filter(i => {
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return i.sr_no.toLowerCase().includes(q) ||
             i.description.toLowerCase().includes(q)
    })

  const total = items.reduce((a, i) => a + i.amount, 0)

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      {/* ── Top action bar ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:14, fontWeight:500 }}>
          BOQ manager — {activeProject.code} ({items.length} items)
        </h2>
        <div style={{ display:'flex', gap:8 }}>
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls"
            style={{ display:'none' }} onChange={onFilePicked}
          />
          {isAdmin && <>
            <button className="btn btn-sm" disabled={importing}
              onClick={() => fileInputRef.current?.click()}>
              {importing ? 'Reading…' : '⬆ Import Excel'}
            </button>
            <button className="btn btn-primary btn-sm"
              onClick={() => { setForm(BLANK); setShowForm(s => !s); setEditingId(null) }}>
              {showForm ? 'Cancel' : '+ Add item'}
            </button>
          </>}
        </div>
      </div>

      {/* ── Import preview ────────────────────────────────────────────────── */}
      {importPreview && (
        <div className="card" style={{ marginBottom:16, border:'1px solid var(--teal)' }}>
          <div className="card-header">
            <span className="card-title">
              Import preview — {importPreview.rows.length} item(s) found,
              total ₹{Number(importPreview.total_amount).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="card-body">
            {importPreview.duplicates_in_db?.length > 0 && (
              <div className="alert alert-warning" style={{ marginBottom:12, fontSize:12 }}>
                {importPreview.duplicates_in_db.length} Item No(s) already exist and will be <b>skipped</b>: {importPreview.duplicates_in_db.join(', ')}
              </div>
            )}
            {importPreview.row_errors?.length > 0 && (
              <div className="alert alert-warning" style={{ marginBottom:12, fontSize:12 }}>
                {importPreview.row_errors.length} row(s) had issues and were skipped:
                <ul style={{ margin:'4px 0 0 16px' }}>
                  {importPreview.row_errors.map((e,i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="table-wrap" style={{ maxHeight:280, overflowY:'auto' }}>
              <table>
                <thead>
                  <tr><th>Item No.</th><th>Description</th><th>Zone</th><th>Type</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((r,i) => (
                    <tr key={i} style={importPreview.duplicates_in_db?.includes(r.sr_no) ? { opacity:0.4 } : {}}>
                      <td style={{ fontWeight:500 }}>{r.sr_no}</td>
                      <td style={{ maxWidth:220, fontSize:12 }}>{r.description.substring(0,80)}</td>
                      <td style={{ fontSize:11 }}>{r.site_zone}</td>
                      <td><span className={`badge ${r.item_type==='supply'?'badge-teal':r.item_type==='erection'?'badge-coral':'badge-amber'}`}>{r.item_type}</span></td>
                      <td>{r.po_qty}</td><td>{r.unit}</td>
                      <td>{Number(r.rate).toLocaleString('en-IN')}</td>
                      <td>₹{Number(r.amount).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button className="btn btn-primary" disabled={importing} onClick={confirmImport}>
                {importing ? 'Importing…' : `Confirm import (${importPreview.rows.length - (importPreview.duplicates_in_db?.length||0)} new items)`}
              </button>
              <button className="btn btn-sm" disabled={importing} onClick={cancelImport}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add item form ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-header">
            <span className="card-title">New BOQ item</span>
          </div>
          <div className="card-body">
            <form onSubmit={submit}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Item No. *</label>
                  <input className="form-input" required value={form.sr_no}
                    onChange={e => set('sr_no', e.target.value)} placeholder="S-1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit *</label>
                  <input className="form-input" required value={form.unit}
                    onChange={e => set('unit', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:12 }}>
                <label className="form-label">Description *</label>
                <textarea className="form-textarea" required value={form.description}
                  onChange={e => set('description', e.target.value)} />
              </div>
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label className="form-label">PO Qty *</label>
                  <input className="form-input" type="number" step="any" required value={form.po_qty}
                    onChange={e => set('po_qty', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Rate (₹)</label>
                  <input className="form-input" type="number" step="any" value={form.rate}
                    onChange={e => set('rate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Site Zone</label>
                  <select className="form-select" value={form.site_zone}
                    onChange={e => set('site_zone', e.target.value)}>
                    {ZONES.map(z => <option key={z}>{z}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:12 }}>
                <label className="form-label">Item Type</label>
                <select className="form-select" value={form.item_type}
                  onChange={e => set('item_type', e.target.value)}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom:12 }}>
                <label className="form-label">HSN / SAC Code</label>
                <input className="form-input" value={form.hsn_code||''}
                  onChange={e => set('hsn_code', e.target.value)} placeholder="e.g. 8537" />
              </div>
              <button className="btn btn-primary" type="submit">Add item</button>
            </form>
          </div>
        </div>
      )}

      {/* ── BOQ table with search + filter ───────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">BOQ items — Total: ₹{(total/100000).toFixed(2)}L</span>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {/* Search box */}
            <input
              className="form-input"
              style={{ width:200, fontSize:12, padding:'4px 10px' }}
              placeholder="Search item no. or description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="btn btn-sm" style={{ padding:'4px 8px' }}
                onClick={() => setSearch('')}>✕</button>
            )}
            <select className="form-select"
              style={{ width:'auto', fontSize:12, padding:'4px 8px' }}
              value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All zones</option>
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>

        {/* Search result count */}
        {search && (
          <div style={{ padding:'6px 16px', fontSize:12, color:'var(--text-s)',
            borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''} found
            {filtered.length === 0 && ` matching "${search}"`}
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item No.</th>
                <th>Description</th>
                <th>Zone</th>
                <th>Type</th>
                <th>HSN</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Rate</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="empty">
                  {search ? `No items match "${search}"` : 'No items found.'}
                </td></tr>
              )}
              {filtered.map(i => (
                <>
                  <tr key={i.id}
                    style={{ background: editingId === i.id ? 'var(--teal-l)' : '' }}>
                    <td style={{ fontWeight:500 }}>{i.sr_no}</td>
                    <td style={{ maxWidth:200, fontSize:12 }}>{i.description.substring(0,80)}</td>
                    <td style={{ fontSize:11 }}>{i.site_zone}</td>
                    <td>
                      <span className={`badge ${i.item_type==='supply'?'badge-teal':i.item_type==='erection'?'badge-coral':'badge-amber'}`}>
                        {i.item_type}
                      </span>
                    </td>
                    <td style={{fontSize:11}}>{i.hsn_code||'—'}</td>
                    <td>{i.po_qty}</td>
                    <td>{i.unit}</td>
                    <td>{Number(i.rate).toLocaleString('en-IN')}</td>
                    <td>₹{Number(i.amount).toLocaleString('en-IN')}</td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        {isAdmin && <>
                          <button className="btn btn-sm"
                            onClick={() => setEditingId(editingId === i.id ? null : i.id)}>
                            {editingId === i.id ? 'Cancel' : 'Edit'}
                          </button>
                          <button className="btn btn-sm btn-danger"
                            onClick={() => del(i.id)}>Del</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                  {editingId === i.id && (
                    <InlineEditForm
                      key={`edit-${i.id}`}
                      item={i}
                      onSave={() => { setEditingId(null); load() }}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default BOQPage
