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

export default function TechTracker() {
  const { user }           = useAuth()
  const [jobs, setJobs]    = useState([])
  const [extraReqs, setEx] = useState([])
  const [tick, setTick]    = useState(0)
  const [extraModal, setExtraModal]   = useState(null) // tech: request
  const [approveModal, setApprove]    = useState(null) // manager: approve/reject
  const [extraReason, setExtraReason] = useState('')
  const [extraHours, setExtraHours]   = useState(1)
  const [approveNote, setApproveNote] = useState('')
  const isTech = user.role === 'technician'
  const isMgr  = user.role === 'manager' || user.role === 'admin'
  const canControl = isTech || isMgr

  useEffect(() => {
    loadAll()
    const t = setInterval(() => setTick(n=>n+1), 30000)
    return () => clearInterval(t)
  }, [])

  async function loadAll() {
    const jQ = isTech
      ? supabase.from('jobs').select('*,zones(name,color)').eq('assigned_to', user.id).neq('status','completed').order('created_at',{ascending:false})
      : supabase.from('jobs').select('*,zones(name,color),app_users!assigned_to(name)').in('status',['pending','active','extra_hrs_requested','flagged']).order('created_at',{ascending:false})
    const [j, ex] = await Promise.all([
      jQ,
      supabase.from('extra_hours_requests').select('*').eq('status','pending'),
    ])
    setJobs(j.data||[])
    setEx(ex.data||[])
  }

  async function acceptJob(job) {
    // Only one active job allowed
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

  async function completeJob(job) {
    const now = new Date().toISOString()
    const totalMins = job.start_time ? Math.round((new Date(now)-new Date(job.start_time))/60000) : 0
    await supabase.from('jobs').update({
      status:'completed', end_time: now, total_duration_minutes: totalMins
    }).eq('id', job.id)
    await supabase.from('job_time_log').insert({ job_id: job.id, event:'job_completed', event_time: now, by_name: user.name, by_role: user.role, notes:`Total: ${Math.floor(totalMins/60)}h ${totalMins%60}m` })
    await logAction(user, 'job', `Job completed — ${job.customer_name} (${job.service_type}) — total ${Math.floor(totalMins/60)}h ${totalMins%60}m`)
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

  const statusColor = { pending:'text-amber-600', active:'text-green-700', extra_hrs_requested:'text-purple-700', flagged:'text-red-600' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Tech Tracker</h1>
        {extraReqs.length > 0 && isMgr && (
          <span className="badge badge-purple">{extraReqs.length} extra hour request{extraReqs.length>1?'s':''} pending</span>
        )}
      </div>

      {/* Manager/Admin: pending extra hour requests */}
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
              <div className="flex gap-2">
                <button className="btn btn-sm bg-green-50 text-green-700 border-green-200" onClick={()=>setApprove(r)}>Approve/Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Jobs list */}
      <div className="space-y-3">
        {jobs.length===0 && <div className="card text-center py-8 text-gray-400 text-sm">No active jobs</div>}
        {jobs.map(job => {
          const mins = job.start_time ? elapsedMins(job.start_time) : 0
          const allowedMins = (job.working_hours_allowed + (job.extra_hours_approved||0)) * 60
          const pct = allowedMins > 0 ? Math.min(100, Math.round(mins/allowedMins*100)) : 0
          const barCol = pct>=100?'#EF4444':pct>=80?'#F59E0B':'#185FA5'
          const canAct = job.assigned_to === user.id || isMgr

          return (
            <div key={job.id} className="card">
              <div className="flex items-start justify-between mb-3">
              <div>
                  <div className="font-medium">{job.customer_name}</div>
                  <div className="text-xs text-gray-500">{job.customer_location}</div>
                  {isMgr && job.service_type && <div className="text-xs bg-blue-50 text-blue-700 mt-1 px-2 py-0.5 rounded w-fit">📋 {job.service_type}</div>}
                  <div className="flex items-center gap-1 mt-0.5">{job.zones && <><span className="w-2 h-2 rounded-full" style={{background:job.zones.color}}/><span className="text-xs text-gray-500">{job.zones.name}</span></>}</div>
                </div>
                <div className="text-right">
                  <span className={`font-medium text-sm ${statusColor[job.status]||'text-gray-600'}`}>{job.status}</span>
                  {job.long_distance && <div className="badge badge-warn text-xs mt-0.5">Long distance</div>}
                </div>
              </div>

              {/* Timer for active jobs */}
              {job.status==='active' && job.start_time && (
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

              {/* Action buttons */}
              {canAct && (
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
                          <button className="btn-primary btn-sm rounded-lg bg-green-600 border-green-600 hover:bg-green-700"
                            onClick={()=>completeJob(job)}>Mark complete</button>
                          {pct >= 100 && (
                            <button className="btn btn-sm bg-purple-50 text-purple-700 border-purple-200"
                              onClick={()=>setExtraModal(job)}>Request extra hours</button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {job.status==='extra_hrs_requested' && isMgr && (
                    <button className="btn btn-sm bg-purple-50 text-purple-700 border-purple-200"
                      onClick={()=>setApprove(extraReqs.find(r=>r.job_id===job.id)||{job_id:job.id,technician_name:job.assigned_to_name,reason:'',requested_at:new Date().toISOString()})}>
                      Review extra hours
                    </button>
                  )}
                </div>
              )}

              {/* Travel & completion info */}
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

      {/* Request extra hours modal */}
      {extraModal && (
        <Modal title="Request extra hours" onClose={()=>setExtraModal(null)} size="sm">
          <div className="space-y-3">
            <div className="bg-amber-50 text-amber-700 text-xs p-2 rounded">Job at {extraModal.customer_name} has reached time limit. Request will be sent to manager.</div>
            <div><label className="label">Reason (optional)</label><textarea className="input resize-none" rows={3} value={extraReason} onChange={e=>setExtraReason(e.target.value)} placeholder="Explain why extra time is needed…"/></div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setExtraModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={()=>requestExtraHours(extraModal)}>Send request</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Approve/reject modal */}
      {approveModal && (
        <Modal title={`Extra hours request — ${approveModal.technician_name}`} onClose={()=>setApprove(null)} size="sm">
          <div className="space-y-3">
            <div className="bg-gray-50 rounded p-2 text-xs">Reason: {approveModal.reason||'No reason given'}</div>
            <div><label className="label">Extra hours to grant (if approving)</label><input type="number" step="0.5" className="input" value={extraHours} onChange={e=>setExtraHours(e.target.value)}/></div>
            <div><label className="label">Review note (optional)</label><input className="input" value={approveNote} onChange={e=>setApproveNote(e.target.value)}/></div>
            <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded">Decision is saved permanently in Updates log</div>
          </div>
          <ModalFooter>
            <button className="btn btn-sm bg-red-50 text-red-700 border-red-200" onClick={()=>handleApprove(approveModal,false)}>Reject</button>
            <button className="btn btn-sm" onClick={()=>setApprove(null)}>Cancel</button>
            <button className="btn-primary btn-sm rounded-lg" onClick={()=>handleApprove(approveModal,true)}>Approve +{extraHours}h</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
