// ReconciliationPage.jsx — Dynamic BOQ reconciliation
// Auto-generated from GRN, Dispatch, Site Progress, RA Bills
// Works for both Work Contract and Purchase Order projects
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { boq, grn, dispatch, site, ra } from '../../services/api'
import toast from 'react-hot-toast'

const fmt = n => n ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
const fmtQty = n => n ? Number(n).toFixed(3).replace(/\.?0+$/, '') : '0'

export default function ReconciliationPage() {
  const { activeProject } = useAuth()
  const [loading, setLoading]   = useState(false)
  const [rows, setRows]         = useState([])
  const [filter, setFilter]     = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const isPO = activeProject?.project_type === 'purchase_order'

  useEffect(() => {
    if (!activeProject) return
    buildReconciliation()
  }, [activeProject])

  const buildReconciliation = async () => {
    setLoading(true)
    try {
      // Fetch all data in parallel
      const [boqRes, grnRes, dispRes, siteRes, raRes] = await Promise.all([
        boq.list(activeProject.id),
        grn.list(activeProject.id),
        dispatch.list(activeProject.id),
        site.list(activeProject.id),
        ra.list(activeProject.id),
      ])

      const boqItems   = boqRes.data
      const grnList    = grnRes.data
      const dnList     = dispRes.data
      const siteItems  = siteRes.data   // already aggregated per BOQ item
      const raBills    = raRes.data

      // Build per-BOQ-item reconciliation rows
      const reconciled = boqItems.map(item => {
        // GRN received
        const itemGrns = grnList.filter(g => g.boq_item_id === item.id)
        const totalReceived = itemGrns.reduce((a, g) => a + g.qty_received, 0)

        // Dispatched
        const itemDNs = dnList.filter(d => d.boq_item_id === item.id)
        const totalDispatched = itemDNs.reduce((a, d) => a + d.qty_dispatched, 0)
        const invoicedDNs = itemDNs.filter(d => d.invoice_status === 'invoiced')
        const totalInvoiced = invoicedDNs.reduce((a, d) => a + d.qty_dispatched, 0)

        // Invoice numbers for this item (PO projects)
        const invoiceNos = [...new Set(
          invoicedDNs.map(d => d.bc_invoice_no || d.dn_number).filter(Boolean)
        )].join(', ')

        // Site progress (Work Contract)
        const siteItem = siteItems.find(s => s.id === item.id)
        const totalInstalled    = siteItem ? siteItem.total_installed    : 0
        const totalCommissioned = siteItem ? siteItem.total_commissioned : 0

        // RA bills containing this item
        const raBillNos = raBills
          .filter(ra => ra.status !== 'draft' ||
            // include all for now — filter to those with non-zero qty_this for this item
            true
          )
          .map(ra => ra.invoice_no)

        // Billed amounts from RA bill lines (supply/erection/commissioning)
        // We approximate from the ra bills list
        const billedInRA = raBills.length > 0 ? raBills
          .filter(r => r.status !== 'void')
          .map(r => r.invoice_no)
          .join(', ') : '—'

        // Balance calculations
        const balanceToReceive  = Math.max(item.po_qty - totalReceived, 0)
        const balanceToDispatch = Math.max(totalReceived - totalDispatched, 0)
        const balanceToInvoice  = Math.max(totalDispatched - totalInvoiced, 0)
        const balanceToInstall  = Math.max(totalDispatched - totalInstalled, 0)
        const balanceToCommission = Math.max(totalInstalled - totalCommissioned, 0)

        // Status
        let status = 'pending'
        if (isPO) {
          if (totalInvoiced >= item.po_qty) status = 'complete'
          else if (totalDispatched > 0) status = 'partial'
        } else {
          if (totalCommissioned >= item.po_qty) status = 'complete'
          else if (totalInstalled > 0 || totalDispatched > 0) status = 'partial'
        }

        return {
          id: item.id,
          sr_no: item.sr_no,
          description: item.description,
          unit: item.unit,
          site_zone: item.site_zone,
          item_type: item.item_type,
          po_qty: item.po_qty,
          rate: item.rate,
          // GRN
          total_received: totalReceived,
          balance_to_receive: balanceToReceive,
          // Dispatch
          total_dispatched: totalDispatched,
          total_invoiced: totalInvoiced,
          balance_to_dispatch: balanceToDispatch,
          balance_to_invoice: balanceToInvoice,
          invoice_nos: invoiceNos,
          // Site (WC only)
          total_installed: totalInstalled,
          total_commissioned: totalCommissioned,
          balance_to_install: balanceToInstall,
          balance_to_commission: balanceToCommission,
          ra_bill_nos: billedInRA,
          // Status
          status,
        }
      })

      setRows(reconciled)
    } catch(e) {
      toast.error('Could not load reconciliation data')
    } finally {
      setLoading(false)
    }
  }

  const zones = [...new Set(rows.map(r => r.site_zone).filter(Boolean))]
  const filtered = rows
    .filter(r => filter === 'all' || r.site_zone === filter)
    .filter(r => typeFilter === 'all' || r.item_type === typeFilter)

  const completeCount = rows.filter(r => r.status === 'complete').length
  const partialCount  = rows.filter(r => r.status === 'partial').length
  const pendingCount  = rows.filter(r => r.status === 'pending').length
  const totalPOQtyValue = rows.reduce((a, r) => a + r.po_qty * r.rate, 0)
  const totalDispatchedValue = rows.reduce((a, r) => a + r.total_dispatched * r.rate, 0)

  const downloadExcel = () => {
    toast('Excel export coming soon')
  }

  if (!activeProject) return <div className="alert alert-warning">Select a project first.</div>

  return (
    <div>
      {/* Summary stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Total BOQ items</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-sub">Rs. {(totalPOQtyValue/100000).toFixed(2)}L order value</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Complete</div>
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{completeCount}</div>
          <div className="stat-sub">fully {isPO ? 'invoiced' : 'commissioned'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In progress</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{partialCount}</div>
          <div className="stat-sub">partially done</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: 'var(--text-s)' }}>{pendingCount}</div>
          <div className="stat-sub">not started</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Reconciliation — {activeProject.code} · {activeProject.name}
            <span style={{ fontSize: 11, color: 'var(--text-s)', fontWeight: 400, marginLeft: 8 }}>
              {isPO ? 'Purchase Order' : 'Work Contract'} · auto-generated · read only
            </span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="form-select" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
              value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All types</option>
              <option value="supply">Supply</option>
              <option value="erection">Erection</option>
              <option value="commissioning">Commissioning</option>
            </select>
            <select className="form-select" style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
              value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All zones</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <button className="btn btn-sm" onClick={buildReconciliation}>↻ Refresh</button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item No.</th>
                <th>Description</th>
                <th>Zone</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>PO Qty</th>
                <th style={{ textAlign: 'right' }}>Received</th>
                <th style={{ textAlign: 'right' }}>Dispatched</th>
                {isPO ? <>
                  <th style={{ textAlign: 'right' }}>Invoiced Qty</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>Invoice Ref.</th>
                </> : <>
                  <th style={{ textAlign: 'right' }}>Installed</th>
                  <th style={{ textAlign: 'right' }}>Commissioned</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>RA Bill Ref.</th>
                </>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={isPO ? 11 : 12} className="empty">Loading…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={isPO ? 11 : 12} className="empty">
                  No BOQ items found. Add items in BOQ Manager first.
                </td></tr>
              )}
              {filtered.map(item => (
                <tr key={item.id} style={{
                  background:
                    item.status === 'complete' ? 'var(--teal-l)' :
                    item.status === 'partial'  ? '#fffbeb' : ''
                }}>
                  <td style={{ fontWeight: 500, fontSize: 12 }}>{item.sr_no}</td>
                  <td style={{ fontSize: 11, maxWidth: 180 }}>{item.description.substring(0, 70)}</td>
                  <td style={{ fontSize: 11 }}>{item.site_zone?.split(' ')[0]}</td>
                  <td>
                    <span className={`badge ${
                      item.item_type === 'supply' ? 'badge-teal' :
                      item.item_type === 'erection' ? 'badge-coral' : 'badge-amber'
                    }`}>{item.item_type}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtQty(item.po_qty)} {item.unit}</td>
                  <td style={{ textAlign: 'right', fontSize: 12,
                    color: item.total_received > 0 ? 'var(--teal)' : 'var(--text-s)' }}>
                    {fmtQty(item.total_received)}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12,
                    color: item.total_dispatched > 0 ? 'var(--teal)' : 'var(--text-s)' }}>
                    {fmtQty(item.total_dispatched)}
                  </td>
                  {isPO ? <>
                    <td style={{ textAlign: 'right', fontSize: 12,
                      color: item.total_invoiced > 0 ? 'var(--teal)' : 'var(--text-s)' }}>
                      {fmtQty(item.total_invoiced)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12,
                      fontWeight: item.balance_to_invoice > 0 ? 600 : 400,
                      color: item.balance_to_invoice > 0 ? 'var(--amber)' : 'var(--teal)' }}>
                      {fmtQty(item.balance_to_invoice)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-s)' }}>
                      {item.invoice_nos || '—'}
                    </td>
                  </> : <>
                    <td style={{ textAlign: 'right', fontSize: 12,
                      color: item.total_installed > 0 ? 'var(--teal)' : 'var(--text-s)' }}>
                      {fmtQty(item.total_installed)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12,
                      color: item.total_commissioned > 0 ? 'var(--teal)' : 'var(--text-s)' }}>
                      {fmtQty(item.total_commissioned)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12,
                      fontWeight: item.balance_to_commission > 0 ? 600 : 400,
                      color: item.balance_to_commission > 0 ? 'var(--amber)' : 'var(--teal)' }}>
                      {fmtQty(item.balance_to_commission)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-s)' }}>
                      {item.ra_bill_nos !== '—' ? item.ra_bill_nos : '—'}
                    </td>
                  </>}
                  <td>
                    <span className={`badge ${
                      item.status === 'complete' ? 'badge-green' :
                      item.status === 'partial'  ? 'badge-amber' : 'badge-gray'
                    }`}>{item.status}</span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length > 0 && (
                <tr style={{ background: 'var(--teal-l)', fontWeight: 600 }}>
                  <td colSpan={4} style={{ textAlign: 'right', fontSize: 12 }}>
                    Totals ({filtered.length} items):
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>
                    {fmtQty(filtered.reduce((a, r) => a + r.po_qty, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>
                    {fmtQty(filtered.reduce((a, r) => a + r.total_received, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>
                    {fmtQty(filtered.reduce((a, r) => a + r.total_dispatched, 0))}
                  </td>
                  {isPO ? <>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>
                      {fmtQty(filtered.reduce((a, r) => a + r.total_invoiced, 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>
                      {fmtQty(filtered.reduce((a, r) => a + r.balance_to_invoice, 0))}
                    </td>
                    <td></td>
                  </> : <>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>
                      {fmtQty(filtered.reduce((a, r) => a + r.total_installed, 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>
                      {fmtQty(filtered.reduce((a, r) => a + r.total_commissioned, 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>
                      {fmtQty(filtered.reduce((a, r) => a + r.balance_to_commission, 0))}
                    </td>
                    <td></td>
                  </>}
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
