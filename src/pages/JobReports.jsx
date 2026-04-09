import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt12 } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function JobReports() {
  const [jobs, setJobs]       = useState([])
  const [techs, setTechs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail]   = useState(null)
  const [pauses, setPauses]   = useState([])

  // Filters
  const today = new Date().toISOString().slice(0,10)
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo,   setDateTo]   = useState(today)
  const [techFilter, setTechFilter] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('completed')

  useEffect(() => { loadData() }, [dateFrom, dateTo, techFilter, statusFilter])

  async function loadData() {
    setLoading(true)
    const from = new Date(dateFrom); from.setHours(0,0,0,0)
    const to   = new Date(dateTo);   to.setHours(23,59,59,999)

    let q = supabase.from('jobs')
      .select('*,zones(name,color)')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (techFilter) q = q.eq('assigned_to_name', techFilter)

    const { data } = await q
    setJobs(data||[])

    const { data: t } = await supabase.from('app_users').select('id,name').eq('role','technician').eq('status','active')
    setTechs(t||[])
    setLoading(false)
  }

  async function openDetail(job) {
    const { data } = await supabase.from('job_pauses').select('*').eq('job_id', job.id).order('paused_at')
    setPauses(data||[])
    setDetail(job)
  }

  const PAUSE_LABELS = {
    break:'Break/Lunch',
    waiting_for_parts:'Waiting for parts',
    emergency_another_customer:'Emergency – other customer',
    other:'Other'
  }

  const filtered = jobs.filter(j =>
    !search ||
    j.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    j.customer_location?.toLowerCase().includes(search.toLowerCase()) ||
    j.assigned_to_name?.toLowerCase().includes(search.toLowerCase())
  )

  // Summary stats
  const totalCash = filtered.reduce((s,j)=>s+(j.cash_collected||0),0)
  const completedCount = filtered.filter(j=>j.status==='completed').length
  const avgTdsMins = filtered.filter(j=>j.tds_permeate).map(j=>j.tds_permeate)
  const avgTds = avgTdsMins.length ? Math.round(avgTdsMins.reduce((a,b)=>a+b,0)/avgTdsMins.length) : null

  return (
    <div>
      <h1 className="page-title">Job Reports</h1>

      {/* Filters */}
      <div className="card mb-4">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Date from</label>
            <input type="date" className="input" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} max={today}/>
          </div>
          <div>
            <label className="label">Date to</label>
            <input type="date" className="input" value={dateTo} onChange={e=>setDateTo(e.target.value)} max={today}/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Technician</label>
            <select className="input" value={techFilter} onChange={e=>setTechFilter(e.target.value)}>
              <option value="">All technicians</option>
              {techs.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="completed">Completed</option>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
        <input className="input" placeholder="Search customer, location, technician…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card text-center py-3">
          <div className="text-2xl font-bold text-brand">{completedCount}</div>
          <div className="text-xs text-gray-500">Jobs completed</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-2xl font-bold text-green-700">Rs.{totalCash.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Cash collected</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-2xl font-bold text-blue-700">{avgTds ?? '—'}</div>
          <div className="text-xs text-gray-500">Avg TDS out (ppm)</div>
        </div>
      </div>

      {loading && <div className="card text-center py-8 text-gray-400 text-sm">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="card text-center py-10 text-gray-400 text-sm">No jobs found for this filter.</div>
      )}

      {!loading && (
        <div className="space-y-2">
          {filtered.map(job => (
            <div key={job.id} className="card cursor-pointer hover:border-brand transition-colors" onClick={()=>openDetail(job)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{job.customer_name}</span>
                    {job.service_type && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{job.service_type}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{job.customer_location}</div>
                  <div className="text-xs text-gray-500">Tech: <strong>{job.assigned_to_name||'—'}</strong> · {fmt12(job.created_at)}</div>
                  {/* Quick summary chips */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {job.services_done?.length > 0 && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">🔧 {job.services_done.slice(0,2).join(', ')}{job.services_done.length>2?` +${job.services_done.length-2}`:''}</span>
                    )}
                    {job.cash_collected > 0 && (
                      <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">💰 Rs.{job.cash_collected}</span>
                    )}
                    {job.tds_permeate && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">💧 {job.tds_permeate} ppm</span>
                    )}
                    {job.problems_faced && (
                      <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">⚠ Issue reported</span>
                    )}
                  </div>
                </div>
                <div className="text-right ml-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    job.status==='completed'?'bg-green-50 text-green-700':
                    job.status==='paused'?'bg-orange-50 text-orange-700':
                    job.status==='active'?'bg-blue-50 text-blue-700':
                    'bg-gray-100 text-gray-500'
                  }`}>{job.status}</span>
                  {job.total_duration_minutes && (
                    <div className="text-xs text-gray-400 mt-1">{Math.floor(job.total_duration_minutes/60)}h {job.total_duration_minutes%60}m</div>
                  )}
                  {job.zones && <div className="flex items-center justify-end gap-1 mt-1"><span className="w-2 h-2 rounded-full" style={{background:job.zones.color}}/><span className="text-xs text-gray-400">{job.zones.name}</span></div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal title={`Job Detail — ${detail.customer_name}`} onClose={()=>setDetail(null)} size="lg">
          <div className="space-y-4 text-sm">

            {/* Header info */}
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded p-3 text-xs">
              <div><span className="text-gray-400">Technician</span><div className="font-medium">{detail.assigned_to_name||'—'}</div></div>
              <div><span className="text-gray-400">Service type</span><div className="font-medium">{detail.service_type||'—'}</div></div>
              <div><span className="text-gray-400">Date</span><div className="font-medium">{fmt12(detail.created_at)}</div></div>
              <div><span className="text-gray-400">Completed</span><div className="font-medium">{detail.end_time?fmt12(detail.end_time):'—'}</div></div>
              <div><span className="text-gray-400">Duration</span><div className="font-medium">{detail.total_duration_minutes?`${Math.floor(detail.total_duration_minutes/60)}h ${detail.total_duration_minutes%60}m`:'—'}</div></div>
              <div><span className="text-gray-400">Travel time</span><div className="font-medium">{detail.travel_duration_minutes?`${detail.travel_duration_minutes} mins`:'—'}</div></div>
            </div>

            {/* Services done */}
            {detail.services_done?.length > 0 && (
              <div>
                <div className="label">Services done</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detail.services_done.map(s=>(
                    <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Spares */}
            {detail.spares_used && (
              <div>
                <div className="label">Spares / parts used</div>
                <div className="text-xs text-gray-700 mt-1 bg-gray-50 rounded p-2">{detail.spares_used}</div>
              </div>
            )}

            {/* Checklist */}
            {(detail.spun_cleaned || detail.spun_replaced || detail.tank_cleaned || detail.as_balls_added > 0) && (
              <div>
                <div className="label">Checklist</div>
                <div className="flex flex-wrap gap-2 mt-1 text-xs">
                  {detail.spun_cleaned && <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">✓ Spun cleaned</span>}
                  {detail.spun_replaced && <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">✓ Spun replaced</span>}
                  {detail.tank_cleaned && <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">✓ Tank cleaned</span>}
                  {detail.as_balls_added > 0 && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">AS Balls: {detail.as_balls_added}</span>}
                </div>
              </div>
            )}

            {/* TDS */}
            {(detail.tds_raw_water || detail.tds_rejection || detail.tds_permeate) && (
              <div>
                <div className="label">TDS Readings (ppm)</div>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[['Raw Water',detail.tds_raw_water],['Rejection',detail.tds_rejection],['Permeate (out)',detail.tds_permeate]].map(([l,v])=>(
                    <div key={l} className="text-center bg-blue-50 rounded p-2">
                      <div className="text-xs text-gray-500">{l}</div>
                      <div className="font-bold text-blue-800">{v||'—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pump / Flow */}
            {(detail.pump_pressure_before || detail.pump_pressure_after || detail.flow_rate_before || detail.flow_rate_after) && (
              <div>
                <div className="label">Pump Pressure & Flow Rate</div>
                <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                  {[['Pressure Before',detail.pump_pressure_before],['Pressure After',detail.pump_pressure_after],['Flow Before',detail.flow_rate_before],['Flow After',detail.flow_rate_after]].map(([l,v])=> v ? (
                    <div key={l} className="bg-gray-50 rounded p-1.5"><span className="text-gray-400">{l}:</span> <strong>{v}</strong></div>
                  ) : null)}
                </div>
              </div>
            )}

            {/* Permeate quality */}
            {detail.permeate_quality && (
              <div>
                <div className="label">Permeate Water Quality</div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${detail.permeate_quality==='good'?'bg-green-50 text-green-700':detail.permeate_quality==='normal'?'bg-yellow-50 text-yellow-700':'bg-red-50 text-red-700'}`}>
                  {detail.permeate_quality==='good'?'✅ Good':detail.permeate_quality==='normal'?'🟡 Normal':'🔴 Slow'}
                </span>
              </div>
            )}

            {/* Problems */}
            {detail.problems_faced && (
              <div>
                <div className="label">Problems / Issues</div>
                <div className="text-xs bg-red-50 text-red-800 rounded p-2 mt-1">{detail.problems_faced}</div>
              </div>
            )}

            {/* Cash */}
            <div className="grid grid-cols-2 gap-3 bg-green-50 rounded p-3">
              <div><div className="text-xs text-gray-500">Cash collected</div><div className="font-bold text-green-700 text-lg">Rs.{detail.cash_collected||0}</div></div>
              {detail.tech_sign_name && <div><div className="text-xs text-gray-500">Technician sign</div><div className="font-medium text-sm">{detail.tech_sign_name}</div></div>}
            </div>

            {/* Extra notes */}
            {detail.completion_report?.extra_notes && (
              <div>
                <div className="label">Extra notes</div>
                <div className="text-xs text-gray-700 bg-gray-50 rounded p-2">{detail.completion_report.extra_notes}</div>
              </div>
            )}

            {/* Pauses */}
            {pauses.length > 0 && (
              <div>
                <div className="label">Pause / Break history ({pauses.length})</div>
                <div className="space-y-1.5 mt-1">
                  {pauses.map(p=>(
                    <div key={p.id} className="text-xs bg-orange-50 border border-orange-100 rounded p-2 flex justify-between items-start">
                      <div>
                        <span className="font-medium text-orange-700">{PAUSE_LABELS[p.pause_type]||p.pause_type}</span>
                        {p.pause_reason && <span className="text-orange-600"> — {p.pause_reason}</span>}
                        <div className="text-gray-400 mt-0.5">Paused at {fmt12(p.paused_at)}</div>
                      </div>
                      <div className="text-right text-orange-600">
                        {p.duration_minutes ? `${p.duration_minutes} mins` : p.resumed_at ? '' : <span className="text-orange-500">Still paused</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setDetail(null)}>Close</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
