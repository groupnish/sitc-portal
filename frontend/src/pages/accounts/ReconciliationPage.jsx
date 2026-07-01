// ReconciliationPage.jsx — accounts + admin only
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ra } from '../../services/api'
import toast from 'react-hot-toast'

const fmt = n => n ? `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

export default function ReconciliationPage() {
  const { activeProject } = useAuth()
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    ra.reconciliation(activeProject.id)
      .then(r => setItems(r.data))
      .catch(() => toast.error('Could not load reconciliation data'))
      .finally(() => setLoading(false))
  }, [activeProject])

  const downloadExcel = () => {
    const url = ra.reconciliationXlsxUrl(activeProject.id)
    const token = localStorage.getItem('access_token')
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob() })
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `Reconciliation_${activeProject.code}.xlsx`
        a.click()
      }).catch(() => toast.error('Export failed'))
  }

  const sites   = [...new Set(items.map(i => i.site).filter(Boolean))]
  const filtered = filter === 'all' ? items : items.filter(i => i.site === filter)

  const totalBilledOld = items.reduce((a, i) => a + i.total_billed, 0)
  const closed   = items.filter(i => i.disposition?.includes('Closed')).length
  const pending  = items.filter(i => i.disposition?.includes('Pending')).length
  const descoped = items.filter(i => i.disposition?.includes('DESCOPED')).length
  const balance  = items.filter(i => i.disposition?.includes('Balance')).length

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      {/* Summary stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Total old WO billed</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            Rs. {(totalBilledOld / 100000).toFixed(2)}L
          </div>
          <div className="stat-sub">Gharpure WO-249 Amd-2</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Closed items</div>
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{closed}</div>
          <div className="stat-sub">Fully billed under old WO</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending I&C</div>
          <div className="stat-value" style={{ color: 'var(--purple)' }}>{pending}</div>
          <div className="stat-sub">Re-priced to Part 2</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Balance supply</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{balance}</div>
          <div className="stat-sub">Re-priced to Part 1</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Reconciliation — Old WO (Gharpure) vs New PO (BEIL Amd-3)
            &nbsp;·&nbsp;
            <span style={{ fontSize: 11, color: 'var(--text-s)', fontWeight: 400 }}>
              Frozen audit record — read only
            </span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="form-select"
              style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
              value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-sm" onClick={downloadExcel}>
              ⬇ Export Excel
            </button>
          </div>
        </div>

        <div className="alert alert-info" style={{ margin: '12px 16px 0', marginBottom: 0, fontSize: 12 }}>
          Old-WO billing stays with Gharpure account. This new order covers only balance supply (Part 1)
          and pending I&C (Part 2) at re-negotiated rates. Do not edit — frozen audit record.
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Old Sr.</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Old Rate</th>
                <th style={{ textAlign: 'right' }}>Old Qty</th>
                <th style={{ textAlign: 'right' }}>Billed Supply</th>
                <th style={{ textAlign: 'right' }}>Billed Install</th>
                <th style={{ textAlign: 'right' }}>Billed Comm.</th>
                <th style={{ textAlign: 'right' }}>Total Billed</th>
                <th>Disposition in New PO</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="empty">Loading…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="empty">
                  No reconciliation data found.
                  {items.length === 0 && ' Contact admin to load the reconciliation master.'}
                </td></tr>
              )}
              {filtered.map(item => {
                const disp = item.disposition || ''
                const rowBg = disp.includes('Closed') ? 'var(--teal-l)'
                  : disp.includes('DESCOPED') ? 'var(--coral-l)'
                  : disp.includes('Pending') ? 'var(--purple-l)'
                  : ''
                return (
                  <tr key={item.id} style={{ background: rowBg }}>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      <span className={`badge ${
                        item.site === 'STP SITE' ? 'badge-teal' :
                        item.site === 'MPS SITE' ? 'badge-purple' : 'badge-amber'
                      }`}>{item.site}</span>
                    </td>
                    <td style={{ fontSize: 11, fontWeight: 500 }}>{item.old_sr}</td>
                    <td style={{ maxWidth: 220, fontSize: 11 }}>
                      {(item.description || '').substring(0, 100)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{fmt(item.old_rate)}</td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{item.old_qty}</td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{fmt(item.billed_supply)}</td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{fmt(item.billed_install)}</td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{fmt(item.billed_comm)}</td>
                    <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 500 }}>
                      {fmt(item.total_billed)}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      <span className={`badge ${
                        disp.includes('Closed') ? 'badge-teal' :
                        disp.includes('DESCOPED') ? 'badge-coral' :
                        disp.includes('Pending') ? 'badge-purple' :
                        disp.includes('Balance') ? 'badge-amber' : 'badge-gray'
                      }`} style={{ whiteSpace: 'normal', padding: '2px 6px' }}>
                        {disp}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length > 0 && (
                <tr style={{ background: 'var(--teal-l)', fontWeight: 600 }}>
                  <td colSpan={8} style={{ textAlign: 'right', fontSize: 12 }}>
                    Total billed under old WO ({filtered.length} items):
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>
                    {fmt(filtered.reduce((a, i) => a + i.total_billed, 0))}
                  </td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
