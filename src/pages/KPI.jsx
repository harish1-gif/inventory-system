import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt12, logAction } from '../lib/utils'
import { format } from 'date-fns'
import Modal, { ModalFooter } from '../components/Modal'

const STAFF_CRITERIA = [
  { id:1,  name:'Sales (PP count)',         slabs:[407,651,814],  pts:[5,8,10], desc:'Units sold' },
  { id:2,  name:'Attendance (leave days)',  slabs:[1,0],          pts:[8,10],   desc:'Lower is better' },
  { id:3,  name:'Timing (late days)',       slabs:[3,2,0],        pts:[5,8,10], desc:'Late arrivals' },
  { id:4,  name:'Permission (hours)',       slabs:[2,1,0],        pts:[5,8,10], desc:'Hours taken' },
  { id:5,  name:'Occurrence (errors)',      slabs:[2,1,0],        pts:[5,8,10], desc:'Errors/complaints' },
  { id:6,  name:'Conversion (count)',       slabs:[30,40,50],     pts:[5,8,10], desc:'Leads converted' },
  { id:7,  name:'Production Hrs (avg/day)', slabs:[6,7,8],        pts:[5,8,10], desc:'Auto from Tech Tracker' },
  { id:8,  name:'Checklist (items)',        slabs:[6,8,10],       pts:[5,8,10], desc:'Items completed' },
  { id:9,  name:'To Do List (items)',       slabs:[7,8,10],       pts:[5,8,10], desc:'Tasks done' },
  { id:10, name:'Feedback Admin (score)',   slabs:[7,8,10],       pts:[5,8,10], desc:'Admin feedback score' },
  { id:11, name:'Google Review (count)',    slabs:[7,8,10],       pts:[5,8,10], desc:'Reviews collected' },
  { id:12, name:'Leadership (complaints)',  slabs:[1,0],          pts:[8,10],   desc:'Lower is better' },
  { id:13, name:'Audit Manager',            slabs:null,           pts:[0,10],   desc:'Binary: done or not' },
  { id:14, name:'Monthly Report',           slabs:null,           pts:[0,10],   desc:'Binary: done or not' },
]

const COMPANY_CRITERIA = [
  { id:1,  name:'BSB Completed',               max:2.5 },
  { id:2,  name:'GFI Networking Post',         max:2.5 },
  { id:3,  name:'Vision Posted',               max:5 },
  { id:4,  name:'Core Values Posted',          max:5 },
  { id:5,  name:'Daily Pledge',                max:5 },
  { id:6,  name:'P&L / SET Done',              max:5 },
  { id:7,  name:'Budget Tracking',             max:5 },
  { id:8,  name:'Full/Half KPI Implementation',max:10 },
  { id:9,  name:'P&L Positive',               max:5 },
  { id:10, name:'% Increase in Sales Y-Y',     max:10 },
  { id:11, name:'CLC Done',                    max:5 },
  { id:12, name:'Hall of Fame',                max:5 },
  { id:13, name:'Incentive & KPI Gifts',       max:5 },
  { id:14, name:'Feed Back Calls',             max:5 },
  { id:15, name:'Timely Delivery',             max:5 },
  { id:16, name:'Health Activity',             max:5 },
  { id:17, name:'Family Activity',             max:5 },
  { id:18, name:'GFI Learning TT',             max:5 },
  { id:19, name:'New Learning Other',          max:5 },
]

