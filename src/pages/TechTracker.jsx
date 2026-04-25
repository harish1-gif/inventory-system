import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt12, logAction } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

function elapsed(start) {
  if (!start) return '0h 0m'
  const mins = Math.round((Date.now() - new Date(start).getTime()) / 60000)
  return `${Math.floor(mins/60)}h ${mins%60}m`
}
function elapsedMins(start) {
  if (!start) return 0
  return Math.round((Date.now() - new Date(start).getTime()) / 60000)
}

const SERVICE_OPTIONS = [
  'General Service','Inline Set','Membrane','Pump','Solenoid Valve (SV)',
  'Adapter','Float','Hose Connection','Connectors','Carbon Filter','Sediment Filter','UV Lamp','SMPS'
]

const PAUSE_TYPES = [
  { value:'break',                     label:'Break / Lunch' },
  { value:'waiting_for_parts',         label:'Waiting for spare parts' },
  { value:'emergency_another_customer',label:'Emergency – another customer' },
  { value:'other',                     label:'Other reason' },
]

export default function TechTracker() {
  const { user }           = useAuth()
  const [jobs, setJobs]    = useState([])
  const [allTechs, setAllTechs] = useState([])
  const [extraReqs, setEx] = useState([])
  const [customers, setCustomers] = useState([])
  const [tick, setTick]    = useState(0)
  const [selectedTech, setSelectedTech] = useState(null)
  const [techTabMode, setTechTabMode] = useState('active')
  const [extraModal, setExtraModal]   = useState(null)
  const [approveModal, setApprove]    = useState(null)
  const [extraReason, setExtraReason] = useState('')
  const [extraHours, setExtraHours]   = useState(1)
  const [approveNote, setApproveNote] = useState('')
  const [completeModal, setCompleteModal] = useState(null)
  const [compForm, setCompForm] = useState(null)
  const [pauseModal, setPauseModal] = useState(null)
  const [pauseType, setPauseType]   = useState('break')
  const [pauseReason, setPauseReason] = useState('')
  const [jobPauses, setJobPauses]   = useState({})
  const [detailJob, setDetailJob]   = useState(null)

  const isTech = user.role === 'technician'
  const isMgr  = user.role === 'manager' || user.role === 'admin'

  useEffect(() => {
    loadAll()
    const t = setInterval(() => setTick(n=>n+1), 30000)
    return () => clearInterval(t)
  }, [])

  async function loadAll() {
    const jQ = isTech
      ? supabase.from('jobs').select('*,zones(name,color)').eq('assigned_to', user.id).order('created_at',{ascending:false})
      : supabase.from('jobs').select('*,zones(name,color)').order('created_at',{ascending:false})
    const [j, ex, c, t, pauses] = await Promise.all([
      jQ,
      supabase.from('extra_hours_requests').select('*').eq('status','pending'),
      supabase.from('customers').select('id,name,mobile,address,area'),
      supabase.from('app_users').select('id,name').eq('role','technician').eq('status','active'),
      supabase.from('job_pauses').select('*').is('resumed_at', null),
    ])
    setJobs(j.data||[])
    setEx(ex.data||[])
    setCustomers(c.data||[])
    setAllTechs(t.data||[])
    const pm = {}
    ;(pauses.data||[]).forEach(p => { pm[p.job_id] = p })
    setJobPauses(pm)
  }

  async function acceptJob(job) {
    const active = jobs.find(j=>j.assigned_to===user.id&&j.status==='active')
    if (active) { alert('You already have an active job. Complete it first.'); return }
    const now = new Date().toISOString()
    await supabase.from('jobs').update({ status:'active', start_time: now }).eq('id', job.id)
    await supabase.from('job_time_log').insert({ job_id: job.id, event:'job_accepted', event_time: now, by_name: user.name, by_role: user.role })
    await logAction(user, 'job', `Job accepted by ${user.name} — ${job.customer_name} (${job.service_type})`)
    loadAll()
  }

  async function startTravel(job) {
    const now = new Date().toISOString()
    await supabase.from('jobs').update({ travel_start_time: now }).eq('id', job.id)
    await supabase.from('job_time_log').insert({ job_id: job.id, event:'travel_started', event_time: now, by_name: user.name, by_role: user.role })
    await logAction(user, 'job', `Travel started — ${job.customer_name}`)
    loadAll()
  }

  async function arriveAtSite(job) {
    const now = new Date().toISOString()
    const travelMins = job.travel_start_time ? Math.round((new Date(now)-new Date(job.travel_start_time))/60000) : 0
    await supabase.from('jobs').update({ travel_end_time: now, travel_duration_minutes: travelMins }).eq('id', job.id)
    await supabase.from('job_time_log').insert({ job_id: job.id, event:'arrived_at_site', event_time: now, by_name: user.name, by_role: user.role, notes:`Travel: ${travelMins} mins` })
    await logAction(user, 'job', `Arrived at site — ${job.customer_name} (travel: ${travelMins} mins)`)
    loadAll()
  }

  async function pauseJob(job) {
    const now = new Date().toISOString()
    await supabase.from('jobs').update({ status:'paused' }).eq('id', job.id)
    await supabase.from('job_pauses').insert({
      job_id: job.id, pause_type: pauseType, pause_reason: pauseReason,
      paused_at: now, by_name: user.name, by_role: user.role
    })
    await supabase.from('job_time_log').insert({ job_id: job.id, event:'job_paused', event_time: now, by_name: user.name, by_role: user.role, notes:`${pauseType}: ${pauseReason}` })
    await logAction(user, 'job', `Job paused by ${user.name} at ${job.customer_name} — ${pauseType}`)
    setPauseModal(null); setPauseType('break'); setPauseReason('')
    loadAll()
  }

  async function resumeJob(job) {
    const pause = jobPauses[job.id]
    if (!pause) return
    const now = new Date().toISOString()
    const dur = Math.round((new Date(now)-new Date(pause.paused_at))/60000)
    await supabase.from('job_pauses').update({ resumed_at: now, duration_minutes: dur }).eq('id', pause.id)
    await supabase.from('jobs').update({ status:'active' }).eq('id', job.id)
    await supabase.from('job_time_log').insert({ job_id: job.id, event:'job_resumed', event_time: now, by_name: user.name, by_role: user.role, notes:`Paused for ${dur} mins` })
    await logAction(user, 'job', `Job resumed by ${user.name} at ${job.customer_name} after ${dur} mins pause`)
    loadAll()
  }

  function openCompleteModal(job) {
    setCompForm({
      services_done: [],
      spares_used: '',
      problems_faced: '',
      cash_collected: '',
      tds_raw_water: '',
      tds_rejection: '',
      tds_permeate: '',
      pump_pressure_before: '',
      pump_pressure_after: '',
      flow_rate_before: '',
      flow_rate_after: '',
      spun_cleaned: false,
      spun_replaced: false,
      tank_cleaned: false,
      as_balls_added: '',
      permeate_quality: '',
      tech_sign_name: user.name || '',
      extra_notes: '',
    })
    setCompleteModal(job)
  }

  function toggleService(svc) {
    setCompForm(f => ({
      ...f,
      services_done: f.services_done.includes(svc)
        ? f.services_done.filter(s=>s!==svc)
        : [...f.services_done, svc]
    }))
  }

  async function submitCompletion() {
    const job = completeModal
    const now = new Date().toISOString()
    const totalMins = job.start_time ? Math.round((new Date(now)-new Date(job.start_time))/60000) : 0
    const report = { ...compForm, submitted_at: now, submitted_by: user.name }
    await supabase.from('jobs').update({
      status:'completed',
      end_time: now,
      total_duration_minutes: totalMins,
      completion_report: report,
      cash_collected: Number(compForm.cash_collected)||0,
      tds_raw_water: Number(compForm.tds_raw_water)||null,
      tds_rejection: Number(compForm.tds_rejection)||null,
      tds_permeate: Number(compForm.tds_permeate)||null,
      problems_faced: compForm.problems_faced,
      spares_used: compForm.spares_used,
      services_done: compForm.services_done,
      pump_pressure_before: compForm.pump_pressure_before,
      pump_pressure_after: compForm.pump_pressure_after,
      flow_rate_before: compForm.flow_rate_before,
      flow_rate_after: compForm.flow_rate_after,
      spun_cleaned: compForm.spun_cleaned,
      spun_replaced: compForm.spun_replaced,
      tank_cleaned: compForm.tank_cleaned,
      as_balls_added: Number(compForm.as_balls_added)||0,
      permeate_quality: compForm.permeate_quality,
      tech_sign_name: compForm.tech_sign_name,
      completed_report_at: now,
    }).eq('id', job.id)
    await supabase.from('job_time_log').insert({
      job_id: job.id, event:'job_completed', event_time: now,
      by_name: user.name, by_role: user.role,
      notes: `Services: ${compForm.services_done.join(', ')||'—'} | Cash: Rs.${compForm.cash_collected||0} | TDS in/out: ${compForm.tds_raw_water||'?'}/${compForm.tds_permeate||'?'}`
    })
    await logAction(user, 'job', `Job completed — ${job.customer_name} (${job.service_type}) — ${Math.floor(totalMins/60)}h ${totalMins%60}m`)
    setCompleteModal(null); setCompForm(null)
    loadAll()
  }

  async function requestExtraHours(job) {
    const now = new Date().toISOString()
    await supabase.from('jobs').update({ status:'extra_hrs_requested' }).eq('id', job.id)
    await supabase.from('extra_hours_requests').insert({
      job_id: job.id, technician_id: user.id, technician_name: user.name,
      reason: extraReason, requested_at: now, status:'pending'
    })
    await supabase.from('job_time_log').insert({ job_id: job.id, event:'extra_hours_requested', event_time: now, by_name: user.name, by_role: user.role, notes: extraReason })
    await logAction(user, 'job', `Extra hours requested by ${user.name} for job at ${job.customer_name}. Reason: ${extraReason}`)
    setExtraModal(null); setExtraReason('')
    loadAll()
  }

  async function handleApprove(req, approve) {
    const now = new Date().toISOString()
    await supabase.from('extra_hours_requests').update({
      status: approve ? 'approved' : 'rejected',
      reviewed_by: user.name, reviewed_at: now,
      extra_hours_granted: approve ? Number(extraHours) : 0,
      review_notes: approveNote
    }).eq('id', req.id)
    await supabase.from('jobs').update({
      status: approve ? 'active' : 'flagged',
      extra_hours_approved: approve ? Number(extraHours) : 0
    }).eq('id', req.job_id)
    await supabase.from('job_time_log').insert({ job_id: req.job_id, event: approve?'extra_hours_approved':'extra_hours_rejected', event_time: now, by_name: user.name, by_role: user.role, notes: approve ? `+${extraHours}h approved` : `Rejected: ${approveNote}` })
    await logAction(user, 'job', approve
      ? `Extra hours approved by ${user.name} for ${req.technician_name} — +${extraHours}h`
      : `Extra hours REJECTED by ${user.name} for ${req.technician_name}. Note: ${approveNote}`)
    setApprove(null); setExtraHours(1); setApproveNote('')
    loadAll()
  }

  const statusColor = {
    pending:'text-amber-600', active:'text-green-700', paused:'text-orange-600',
    extra_hrs_requested:'text-purple-700', flagged:'text-red-600', completed:'text-gray-500'
  }

  const todayStart = new Date(); todayStart.setHours(0,0,0,0)
  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999)
  const isToday = (d) => d && new Date(d) >= todayStart && new Date(d) <= todayEnd

  const displayedJobs = (() => {
    if (isTech) {
      return jobs.filter(j =>
        ['pending','active','paused','extra_hrs_requested','flagged'].includes(j.status) ||
        (j.status === 'completed' && isToday(j.end_time || j.created_at))
      )
    }
    if (selectedTech) {
      const techJobs = jobs.filter(j => j.assigned_to === selectedTech)
      if (techTabMode === 'today') {
        return techJobs.filter(j =>
          isToday(j.created_at) || (j.status === 'completed' && isToday(j.end_time))
        )
      }
      return techJobs.filter(j => ['pending','active','paused','extra_hrs_requested','flagged'].includes(j.status))
    }
    return jobs.filter(j => ['pending','active','paused','extra_hrs_requested','flagged'].includes(j.status))
  })()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Tech Tracker</h1>
        {extraReqs.length > 0 && isMgr && (
          <span className="badge badge-purple">{extraReqs.length} extra hour request{extraReqs.length>1?'s':''} pending</span>
        )}
      </div>

      {isMgr && (
        <div className="mb-4">
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-xs text-gray-500 mr-1">View by tech:</span>
            <button onClick={()=>setSelectedTech(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${!selectedTech ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
              All active
            </button>
            {allTechs.map(t => (
              <button key={t.id} onClick={()=>{ setSelectedTech(t.id); setTechTabMode('active') }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${selectedTech===t.id ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                {t.name}
              </button>
            ))}
          </div>
          {selectedTech && (
            <div className="flex gap-1 mt-2 border-b border-gray-100">
              {[['active',"Active jobs"],['today',"Today's jobs"]].map(([k,l])=>(
                <button key={k} onClick={()=>setTechTabMode(k)}
                  className={`tab-btn ${techTabMode===k?'tab-active':'tab-inactive'}`}>{l}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {isMgr && extraReqs.length > 0 && (
        <div className="card border-purple-200 mb-4">
          <div className="section-title text-purple-700">Extra hour requests — action required</div>
          {extraReqs.map(r=>(
            <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <div className="text-sm font-medium">{r.technician_name}</div>
                <div className="text-xs text-gray-500">Reason: {r.reason||'No reason given'}</div>
                <div className="text-xs text-gray-400">Requested {fmt12(r.requested_at)}</div>
              </div>
              <button className="btn btn-sm bg-green-50 text-green-700 border-green-200" onClick={()=>setApprove(r)}>Approve/Reject</button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {displayedJobs.length===0 && (
          <div className="card text-center py-8 text-gray-400 text-sm">
            {selectedTech && techTabMode==='today' ? "No jobs today for this technician" : "No active jobs"}
          </div>
        )}
        {displayedJobs.map(job => {
          const mins = job.start_time ? elapsedMins(job.start_time) : 0
          const allowedMins = (job.working_hours_allowed + (job.extra_hours_approved||0)) * 60
          const pct = allowedMins > 0 ? Math.min(100, Math.round(mins/allowedMins*100)) : 0
          const barCol = pct>=100?'#EF4444':pct>=80?'#F59E0B':'#185FA5'
          const canAct = job.assigned_to === user.id || isMgr
          const isCompleted = job.status === 'completed'
          const isPaused = job.status === 'paused'
          const activePause = jobPauses[job.id]

          return (
            <div key={job.id} className={`card ${isCompleted ? 'opacity-70 border-gray-100' : ''} ${isPaused ? 'border-orange-200 bg-orange-50' : ''} cursor-pointer hover:shadow-md transition-shadow`}
              onClick={()=>setDetailJob(job)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-medium">{job.customer_name}</div>
                  <div className="text-xs text-gray-500">{job.customer_location}</div>
                  {isMgr && job.service_type && <div className="text-xs bg-blue-50 text-blue-700 mt-1 px-2 py-0.5 rounded w-fit">📋 {job.service_type}</div>}
                  <div className="text-xs text-gray-500 mt-1">Technician: <strong>{job.assigned_to_name||'Unassigned'}</strong></div>
                  <div className="text-xs text-gray-500">Mobile: <strong>{job.customer_id ? customers.find(c=>c.id===job.customer_id)?.mobile : customers.find(c=>c.name===job.customer_name)?.mobile || '—'}</strong></div>
                  <div className="flex items-center gap-1 mt-0.5">{job.zones && <><span className="w-2 h-2 rounded-full" style={{background:job.zones.color}}/><span className="text-xs text-gray-500">{job.zones.name}</span></>}</div>
                </div>
                <div className="text-right">
                  <span className={`font-medium text-sm ${statusColor[job.status]||'text-gray-600'}`}>
                    {isPaused ? '⏸ Paused' : job.status}
                  </span>
                  {job.long_distance && <div className="badge badge-warn text-xs mt-0.5">Long distance</div>}
                  {isCompleted && job.end_time && <div className="text-xs text-gray-400 mt-1">Done {fmt12(job.end_time)}</div>}
                </div>
              </div>

              {isPaused && activePause && (
                <div className="mb-3 bg-orange-100 border border-orange-200 rounded p-2 text-xs">
                  <span className="font-medium text-orange-700">⏸ {PAUSE_TYPES.find(p=>p.value===activePause.pause_type)?.label||activePause.pause_type}</span>
                  {activePause.pause_reason && <span className="text-orange-600"> — {activePause.pause_reason}</span>}
                  <span className="text-orange-500 ml-1">· Paused {elapsed(activePause.paused_at)} ago</span>
                </div>
              )}

              {(job.status==='active'||isPaused) && job.start_time && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Elapsed: <strong>{elapsed(job.start_time)}</strong></span>
                    <span>Allowed: <strong>{job.working_hours_allowed + (job.extra_hours_approved||0)}h</strong></span>
                    <span className={pct>=100?'text-red-600 font-medium':pct>=80?'text-amber-600':'text-gray-500'}>{pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-2 rounded-full transition-all" style={{width:pct+'%',background:barCol}}/>
                  </div>
                  {pct >= 80 && pct < 100 && <p className="text-xs text-amber-600 mt-1">⚠ Approaching time limit</p>}
                  {pct >= 100 && <p className="text-xs text-red-600 mt-1">⏱ Time limit reached</p>}
                </div>
              )}

              {isCompleted && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 mb-2 space-y-0.5">
                  {job.total_duration_minutes && <div>✓ Completed in {Math.floor(job.total_duration_minutes/60)}h {job.total_duration_minutes%60}m</div>}
                  {job.services_done?.length > 0 && <div>🔧 {job.services_done.join(', ')}</div>}
                  {job.cash_collected > 0 && <div>💰 Cash: Rs.{job.cash_collected}</div>}
                  {job.tds_permeate && <div>💧 TDS out: {job.tds_permeate} ppm</div>}
                  {job.problems_faced && <div>⚠ {job.problems_faced}</div>}
                </div>
              )}

              {canAct && !isCompleted && (
                <div className="flex gap-2 flex-wrap">
                  {job.status==='pending' && ((isTech && job.assigned_to===user.id) || isMgr) && (
                    <button className="btn-primary btn-sm rounded-lg" onClick={()=>acceptJob(job)}>Accept job</button>
                  )}
                  {job.status==='active' && (
                    <>
                      {!job.travel_start_time && ((isTech && job.assigned_to===user.id) || isMgr) && (
                        <button className="btn btn-sm" onClick={()=>startTravel(job)}>Start travel</button>
                      )}
                      {job.travel_start_time && !job.travel_end_time && ((isTech && job.assigned_to===user.id) || isMgr) && (
                        <button className="btn btn-sm bg-green-50 text-green-700 border-green-200" onClick={()=>arriveAtSite(job)}>Arrived at site</button>
                      )}
                      {((isTech && job.assigned_to===user.id) || isMgr) && (
                        <>
                          <button className="btn btn-sm bg-orange-50 text-orange-700 border-orange-200"
                            onClick={()=>setPauseModal(job)}>⏸ Pause</button>
                          <button className="btn-primary btn-sm rounded-lg bg-green-600 border-green-600 hover:bg-green-700"
                            onClick={()=>openCompleteModal(job)}>Mark complete</button>
                          {pct >= 100 && (
                            <button className="btn btn-sm bg-purple-50 text-purple-700 border-purple-200"
                              onClick={()=>setExtraModal(job)}>Request extra hours</button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {isPaused && ((isTech && job.assigned_to===user.id) || isMgr) && (
                    <button className="btn-primary btn-sm rounded-lg" onClick={()=>resumeJob(job)}>▶ Resume job</button>
                  )}
                  {job.status==='extra_hrs_requested' && isMgr && (
                    <button className="btn btn-sm bg-purple-50 text-purple-700 border-purple-200"
                      onClick={()=>setApprove(extraReqs.find(r=>r.job_id===job.id)||{job_id:job.id,technician_name:job.assigned_to_name,reason:'',requested_at:new Date().toISOString()})}>
                      Review extra hours
                    </button>
                  )}
                </div>
              )}

              {job.travel_start_time && (
                <div className="text-xs text-gray-400 mt-2">
                  Travel started: {fmt12(job.travel_start_time)}
                  {job.travel_end_time && <> · Arrived: {fmt12(job.travel_end_time)} · Travel time: {job.travel_duration_minutes} mins</>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pause modal */}
      {pauseModal && (
        <Modal title={`Pause job — ${pauseModal.customer_name}`} onClose={()=>setPauseModal(null)} size="sm">
          <div className="space-y-3">
            <div>
              <label className="label">Reason for pause</label>
              <div className="space-y-1.5">
                {PAUSE_TYPES.map(pt=>(
                  <label key={pt.value} className="flex items-center gap-2 cursor-pointer p-2 rounded border border-gray-100 hover:bg-gray-50">
                    <input type="radio" name="pauseType" value={pt.value} checked={pauseType===pt.value}
                      onChange={e=>setPauseType(e.target.value)} className="accent-brand"/>
                    <span className="text-sm">{pt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Extra details (optional)</label>
              <textarea className="input resize-none" rows={2} value={pauseReason}
                onChange={e=>setPauseReason(e.target.value)} placeholder="e.g. waiting for membrane from shop…"/>
            </div>
            <div className="bg-amber-50 text-amber-700 text-xs p-2 rounded">Job timer keeps running. Resume when you are back.</div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setPauseModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={()=>pauseJob(pauseModal)}>Pause job</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Completion form modal */}
      {completeModal && compForm && (
        <Modal title={`Service report — ${completeModal.customer_name}`} onClose={()=>{setCompleteModal(null);setCompForm(null)}} size="lg">
          <div className="space-y-5 text-sm">

            <div>
              <div className="label mb-2">Services done <span className="text-gray-400 font-normal">(tick all that apply)</span></div>
              <div className="grid grid-cols-2 gap-1.5">
                {SERVICE_OPTIONS.map(svc=>(
                  <label key={svc} className={`flex items-center gap-2 cursor-pointer p-2 rounded border text-xs transition-colors ${compForm.services_done.includes(svc)?'bg-blue-50 border-blue-300 text-blue-800':'border-gray-100 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={compForm.services_done.includes(svc)} onChange={()=>toggleService(svc)} className="accent-brand"/>
                    {svc}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Spares / parts used</label>
                <textarea className="input resize-none text-xs" rows={3} value={compForm.spares_used}
                  onChange={e=>setCompForm(f=>({...f,spares_used:e.target.value}))}
                  placeholder="e.g. Inline set, Membrane, Flush 3/8…"/>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded border border-gray-100 hover:bg-gray-50 text-xs">
                  <input type="checkbox" checked={compForm.spun_cleaned} onChange={e=>setCompForm(f=>({...f,spun_cleaned:e.target.checked}))} className="accent-brand"/>
                  Spun cleaned
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded border border-gray-100 hover:bg-gray-50 text-xs">
                  <input type="checkbox" checked={compForm.spun_replaced} onChange={e=>setCompForm(f=>({...f,spun_replaced:e.target.checked}))} className="accent-brand"/>
                  Spun replaced
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded border border-gray-100 hover:bg-gray-50 text-xs">
                  <input type="checkbox" checked={compForm.tank_cleaned} onChange={e=>setCompForm(f=>({...f,tank_cleaned:e.target.checked}))} className="accent-brand"/>
                  RO tank cleaned
                </label>
                <div>
                  <label className="label text-xs">AS Balls added</label>
                  <input type="number" className="input" min={0} value={compForm.as_balls_added}
                    onChange={e=>setCompForm(f=>({...f,as_balls_added:e.target.value}))} placeholder="0"/>
                </div>
              </div>
            </div>

            <div>
              <div className="label mb-2">TDS Readings (ppm)</div>
              <div className="grid grid-cols-3 gap-3">
                {[['tds_raw_water','Raw Water (in)'],['tds_rejection','Rejection'],['tds_permeate','Permeate (out)']].map(([k,l])=>(
                  <div key={k}>
                    <label className="label text-xs">{l}</label>
                    <input type="number" className="input" value={compForm[k]}
                      onChange={e=>setCompForm(f=>({...f,[k]:e.target.value}))} placeholder="e.g. 681"/>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="label mb-2">Pump Pressure & Flow Rate</div>
              <div className="grid grid-cols-2 gap-3">
                {[['pump_pressure_before','Pressure — Before'],['pump_pressure_after','Pressure — After'],['flow_rate_before','Flow Rate — Before'],['flow_rate_after','Flow Rate — After']].map(([k,l])=>(
                  <div key={k}>
                    <label className="label text-xs">{l}</label>
                    <input className="input" value={compForm[k]}
                      onChange={e=>setCompForm(f=>({...f,[k]:e.target.value}))} placeholder="e.g. 60 psi / 200 ml"/>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Permeate Water Quality</label>
              <div className="flex gap-2">
                {[['good','✅ Good'],['normal','🟡 Normal'],['slow','🔴 Slow']].map(([q,l])=>(
                  <label key={q} className={`flex-1 text-center cursor-pointer py-2 rounded border text-xs font-medium transition-colors ${compForm.permeate_quality===q?'bg-blue-50 border-blue-300 text-blue-700':'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="pq" value={q} className="sr-only" checked={compForm.permeate_quality===q} onChange={()=>setCompForm(f=>({...f,permeate_quality:q}))}/>
                    {l}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Problems / Issues faced</label>
              <textarea className="input resize-none" rows={2} value={compForm.problems_faced}
                onChange={e=>setCompForm(f=>({...f,problems_faced:e.target.value}))}
                placeholder="Any issues, customer complaints, or things to follow up…"/>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cash collected (Rs.)</label>
                <input type="number" className="input" value={compForm.cash_collected}
                  onChange={e=>setCompForm(f=>({...f,cash_collected:e.target.value}))} placeholder="0"/>
              </div>
              <div>
                <label className="label">Extra notes</label>
                <input className="input" value={compForm.extra_notes}
                  onChange={e=>setCompForm(f=>({...f,extra_notes:e.target.value}))} placeholder="Anything else to note…"/>
              </div>
            </div>

            <div>
              <label className="label">Technician name (for record)</label>
              <input className="input" value={compForm.tech_sign_name}
                onChange={e=>setCompForm(f=>({...f,tech_sign_name:e.target.value}))}/>
            </div>

            <div className="bg-green-50 text-green-700 text-xs p-2 rounded">
              All details will be visible to admin and manager in Job Reports.
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>{setCompleteModal(null);setCompForm(null)}}>Cancel</button>
            <button className="btn-primary rounded-lg px-5 py-2 text-sm" onClick={submitCompletion}>
              ✅ Submit & Complete
            </button>
          </ModalFooter>
        </Modal>
      )}

      {extraModal && (
        <Modal title="Request extra hours" onClose={()=>setExtraModal(null)} size="sm">
          <div className="space-y-3">
            <div className="bg-amber-50 text-amber-700 text-xs p-2 rounded">Job at {extraModal.customer_name} has reached time limit.</div>
            <div><label className="label">Reason (optional)</label><textarea className="input resize-none" rows={3} value={extraReason} onChange={e=>setExtraReason(e.target.value)} placeholder="Explain why extra time is needed…"/></div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setExtraModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={()=>requestExtraHours(extraModal)}>Send request</button>
          </ModalFooter>
        </Modal>
      )}

      {approveModal && (
        <Modal title={`Extra hours — ${approveModal.technician_name}`} onClose={()=>setApprove(null)} size="sm">
          <div className="space-y-3">
            <div className="bg-gray-50 rounded p-2 text-xs">Reason: {approveModal.reason||'No reason given'}</div>
            <div><label className="label">Hours to grant (if approving)</label><input type="number" step="0.5" className="input" value={extraHours} onChange={e=>setExtraHours(e.target.value)}/></div>
            <div><label className="label">Review note</label><input className="input" value={approveNote} onChange={e=>setApproveNote(e.target.value)}/></div>
          </div>
          <ModalFooter>
            <button className="btn btn-sm bg-red-50 text-red-700 border-red-200" onClick={()=>handleApprove(approveModal,false)}>Reject</button>
            <button className="btn btn-sm" onClick={()=>setApprove(null)}>Cancel</button>
            <button className="btn-primary btn-sm rounded-lg" onClick={()=>handleApprove(approveModal,true)}>Approve +{extraHours}h</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Job detail modal */}
      {detailJob && (
        <Modal title="Job Details" onClose={()=>setDetailJob(null)} size="lg">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
              <div><span className="text-gray-500">Customer:</span> <strong>{detailJob.customer_name}</strong></div>
              <div><span className="text-gray-500">Mobile:</span> <strong>{detailJob.customer_id ? customers.find(c=>c.id===detailJob.customer_id)?.mobile : customers.find(c=>c.name===detailJob.customer_name)?.mobile || 'Not found'}</strong></div>
              <div><span className="text-gray-500">Location:</span> <strong>{detailJob.customer_location||'—'}</strong></div>
              <div><span className="text-gray-500">Service type:</span> <strong>{detailJob.service_type||'—'}</strong></div>
              <div><span className="text-gray-500">Technician:</span> <strong>{detailJob.assigned_to_name||'Unassigned'}</strong></div>
              <div><span className="text-gray-500">Zone:</span> {detailJob.zones && <><span className="w-2 h-2 rounded-full inline-block" style={{background:detailJob.zones.color}}/> {detailJob.zones.name}</>}</div>
              <div><span className="text-gray-500">Status:</span> <span className={`font-medium ${statusColor[detailJob.status]||'text-gray-600'}`}>{detailJob.status}</span></div>
              <div><span className="text-gray-500">Hours allowed:</span> <strong>{detailJob.working_hours_allowed + (detailJob.extra_hours_approved||0)}h</strong></div>
              {detailJob.long_distance && <div className="col-span-2"><span className="badge badge-warn">Long distance</span></div>}
            </div>

            {detailJob.start_time && (
              <div className="space-y-2 bg-blue-50 rounded-lg p-3">
                <div className="font-medium text-blue-900">Timeline</div>
                <div className="text-xs space-y-1">
                  <div><span className="text-gray-600">Started:</span> {fmt12(detailJob.start_time)}</div>
                  {detailJob.travel_start_time && <div><span className="text-gray-600">Travel started:</span> {fmt12(detailJob.travel_start_time)}</div>}
                  {detailJob.travel_end_time && <div><span className="text-gray-600">Arrived at site:</span> {fmt12(detailJob.travel_end_time)} <span className="text-gray-400">({detailJob.travel_duration_minutes} mins)</span></div>}
                  {detailJob.end_time && <div><span className="text-gray-600">Completed:</span> {fmt12(detailJob.end_time)}</div>}
                  {detailJob.total_duration_minutes && <div className="font-medium"><span className="text-gray-600">Total time:</span> {Math.floor(detailJob.total_duration_minutes/60)}h {detailJob.total_duration_minutes%60}m</div>}
                </div>
              </div>
            )}

            {detailJob.status === 'completed' && detailJob.completion_report && (
              <div className="space-y-2 bg-green-50 rounded-lg p-3">
                <div className="font-medium text-green-900">Completion Report</div>
                <div className="text-xs space-y-1">
                  {detailJob.completion_report.services_done?.length > 0 && <div><span className="text-gray-600">Services:</span> {detailJob.completion_report.services_done.join(', ')}</div>}
                  {detailJob.completion_report.spares_used && <div><span className="text-gray-600">Spares used:</span> {detailJob.completion_report.spares_used}</div>}
                  {detailJob.cash_collected > 0 && <div><span className="text-gray-600">Cash collected:</span> <strong>Rs.{detailJob.cash_collected}</strong></div>}
                  {detailJob.tds_raw_water && <div><span className="text-gray-600">TDS In/Out:</span> {detailJob.tds_raw_water}/{detailJob.tds_permeate} ppm</div>}
                  {detailJob.problems_faced && <div><span className="text-gray-600">Issues:</span> {detailJob.problems_faced}</div>}
                  {detailJob.completion_report.permeate_quality && <div><span className="text-gray-600">Quality:</span> {detailJob.completion_report.permeate_quality}</div>}
                </div>
              </div>
            )}

            {jobPauses[detailJob.id] && (
              <div className="bg-orange-50 rounded-lg p-3 text-xs">
                <div className="font-medium text-orange-900">Current Pause</div>
                <div><span className="text-gray-600">{PAUSE_TYPES.find(p=>p.value===jobPauses[detailJob.id].pause_type)?.label}</span></div>
                {jobPauses[detailJob.id].pause_reason && <div><span className="text-gray-600">Reason:</span> {jobPauses[detailJob.id].pause_reason}</div>}
                <div><span className="text-gray-600">Paused:</span> {fmt12(jobPauses[detailJob.id].paused_at)}</div>
              </div>
            )}
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setDetailJob(null)}>Close</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
