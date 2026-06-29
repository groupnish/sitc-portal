import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { grn, dispatch, ra, site, boq } from '../services/api'

const fmt = n => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtL = n => `₹${(Number(n||0)/100000).toFixed(2)}L`

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card" style={{ borderLeft: color ? `3px solid ${color}` : undefined }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header"><span className="card-title">{title}</span></div>
      <div className="card-body">
        <div className="stat-grid">{children}</div>
      </div>
    </div>
  )
}

// ── Admin / Management Dashboard ─────────────────────────────────────────────
function AdminDashboard({ p, stats }) {
  const woVal = p.wo_value || 0
  const totalReceived = (stats.invoicedAmt || 0) + (stats.raPaidAmt || 0)

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-s)' }}>WO: {p.wo_number} &nbsp;|&nbsp; Client: {p.client_name} &nbsp;|&nbsp; Amd: {p.amendment_no || '—'}</p>
      </div>
      <Section title="Project overview">
        <StatCard label="WO value" value={fmtL(woVal)} sub={`+ GST ${p.igst_rate}%`} color="#1D9E75" />
        <StatCard label="Total amount received" value={fmtL(totalReceived)} sub="Invoiced + RA paid" color="#534AB7" />
        <StatCard label="Balance to bill" value={fmtL(woVal - totalReceived)} sub="Remaining WO value" color="#BA7517" />
        <StatCard label="Advance received" value={fmtL(p.advance_received_incl_gst)} sub="Incl. GST" />
      </Section>
      <Section title="SCM activity">
        <StatCard label="GRNs created" value={stats.grns} sub="Material received" color="#1D9E75" />
        <StatCard label="BOQ items received" value={`${stats.grnsUnique} / ${stats.boqTotal}`} sub="Unique items" />
        <StatCard label="Dispatches to site" value={stats.dns} sub="Delivery notes" color="#1D9E75" />
        <StatCard label="Items pending dispatch" value={Math.max(0, stats.boqTotal - stats.dispatchedUnique)} sub="Not yet sent to site" />
      </Section>
      <Section title="Billing status">
        <StatCard label="Supply invoices raised" value={stats.invoiced} sub="Marked invoiced" color="#534AB7" />
        <StatCard label="Supply invoiced value" value={fmtL(stats.invoicedAmt)} sub="Excl. GST" color="#534AB7" />
        <StatCard label="RA bills generated" value={stats.raCount} sub="Running account" color="#BA7517" />
        <StatCard label="RA paid amount" value={fmtL(stats.raPaidAmt)} sub="Status: paid" color="#BA7517" />
      </Section>
      <Section title="Site progress">
        <StatCard label="Installation progress" value={`${stats.instPct}%`} sub="Overall installed" color="#D85A30" />
        <StatCard label="Commissioning progress" value={`${stats.commPct}%`} sub="Overall commissioned" color="#D85A30" />
        <StatCard label="MPS site progress" value={`${stats.mpsPct}%`} sub="Main pumping station" />
        <StatCard label="STP + SPS progress" value={`${stats.otherPct}%`} sub="Other zones" />
      </Section>
      <div className="card">
        <div className="card-header"><span className="card-title">Payment terms</span></div>
        <div className="card-body" style={{ fontSize: 13, color: 'var(--text-s)', lineHeight: 1.8 }}>
          {p.pt_notes || `Part 1: ${p.pt_advance_pct}% advance + ${p.pt_lc_pct}% LC. Part 2: ${p.pt_installation_pct}% installation + ${p.pt_commissioning_pct}% commissioning.`}
        </div>
      </div>
    </div>
  )
}

