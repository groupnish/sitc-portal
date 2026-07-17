import { useEffect, useState } from 'react'
import { projects } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const BLANK = {
  code:'',name:'',client_name:'',client_address:'',client_gstin:'',client_pan:'',
  seller_name:'',seller_address:'',seller_gstin:'',seller_pan:'',
  wo_number:'',wo_date:'',wo_value:'',amendment_no:'',place_of_supply:'',hsn_sac_code:'9954',project_type:'work_contract',
  site_name:'',site_address:'',
  igst_rate:18,cgst_rate:0,sgst_rate:0,
  pt_advance_pct:0,pt_lc_pct:0,pt_installation_pct:0,pt_commissioning_pct:0,pt_retention_pct:0,pt_ld_pct:0,
  pt_notes:'',advance_received_incl_gst:0,invoice_prefix:'INV',
}

export default function ProjectsPage() {
  const { loadProjects, user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [list, setList]       = useState([])
  const [form, setForm]       = useState(BLANK)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState('basic')

  useEffect(() => { load() }, [])
  const load = () => projects.list().then(r=>setList(r.data))
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      if (editing) { await projects.update(editing, form); toast.success('Project updated') }
      else { await projects.create(form); toast.success('Project created') }
      setForm(BLANK); setEditing(null); setShowForm(false)
      load(); loadProjects()
    } catch(e) { toast.error(e.response?.data?.error||'Error')
    } finally { setLoading(false) }
  }

  const editProject = p => {
    setForm({...p, wo_date:p.wo_date||'', wo_value:p.wo_value||0})
    setEditing(p.id); setShowForm(true); setTab('basic')
    window.scrollTo(0,0)
  }

  const TabBtn = ({id,label}) => (
    <button className={`btn btn-sm ${tab===id?'btn-primary':''}`} onClick={()=>setTab(id)} type="button">{label}</button>
  )

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:14,fontWeight:500}}>Projects</h2>
        {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>{setForm(BLANK);setEditing(null);setShowForm(s=>!s);setTab('basic')}}>
          {showForm?'Cancel':'+ New project'}
        </button>}
      </div>

      {showForm && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{editing?'Edit project':'New project'}</span>
            <div style={{display:'flex',gap:6}}>
              <TabBtn id="basic" label="Basic" />
              <TabBtn id="client" label="Client" />
              <TabBtn id="seller" label="Seller" />
              <TabBtn id="payment" label="Payment" />
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={submit}>
              {tab==='basic' && <>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Project code *</label><input className="form-input" required value={form.code} onChange={e=>set('code',e.target.value)} placeholder="PROJ-001" /></div>
                  <div className="form-group"><label className="form-label">Invoice prefix</label><input className="form-input" value={form.invoice_prefix} onChange={e=>set('invoice_prefix',e.target.value)} placeholder="INV" /></div>
                  <div className="form-group">
                    <label className="form-label">Project type</label>
                    <select className="form-select" value={form.project_type||'work_contract'} onChange={e=>set('project_type',e.target.value)}>
                      <option value="work_contract">Work Contract (RA Bill + Tax Invoice)</option>
                      <option value="purchase_order">Purchase Order (Item-wise Tax Invoice)</option>
                    </select>
                    <div style={{fontSize:11,color:'var(--text-s)',marginTop:3}}>
                      Work Contract → RA Bill workflow. Purchase Order → item-wise invoice from Dispatch list.
                    </div>
                  </div>
                </div>
                <div className="form-group" style={{marginBottom:12}}><label className="form-label">Project name *</label><input className="form-input" required value={form.name} onChange={e=>set('name',e.target.value)} /></div>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">WO number</label><input className="form-input" value={form.wo_number} onChange={e=>set('wo_number',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">WO date</label><input className="form-input" type="date" value={form.wo_date} onChange={e=>set('wo_date',e.target.value)} /></div>
                </div>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">WO value (₹)</label><input className="form-input" type="number" value={form.wo_value} onChange={e=>set('wo_value',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Amendment no.</label><input className="form-input" value={form.amendment_no} onChange={e=>set('amendment_no',e.target.value)} /></div>
                </div>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Place of supply</label><input className="form-input" value={form.place_of_supply} onChange={e=>set('place_of_supply',e.target.value)} placeholder="KARNATAKA (29)" /></div>
                  <div className="form-group"><label className="form-label">HSN/SAC code</label><input className="form-input" value={form.hsn_sac_code} onChange={e=>set('hsn_sac_code',e.target.value)} /></div>
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group"><label className="form-label">IGST %</label><input className="form-input" type="number" value={form.igst_rate} onChange={e=>set('igst_rate',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">CGST %</label><input className="form-input" type="number" value={form.cgst_rate} onChange={e=>set('cgst_rate',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">SGST %</label><input className="form-input" type="number" value={form.sgst_rate} onChange={e=>set('sgst_rate',e.target.value)} /></div>
                </div>
              </>}

              {tab==='client' && <>
                <div className="form-group" style={{marginBottom:12}}><label className="form-label">Client name *</label><input className="form-input" value={form.client_name} onChange={e=>set('client_name',e.target.value)} /></div>
                <div className="form-group" style={{marginBottom:12}}><label className="form-label">Client address</label><textarea className="form-textarea" value={form.client_address} onChange={e=>set('client_address',e.target.value)} /></div>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Client GSTIN</label><input className="form-input" value={form.client_gstin} onChange={e=>set('client_gstin',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Client PAN</label><input className="form-input" value={form.client_pan} onChange={e=>set('client_pan',e.target.value)} /></div>
                </div>
                <div className="form-group" style={{marginBottom:12}}><label className="form-label">Site / consignee name</label><input className="form-input" value={form.site_name} onChange={e=>set('site_name',e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Site address</label><textarea className="form-textarea" value={form.site_address} onChange={e=>set('site_address',e.target.value)} /></div>
              </>}

              {tab==='seller' && <>
                <div className="form-group" style={{marginBottom:12}}><label className="form-label">Seller / our company name</label><input className="form-input" value={form.seller_name} onChange={e=>set('seller_name',e.target.value)} /></div>
                <div className="form-group" style={{marginBottom:12}}><label className="form-label">Seller address</label><textarea className="form-textarea" value={form.seller_address} onChange={e=>set('seller_address',e.target.value)} /></div>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Seller GSTIN</label><input className="form-input" value={form.seller_gstin} onChange={e=>set('seller_gstin',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Seller PAN</label><input className="form-input" value={form.seller_pan} onChange={e=>set('seller_pan',e.target.value)} /></div>
                </div>
              </>}

              {tab==='payment' && <>
                <div className="alert alert-info" style={{marginBottom:12, fontSize:12}}>
                  <b>Supply %, Installation %, Commissioning %</b> together define how a BOQ item's
                  total value splits across stages (should sum to 100%). Used by <b>BOQ Manager →
                  Add Split Item</b> to auto-calculate each stage's rate from one total value.
                  <br/><b>Advance %</b> is separately applied as advance recovery on Supply value during RA billing.
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group"><label className="form-label">Advance %</label><input className="form-input" type="number" value={form.pt_advance_pct} onChange={e=>set('pt_advance_pct',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Supply %</label><input className="form-input" type="number" value={form.pt_lc_pct} onChange={e=>set('pt_lc_pct',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Installation %</label><input className="form-input" type="number" value={form.pt_installation_pct} onChange={e=>set('pt_installation_pct',e.target.value)} /></div>
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group"><label className="form-label">Commissioning %</label><input className="form-input" type="number" value={form.pt_commissioning_pct} onChange={e=>set('pt_commissioning_pct',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Retention %</label><input className="form-input" type="number" value={form.pt_retention_pct} onChange={e=>set('pt_retention_pct',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">LD % per week</label><input className="form-input" type="number" value={form.pt_ld_pct} onChange={e=>set('pt_ld_pct',e.target.value)} /></div>
                </div>
                {(() => {
                  const sum = (parseFloat(form.pt_lc_pct)||0) + (parseFloat(form.pt_installation_pct)||0) + (parseFloat(form.pt_commissioning_pct)||0)
                  const ok = Math.abs(sum - 100) < 0.01
                  return (
                    <div className={`alert ${ok ? 'alert-success' : 'alert-warning'}`} style={{marginBottom:12, fontSize:12}}>
                      Supply + Installation + Commissioning = <b>{sum.toFixed(1)}%</b>
                      {ok ? ' ✓ Adds up to 100%' : ' — should total 100% for correct item value split'}
                    </div>
                  )
                })()}
                <div className="form-group" style={{marginBottom:12}}><label className="form-label">Advance received (incl. GST) ₹</label><input className="form-input" type="number" value={form.advance_received_incl_gst} onChange={e=>set('advance_received_incl_gst',e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Payment terms notes</label><textarea className="form-textarea" value={form.pt_notes} onChange={e=>set('pt_notes',e.target.value)} placeholder="Describe payment terms in detail..." /></div>
              </>}

              <div style={{marginTop:16,display:'flex',gap:8}}>
                <button className="btn btn-primary" type="submit" disabled={loading}>{loading?'Saving…':editing?'Update':'Create project'}</button>
                {tab!=='payment' && <button className="btn" type="button" onClick={()=>setTab(tab==='basic'?'client':tab==='client'?'seller':'payment')}>Next →</button>}
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><span className="card-title">All projects ({list.length})</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Project</th><th>Client</th><th>WO number</th><th>WO value</th><th>RA bill</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map(p=>(
                <tr key={p.id}>
                  <td style={{fontWeight:600,color:'var(--teal)'}}>{p.code}</td>
                  <td style={{maxWidth:200,fontSize:12}}>{p.name}</td>
                  <td style={{fontSize:12}}>{p.client_name}</td>
                  <td style={{fontSize:12}}>{p.wo_number}</td>
                  <td>₹{p.wo_value?(p.wo_value/100000).toFixed(2)+'L':'—'}</td>
                  <td>#{p.current_ra_no}</td>
                  <td><span className={`badge ${p.is_active?'badge-green':'badge-gray'}`}>{p.is_active?'Active':'Inactive'}</span></td>
                  <td>{isAdmin && <button className="btn btn-sm" onClick={()=>editProject(p)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