function calcSlabPts(crit, val) {
  const v = Number(val)||0
  if (crit.slabs === null) return v > 0 ? 10 : 0
  const { slabs, pts } = crit
  if (slabs.length === 2) {
    if (v <= slabs[0]) return pts[0]
    return pts[1]
  }
  const lowerBetter = crit.name.includes('leave')||crit.name.includes('late')||crit.name.includes('hour')||crit.name.includes('error')||crit.name.includes('complaint')
  if (lowerBetter) {
    if (v >= slabs[0]) return pts[0]
    if (v >= slabs[1]) return pts[1]
    return pts[2]
  }
  if (v >= slabs[2]) return pts[2]
  if (v >= slabs[1]) return pts[1]
  if (v >= slabs[0]) return pts[0]
  return 0
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function KPI() {
  const { user } = useAuth()
  const [tab, setTab]     = useState('staff')
  const [year]            = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth()+1)
  const [users, setUsers] = useState([])
  const [selUser, setSelUser] = useState(null)
  const [staffScores, setStaffScores] = useState([])
  const [compScores, setCompScores]   = useState([])
  const [entCriteria, setEntC]        = useState([])
  const [entScores, setEntS]          = useState([])
  const [editCell, setEditCell]       = useState(null)
  const [editVal, setEditVal]         = useState('')
  const [newEntC, setNewEntC]         = useState({ name:'', max_points:10, description:'' })
  const [addEntModal, setAddEntModal] = useState(false)
  const isMgr  = user.role === 'manager'
  const isAdmin = user.role === 'admin'
  const isTech  = user.role === 'technician'

  useEffect(() => { loadAll() }, [])
  useEffect(() => { loadScores() }, [selUser, month, tab])

  async function loadAll() {
    const { data } = await supabase.from('app_users').select('*').eq('status','active').order('role')
    setUsers(data||[])
    if (isTech) setSelUser(user)
    else if (data?.length) setSelUser(data[0])
    const { data: ec } = await supabase.from('entrepreneur_kpi_criteria').select('*').eq('user_id', user.id).order('sort_order')
    setEntC(ec||[])
  }

  async function loadScores() {
    if (!selUser) return
    const [ss, cs, es] = await Promise.all([
      supabase.from('kpi_staff_scores').select('*').eq('user_id',selUser.id).eq('month',month).eq('year',year),
      supabase.from('kpi_company_scores').select('*').eq('year',year),
      supabase.from('entrepreneur_kpi_scores').select('*').eq('user_id',user.id).eq('year',year),
    ])
    setStaffScores(ss.data||[])
    setCompScores(cs.data||[])
    setEntS(es.data||[])
  }

  function getStaffScore(cid) { return staffScores.find(s=>s.criteria_id===cid) }
  function getCompScore(cid, mi) { return compScores.find(s=>s.criteria_id===cid&&s.month_idx===mi) }
  function getEntScore(cid, m) { return entScores.find(s=>s.criteria_id===cid&&s.month===m) }

  const totalStaff = STAFF_CRITERIA.reduce((a,c)=>{ const s=getStaffScore(c.id); return a+(s?.points||0) },0)

  async function saveStaffScore(crit, actualVal, pts) {
    await supabase.from('kpi_staff_scores').upsert({
      user_id: selUser.id, criteria_id: crit.id, criteria_name: crit.name,
      month, year, actual_value: Number(actualVal), points: pts, edited_by: user.name, updated_at: new Date().toISOString()
    },{ onConflict:'user_id,criteria_id,month,year' })
    await logAction(user, 'kpi', `KPI staff score saved — ${selUser.name} · ${crit.name} · ${month}/${year}: value=${actualVal}, pts=${pts}`)
    loadScores()
  }

  async function saveCompScore(crit, mi, pts) {
    await supabase.from('kpi_company_scores').upsert({
      year, month_idx: mi, criteria_id: crit.id, criteria_name: crit.name,
      points: Number(pts), edited_by: user.name, updated_at: new Date().toISOString()
    },{ onConflict:'year,month_idx,criteria_id' })
    await logAction(user, 'kpi', `Company KPI saved — ${crit.name} · ${MONTHS[mi]} ${year}: ${pts} pts`)
    loadScores()
  }

  async function saveEntScore(criteriaId, critName, m, pts) {
    await supabase.from('entrepreneur_kpi_scores').upsert({
      user_id: user.id, criteria_id: criteriaId, criteria_name: critName,
      month: m, year, points: Number(pts), updated_at: new Date().toISOString()
    },{ onConflict:'user_id,criteria_id,month,year' })
    await logAction(user, 'kpi', `Entrepreneur KPI saved — ${critName} · ${MONTHS[m-1]} ${year}: ${pts} pts`)
    loadScores()
  }

  async function addEntCriteria() {
    if (!newEntC.name.trim()) return
    if (entCriteria.length >= 12) { alert('Max 12 criteria'); return }
    await supabase.from('entrepreneur_kpi_criteria').insert({ ...newEntC, user_id: user.id, sort_order: entCriteria.length })
    await logAction(user, 'kpi', `Entrepreneur KPI criteria added: "${newEntC.name}"`)
    setNewEntC({ name:'', max_points:10, description:'' }); setAddEntModal(false)
    const { data } = await supabase.from('entrepreneur_kpi_criteria').select('*').eq('user_id',user.id).order('sort_order')
    setEntC(data||[])
  }

  async function deleteEntCriteria(id, name) {
    if (!confirm(`Delete "${name}"?`)) return
    await supabase.from('entrepreneur_kpi_criteria').delete().eq('id', id)
    await logAction(user, 'kpi', `Entrepreneur KPI criteria deleted: "${name}"`)
    const { data } = await supabase.from('entrepreneur_kpi_criteria').select('*').eq('user_id',user.id).order('sort_order')
    setEntC(data||[])
  }

  const userGroups = { manager: users.filter(u=>u.role==='manager'), admin: users.filter(u=>u.role==='admin'), technician: users.filter(u=>u.role==='technician') }

  return (
    <div>
      <h1 className="page-title">KPI</h1>

      {/* Tab navigation */}
      <div className="flex border-b border-gray-100 mb-4">
        <button onClick={()=>setTab('staff')} className={`tab-btn ${tab==='staff'?'tab-active':'tab-inactive'}`}>Staff KPI</button>
        {isMgr && <button onClick={()=>setTab('company')} className={`tab-btn ${tab==='company'?'tab-active':'tab-inactive'}`}>Company KPI</button>}
        {isMgr && <button onClick={()=>setTab('entrepreneur')} className={`tab-btn ${tab==='entrepreneur'?'tab-active':'tab-inactive'}`}>Entrepreneur KPI</button>}
      </div>

      {/* ── STAFF KPI ── */}
      {tab==='staff' && (
        <div className="flex gap-4">
          {/* User sidebar — hidden for technician */}
          {!isTech && (
            <div className="w-44 flex-shrink-0">
              {Object.entries(userGroups).map(([role, group])=>group.length>0&&(
                <div key={role} className="mb-3">
                  <div className="text-xs text-gray-400 font-medium px-1 mb-1 capitalize">{role}</div>
                  {group.map(u=>(
                    <button key={u.id} onClick={()=>setSelUser(u)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs mb-1 transition-colors ${selUser?.id===u.id?'bg-brand text-white':'bg-white hover:bg-gray-50 text-gray-700 border border-gray-100'}`}>
                      {u.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Scorecard */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-medium">{selUser?.name||user.name}</span>
                <span className={`badge role-${selUser?.role||user.role} ml-2`}>{selUser?.role||user.role}</span>
              </div>
              <div className="flex gap-2 items-center">
                <select className="input w-24 text-xs" value={month} onChange={e=>setMonth(Number(e.target.value))}>
                  {MONTHS.map((m,i)=><option key={i} value={i+1}>{m} {year}</option>)}
                </select>
                <div className="text-sm font-medium">Total: <span className="text-brand">{totalStaff}/130</span></div>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr>
                  <th className="th">#</th><th className="th">Criteria</th><th className="th">Slab thresholds</th>
                  <th className="th">Actual value</th><th className="th">Points</th>
                  {isMgr && <th className="th">Override pts</th>}
                </tr></thead>
                <tbody>
                  {STAFF_CRITERIA.map(c=>{
                    const sc = getStaffScore(c.id)
                    const autoPts = sc ? calcSlabPts(c, sc.actual_value) : 0
                    const pts = sc?.points || 0
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="td text-gray-400">{c.id}</td>
                        <td className="td">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-gray-400">{c.desc}</div>
                        </td>
                        <td className="td text-gray-500">
                          {c.slabs ? c.slabs.map((s,i)=>`${s}→${c.pts[i]}pts`).join(' · ') : 'Done=10pts / Not=0pts'}
                        </td>
                        <td className="td">
                          {isMgr ? (
                            <input type="number" className="input w-20 text-xs" defaultValue={sc?.actual_value||''}
                              placeholder="Enter…"
                              onBlur={e=>{ const v=e.target.value; if(v!=='') saveStaffScore(c, v, calcSlabPts(c,v)) }}
                              onKeyDown={e=>{ if(e.key==='Enter'){const v=e.target.value;if(v!=='')saveStaffScore(c,v,calcSlabPts(c,v))} }}
                            />
                          ) : <span>{sc?.actual_value??'—'}</span>}
                        </td>
                        <td className="td">
                          <span className={`font-medium ${pts>=8?'text-green-700':pts>=5?'text-blue-600':pts>0?'text-amber-600':'text-gray-400'}`}>
                            {pts}/10
                          </span>
                        </td>
                        {isMgr && (
                          <td className="td">
                            <div className="flex gap-1">
                              {[0,5,8,10].map(v=>(
                                <button key={v} onClick={()=>saveStaffScore(c, sc?.actual_value||0, v)}
                                  className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${pts===v?'bg-brand text-white border-brand':'border-gray-200 hover:bg-gray-50'}`}>
                                  {v}
                                </button>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPANY KPI ── */}
      {tab==='company' && isMgr && (
        <div>
          <div className="text-sm font-medium mb-3">Company KPI — {year} · Total = 100 pts</div>
          <div className="overflow-x-auto">
            <div className="bg-white border border-gray-100 rounded-xl">
              <table className="text-xs" style={{minWidth:'900px',width:'100%'}}>
                <thead><tr>
                  <th className="th" style={{minWidth:'160px'}}>Criteria</th><th className="th">Max</th>
                  {MONTHS.map(m=><th key={m} className="th">{m}</th>)}
                </tr></thead>
                <tbody>
                  {COMPANY_CRITERIA.map(c=>(
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="td font-medium">{c.name}</td>
                      <td className="td text-gray-500">{c.max}</td>
                      {MONTHS.map((_,mi)=>{
                        const sc = getCompScore(c.id, mi)
                        const isEditing = editCell?.id===c.id && editCell?.mi===mi
                        return (
                          <td key={mi} className="td text-center">
                            {isEditing ? (
                              <input type="number" className="input-inline w-12 text-center" defaultValue={sc?.points||0} autoFocus
                                onBlur={e=>{ saveCompScore(c,mi,e.target.value); setEditCell(null) }}
                                onKeyDown={e=>{ if(e.key==='Enter'){saveCompScore(c,mi,e.target.value);setEditCell(null)} if(e.key==='Escape')setEditCell(null) }}/>
                            ) : (
                              <span className={`cursor-pointer hover:bg-blue-50 px-1 rounded ${sc?.points?'font-medium text-blue-600':'text-gray-300'}`}
                                onClick={()=>setEditCell({id:c.id,mi})}>
                                {sc?.points||'—'}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-medium">
                    <td className="td">Monthly total</td>
                    <td className="td">100</td>
                    {MONTHS.map((_,mi)=>(
                      <td key={mi} className="td text-center font-medium text-brand">
                        {COMPANY_CRITERIA.reduce((a,c)=>a+(getCompScore(c.id,mi)?.points||0),0)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Click any cell to edit. Changes saved permanently in Updates log.</p>
        </div>
      )}

      {/* ── ENTREPRENEUR KPI ── */}
      {tab==='entrepreneur' && isMgr && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Entrepreneur KPI — {year} ({entCriteria.length}/12 criteria)</div>
            {entCriteria.length < 12 && (
              <button className="btn-primary btn-sm rounded-lg" onClick={()=>setAddEntModal(true)}>+ Add criteria</button>
            )}
          </div>
          {entCriteria.length===0 ? (
            <div className="card text-center py-8 text-gray-400">No criteria yet. Add your first one.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="bg-white border border-gray-100 rounded-xl">
                <table className="text-xs" style={{minWidth:'800px',width:'100%'}}>
                  <thead><tr>
                    <th className="th">Criteria</th><th className="th">Max pts</th>
                    {MONTHS.map(m=><th key={m} className="th">{m}</th>)}
                    <th className="th"></th>
                  </tr></thead>
                  <tbody>
                    {entCriteria.map(c=>(
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="td font-medium">{c.name}</td>
                        <td className="td text-gray-500">{c.max_points}</td>
                        {MONTHS.map((_,mi)=>{
                          const sc = getEntScore(c.id, mi+1)
                          const isEditing = editCell?.cid===c.id && editCell?.mi===mi
                          return (
                            <td key={mi} className="td text-center">
                              {isEditing ? (
                                <input type="number" className="input-inline w-12 text-center" defaultValue={sc?.points||0} autoFocus
                                  onBlur={e=>{ saveEntScore(c.id,c.name,mi+1,e.target.value); setEditCell(null) }}
                                  onKeyDown={e=>{ if(e.key==='Enter'){saveEntScore(c.id,c.name,mi+1,e.target.value);setEditCell(null)} if(e.key==='Escape')setEditCell(null) }}/>
                              ) : (
                                <span className={`cursor-pointer hover:bg-blue-50 px-1 rounded ${sc?.points?'font-medium text-purple-700':'text-gray-300'}`}
                                  onClick={()=>setEditCell({cid:c.id,mi})}>
                                  {sc?.points||'—'}
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="td">
                          <button className="text-red-400 hover:text-red-600 text-xs" onClick={()=>deleteEntCriteria(c.id,c.name)}>Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">Click any cell to edit. Changes saved permanently in Updates log.</p>

          {addEntModal && (
            <Modal title="Add entrepreneur KPI criteria" onClose={()=>setAddEntModal(false)} size="sm">
              <div className="space-y-3">
                <div><label className="label">Criteria name</label><input className="input" value={newEntC.name} onChange={e=>setNewEntC(f=>({...f,name:e.target.value}))}/></div>
                <div><label className="label">Max points</label><input type="number" className="input" value={newEntC.max_points} onChange={e=>setNewEntC(f=>({...f,max_points:e.target.value}))}/></div>
                <div><label className="label">Description (optional)</label><input className="input" value={newEntC.description} onChange={e=>setNewEntC(f=>({...f,description:e.target.value}))}/></div>
              </div>
              <ModalFooter>
                <button className="btn" onClick={()=>setAddEntModal(false)}>Cancel</button>
                <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={addEntCriteria}>Add</button>
              </ModalFooter>
            </Modal>
          )}
        </div>
      )}
    </div>
  )
}