// ── Accounts Dashboard ────────────────────────────────────────────────────────
function AccountsDashboard({ p, stats }) {
  const woVal = p.wo_value || 0
  const totalInvoiced = (stats.invoicedAmt || 0) + (stats.raPaidAmt || 0)
  const completionPct = woVal > 0 ? Math.round(totalInvoiced / woVal * 100) : 0

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-s)' }}>WO: {p.wo_number} &nbsp;|&nbsp; Invoice prefix: {p.invoice_prefix}</p>
      </div>
      <Section title="Material movement">
        <StatCard label="GRNs created" value={stats.grns} sub="Items received at store" color="#1D9E75" />
        <StatCard label="GRNs pending" value={Math.max(0, stats.boqTotal - stats.grnsUnique)} sub="BOQ items not yet received" color="#D85A30" />
        <StatCard label="Dispatched to site" value={stats.dns} sub="Delivery notes raised" color="#1D9E75" />
        <StatCard label="Pending dispatch" value={stats.pendingInvoice} sub="Dispatched, not invoiced" color="#BA7517" />
      </Section>
      <Section title="Invoicing status">
        <StatCard label="Supply invoices raised" value={stats.invoiced} sub="Marked as invoiced in ERP" color="#534AB7" />
        <StatCard label="Supply invoiced value" value={fmtL(stats.invoicedAmt)} sub="Excl. GST" color="#534AB7" />
        <StatCard label="RA bills generated" value={stats.raCount} sub="Running account bills" color="#BA7517" />
        <StatCard label="RA bills paid" value={stats.raPaid} sub={`Value: ${fmtL(stats.raPaidAmt)}`} color="#1D9E75" />
      </Section>
      <Section title="Project completion">
        <StatCard label="WO value" value={fmtL(woVal)} sub={`Total contract value`} />
        <StatCard label="Total invoiced" value={fmtL(totalInvoiced)} sub="Supply + RA combined" color="#1D9E75" />
        <StatCard label="Completion" value={`${completionPct}%`} sub="By invoice value" color={completionPct > 75 ? '#1D9E75' : '#BA7517'} />
        <StatCard label="Amount received" value={fmtL(stats.raPaidAmt + stats.invoicedAmt)} sub="Paid + invoiced" color="#534AB7" />
      </Section>
      <div className="card">
        <div className="card-header"><span className="card-title">Project progress — by value</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-s)' }}>
            <span>Completion: {completionPct}%</span>
            <span>{fmtL(totalInvoiced)} / {fmtL(woVal)}</span>
          </div>
          <div className="progress-bar" style={{ height: 12, borderRadius: 6 }}>
            <div className="progress-fill" style={{ width: `${Math.min(completionPct, 100)}%`, borderRadius: 6 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Store / SCM Dashboard ─────────────────────────────────────────────────────
function StoreDashboard({ p, stats }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-s)' }}>WO: {p.wo_number} &nbsp;|&nbsp; Total BOQ items: {stats.boqTotal}</p>
      </div>
      <Section title="Material inward (GRN)">
        <StatCard label="GRNs created" value={stats.grns} sub="Receipts logged" color="#1D9E75" />
        <StatCard label="Unique items received" value={stats.grnsUnique} sub={`of ${stats.boqTotal} BOQ items`} color="#1D9E75" />
        <StatCard label="Items pending receipt" value={Math.max(0, stats.boqTotal - stats.grnsUnique)} sub="Not yet received" color="#D85A30" />
        <StatCard label="GRN receipt rate" value={`${stats.boqTotal > 0 ? Math.round(stats.grnsUnique / stats.boqTotal * 100) : 0}%`} sub="Items received vs BOQ" />
      </Section>
      <Section title="Dispatch to site">
        <StatCard label="Dispatches created" value={stats.dns} sub="Delivery notes" color="#1D9E75" />
        <StatCard label="Unique items dispatched" value={stats.dispatchedUnique} sub={`of ${stats.boqTotal} BOQ items`} color="#1D9E75" />
        <StatCard label="Items pending dispatch" value={Math.max(0, stats.boqTotal - stats.dispatchedUnique)} sub="In store, not sent yet" color="#D85A30" />
        <StatCard label="Material at site" value={stats.instPct + '%'} sub="Installation started" color="#BA7517" />
      </Section>
      <div className="card">
        <div className="card-header"><span className="card-title">Pending invoice items</span></div>
        <div className="card-body">
          <div style={{ fontSize: 13, color: 'var(--text-s)', marginBottom: 8 }}>
            {stats.pendingInvoice} dispatch(es) not yet invoiced by Accounts team.
          </div>
          <div className="progress-bar" style={{ height: 8 }}>
            <div className="progress-fill" style={{ width: `${stats.dns > 0 ? Math.round((stats.dns - stats.pendingInvoice) / stats.dns * 100) : 0}%` }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-s)', marginTop: 4 }}>
            {stats.dns - stats.pendingInvoice} invoiced / {stats.dns} total dispatches
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Site Dashboard ─────────────────────────────────────────────────────────────
function SiteDashboard({ p, stats }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-s)' }}>WO: {p.wo_number} &nbsp;|&nbsp; Site: {p.site_name}</p>
      </div>
      <Section title="Material at site">
        <StatCard label="Dispatched to site" value={stats.dns} sub="Delivery notes received" color="#1D9E75" />
        <StatCard label="Unique items at site" value={stats.dispatchedUnique} sub={`of ${stats.boqTotal} BOQ items`} color="#1D9E75" />
        <StatCard label="Items not yet received" value={Math.max(0, stats.boqTotal - stats.dispatchedUnique)} sub="Pending from store" color="#D85A30" />
        <StatCard label="Material receipt rate" value={`${stats.boqTotal > 0 ? Math.round(stats.dispatchedUnique / stats.boqTotal * 100) : 0}%`} sub="vs BOQ" />
      </Section>
      <Section title="Installation status">
        <StatCard label="Items being installed" value={stats.instStarted} sub="Progress logged" color="#D85A30" />
        <StatCard label="Items fully installed" value={stats.instComplete} sub="100% done" color="#1D9E75" />
        <StatCard label="Items pending" value={Math.max(0, stats.boqTotal - stats.instStarted)} sub="Not yet started" color="#BA7517" />
        <StatCard label="Overall installation" value={`${stats.instPct}%`} sub="By quantity" color="#D85A30" />
      </Section>
      <Section title="Commissioning status">
        <StatCard label="Items commissioned" value={stats.commComplete} sub="100% commissioned" color="#534AB7" />
        <StatCard label="In progress" value={stats.commStarted} sub="Partially commissioned" color="#BA7517" />
        <StatCard label="Items pending" value={Math.max(0, stats.boqTotal - stats.commStarted)} sub="Not yet started" color="#D85A30" />
        <StatCard label="Overall commissioning" value={`${stats.commPct}%`} sub="By quantity" color="#534AB7" />
      </Section>
      <Section title="RA billing">
        <StatCard label="RA bills raised" value={stats.raCount} sub="Running account" color="#BA7517" />
        <StatCard label="Last RA status" value={stats.lastRaStatus || '—'} sub={stats.lastRaDate || 'No RA yet'} />
        <StatCard label="Current RA no." value={`RA-${p.current_ra_no || 1}`} sub="Next to be raised" />
        <StatCard label="RA net paid" value={fmtL(stats.raPaidAmt)} sub="Amount received" color="#1D9E75" />
      </Section>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { activeProject, user } = useAuth()
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    Promise.all([
      grn.list(activeProject.id).catch(() => ({ data: [] })),
      dispatch.list(activeProject.id).catch(() => ({ data: [] })),
      ra.list(activeProject.id).catch(() => ({ data: [] })),
      site.list(activeProject.id).catch(() => ({ data: [] })),
      boq.list(activeProject.id).catch(() => ({ data: [] })),
    ]).then(([g, d, r, s, b]) => {
      const grnData = g.data; const dnData = d.data
      const raData = r.data; const siteData = s.data
      const boqData = b.data

      // GRN stats
      const grnsUnique = new Set(grnData.map(x => x.boq_item_id)).size

      // Dispatch stats
      const dispatchedUnique = new Set(dnData.map(x => x.boq_item_id)).size
      const pendingInvoice = dnData.filter(x => x.invoice_status === 'pending').length
      const invoiced = dnData.filter(x => x.invoice_status === 'invoiced').length
      const invoicedAmt = dnData.filter(x => x.invoice_status === 'invoiced').reduce((a, x) => a + Number(x.amount || 0), 0)

      // RA stats
      const raCount = raData.length
      const raPaid = raData.filter(x => x.status === 'paid').length
      const raPaidAmt = raData.filter(x => x.status === 'paid').reduce((a, x) => a + Number(x.net_payable || 0), 0)
      const lastRa = raData[0]

      // Site progress
      const totalPO = siteData.reduce((a, i) => a + Number(i.po_qty || 0), 0)
      const totalInst = siteData.reduce((a, i) => a + Number(i.total_installed || 0), 0)
      const totalComm = siteData.reduce((a, i) => a + Number(i.total_commissioned || 0), 0)
      const instPct = totalPO > 0 ? Math.round(totalInst / totalPO * 100) : 0
      const commPct = totalPO > 0 ? Math.round(totalComm / totalPO * 100) : 0

      const instStarted = siteData.filter(i => i.total_installed > 0).length
      const instComplete = siteData.filter(i => i.pct_installed >= 100).length
      const commStarted = siteData.filter(i => i.total_commissioned > 0).length
      const commComplete = siteData.filter(i => i.pct_commissioned >= 100).length

      // Zone breakdown
      const mpsItems = siteData.filter(i => i.site_zone === 'MPS SITE')
      const mpsPO = mpsItems.reduce((a, i) => a + Number(i.po_qty || 0), 0)
      const mpsInst = mpsItems.reduce((a, i) => a + Number(i.total_installed || 0), 0)
      const mpsPct = mpsPO > 0 ? Math.round(mpsInst / mpsPO * 100) : 0
      const otherItems = siteData.filter(i => i.site_zone !== 'MPS SITE')
      const otherPO = otherItems.reduce((a, i) => a + Number(i.po_qty || 0), 0)
      const otherInst = otherItems.reduce((a, i) => a + Number(i.total_installed || 0), 0)
      const otherPct = otherPO > 0 ? Math.round(otherInst / otherPO * 100) : 0

      setStats({
        grns: grnData.length, grnsUnique,
        dns: dnData.length, dispatchedUnique,
        pendingInvoice, invoiced, invoicedAmt,
        raCount, raPaid, raPaidAmt,
        lastRaStatus: lastRa?.status,
        lastRaDate: lastRa?.invoice_date,
        instPct, commPct, mpsPct, otherPct,
        instStarted, instComplete, commStarted, commComplete,
        boqTotal: boqData.length,
      })
    }).finally(() => setLoading(false))
  }, [activeProject])

  if (!activeProject) return (
    <div className="alert alert-warning">No project selected. Ask Admin to create and assign a project.</div>
  )

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-s)', fontSize: 13 }}>Loading dashboard...</div>
  )

  const role = user?.role
  if (role === 'admin' || role === 'management') return <AdminDashboard p={activeProject} stats={stats} />
  if (role === 'accounts') return <AccountsDashboard p={activeProject} stats={stats} />
  if (role === 'scm') return <StoreDashboard p={activeProject} stats={stats} />
  if (role === 'site') return <SiteDashboard p={activeProject} stats={stats} />
  return <AdminDashboard p={activeProject} stats={stats} />
}
