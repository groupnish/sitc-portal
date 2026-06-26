import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { grn, dispatch, ra, site } from '../services/api'

export default function Dashboard() {
  const { activeProject, user } = useAuth()
  const [stats, setStats] = useState({ grns:0, dns:0, raCount:0, progress:0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    Promise.all([
      grn.list(activeProject.id).catch(()=>({data:[]})),
      dispatch.list(activeProject.id).catch(()=>({data:[]})),
      ra.list(activeProject.id).catch(()=>({data:[]})),
      site.list(activeProject.id).catch(()=>({data:[]})),
    ]).then(([g,d,r,s]) => {
      const totalPO = s.data.reduce((a,i)=>a+i.po_qty,0)
      const totalInst = s.data.reduce((a,i)=>a+(i.total_installed||0),0)
      setStats({
        grns: g.data.length,
        dns:  d.data.length,
        raCount: r.data.length,
        progress: totalPO > 0 ? Math.round(totalInst/totalPO*100) : 0,
      })
    }).finally(()=>setLoading(false))
  }, [activeProject])

  if (!activeProject) return (
    <div className="alert alert-warning">
      No project selected. Ask Admin to create and assign a project.
    </div>
  )

  const p = activeProject
  const woVal = p.wo_value ? `₹${(p.wo_value/100000).toFixed(2)}L` : '—'
  const advRec = p.advance_received_incl_gst
    ? `₹${(p.advance_received_incl_gst/100000).toFixed(2)}L` : '—'

  return (
    <div>
      <div style={{marginBottom:16}}>
        <h2 style={{fontSize:15,fontWeight:600,marginBottom:2}}>{p.name}</h2>
        <p style={{fontSize:12,color:'var(--text-s)'}}>WO: {p.wo_number} &nbsp;|&nbsp; Client: {p.client_name}</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">WO value</div>
          <div className="stat-value">{woVal}</div>
          <div className="stat-sub">+ GST {p.igst_rate}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">GRNs created</div>
          <div className="stat-value">{stats.grns}</div>
          <div className="stat-sub">material inward</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dispatches</div>
          <div className="stat-value">{stats.dns}</div>
          <div className="stat-sub">to site</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">RA bills</div>
          <div className="stat-value">{stats.raCount}</div>
          <div className="stat-sub">generated</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Site progress</div>
          <div className="stat-value">{stats.progress}%</div>
          <div className="stat-sub">items installed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Advance received</div>
          <div className="stat-value">{advRec}</div>
          <div className="stat-sub">incl. GST</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Project details</span></div>
        <div className="card-body">
          <div className="summary-box">
            <div className="summary-row"><span>Work order</span><span>{p.wo_number}</span></div>
            <div className="summary-row"><span>Amendment</span><span>{p.amendment_no || '—'}</span></div>
            <div className="summary-row"><span>Client GSTIN</span><span>{p.client_gstin || '—'}</span></div>
            <div className="summary-row"><span>Place of supply</span><span>{p.place_of_supply || '—'}</span></div>
            <div className="summary-row"><span>HSN/SAC</span><span>{p.hsn_sac_code}</span></div>
            <div className="summary-row"><span>Tax rate</span><span>IGST {p.igst_rate}%</span></div>
            <div className="summary-row"><span>Advance %</span><span>{p.pt_advance_pct}% of supply</span></div>
            <div className="summary-row"><span>RA bill no.</span><span>{p.current_ra_no}</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Payment terms</span></div>
        <div className="card-body" style={{fontSize:13,color:'var(--text-s)',lineHeight:1.8}}>
          {p.pt_notes || `Part 1: ${p.pt_advance_pct}% advance + ${p.pt_lc_pct}% LC. Part 2: ${p.pt_installation_pct}% installation + ${p.pt_commissioning_pct}% commissioning.`}
          {p.pt_retention_pct > 0 && ` Retention: ${p.pt_retention_pct}%.`}
        </div>
      </div>
    </div>
  )
}
