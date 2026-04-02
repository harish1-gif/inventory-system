import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt12, logAction, SERVICE_TYPES } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function Jobs() {
  const { user }           = useAuth()
  const [jobs, setJobs]    = useState([])
  const [zones, setZones]  = useState([])
  const [techs, setTechs]  = useState([])
  const [customers, setCustomers] = useState([])
  const [zoneTechs, setZT] = useState([])
  const [modal, setModal]  = useState(false)
  const [activeTab, setActiveTab] = useState('active')
  const [detailModal, setDetail] = useState(null)
  const [search, setSearch] = useState('')
  const isTech = user.role === 'technician'
  const canCreate = !isTech

  const blank = { customer_id:'', customer_name:'', customer_location:'', zone_id:'', assigned_to:'', assigned_to_name:'',
    service_type:'General Service', working_hours_allowed:2, long_distance:false,
    extra_hours_approved:0, notes:'' }
  const [form, setForm] = useState(blank)

  useEffect(() => { loadAll() }, [user])

  async function loadAll() {
    const jQ = isTech
      ? supabase.from('jobs').select('*,zones(name,color)').eq('assigned_to', user.id).order('created_at',{ascending:false})
      : supabase.from('jobs').select('*,zones(name,color)').order('created_at',{ascending:false})
    const [j, z, u, c, zt] = await Promise.all([
      jQ,
      supabase.from('zones').select('*').order('km_from_kpm'),
      supabase.from('app_users').select('id,name').eq('role','technician').eq('status','active'),
      supabase.from('customers').select('id,name,mobile,address,area').order('name'),
      supabase.from('zone_technicians').select('*'),
    ])
    setJobs(j.data||[])
    setZones(z.data||[])
    setTechs(u.data||[])
    setCustomers(c.data||[])
    setZT(zt.data||[])
  }

  const [customerSearch, setCustomerSearch] = useState('')

  const filteredCustomers = customers.filter(c =>
    !customerSearch ||
    c.mobile.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.area && c.area.toLowerCase().includes(customerSearch.toLowerCase()))
  )

  const techsForZone = form.zone_id
    ? zoneTechs.filter(zt=>zt.zone_id===form.zone_id).map(zt=>techs.find(t=>t.id===zt.technician_id)).filter(Boolean)
    : techs

  async function saveJob() {
    if (!form.customer_name.trim()) return
    const t = techs.find(t=>t.id===form.assigned_to)
    const payload = {
      customer_name: form.customer_name,
      customer_location: form.customer_location,
      zone_id: form.zone_id,
      assigned_to: form.assigned_to,
      assigned_to_name: t?.name||'',
      service_type: form.service_type,
      working_hours_allowed: form.working_hours_allowed,
      long_distance: form.long_distance,
      extra_hours_approved: form.extra_hours_approved,
      notes: form.notes,
      created_by: user.name,
      status:'pending'
    }
    await supabase.from('jobs').insert(payload)
    const z = zones.find(z=>z.id===form.zone_id)
    await logAction(user, 'job',
      `Job created for ${form.customer_name} — ${form.service_type} — assigned to ${t?.name||'unassigned'} (${z?.name||'no zone'})`)
    setModal(false); setForm(blank); setCustomerSearch(''); loadAll()
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const filtered = activeTab === 'active'
    ? jobs.filter(j => 
        j.status === 'pending' || 
        j.status === 'active' || 
        (j.status === 'completed' && j.end_time && new Date(j.end_time) >= sevenDaysAgo)
      ).filter(j => 
        !search || 
        j.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        j.customer_location?.toLowerCase().includes(search.toLowerCase()) ||
        j.assigned_to_name?.toLowerCase().includes(search.toLowerCase()) ||
        customers.find(c=>c.name===j.customer_name)?.mobile?.toLowerCase().includes(search.toLowerCase())
      )
    : jobs.filter(j => 
        j.status === 'completed' && j.end_time && new Date(j.end_time) >= sevenDaysAgo
      ).filter(j => 
        !search || 
        j.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        j.customer_location?.toLowerCase().includes(search.toLowerCase()) ||
        j.assigned_to_name?.toLowerCase().includes(search.toLowerCase()) ||
        customers.find(c=>c.name===j.customer_name)?.mobile?.toLowerCase().includes(search.toLowerCase())
      )
  const statusColor = { pending:'badge-warn', active:'badge-blue', extra_hrs_requested:'badge-purple',
    completed:'badge-ok', flagged:'badge-danger' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Jobs</h1>
        <div className="flex gap-2 items-center">
          <input 
            type="text" 
            placeholder="Search jobs..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            className="input w-full sm:w-64" 
          />
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 text-xs">
            <button onClick={()=>setActiveTab('active')}
              className={`px-3 py-1.5 rounded transition-colors ${activeTab==='active'?'bg-brand text-white':'text-gray-500 hover:bg-gray-50'}`}>
              Active Jobs
            </button>
            <button onClick={()=>setActiveTab('completed')}
              className={`px-3 py-1.5 rounded transition-colors ${activeTab==='completed'?'bg-brand text-white':'text-gray-500 hover:bg-gray-50'}`}>
              Completed Jobs
            </button>
          </div>
          {canCreate && <button className="btn-primary btn-sm rounded-lg" onClick={()=>setModal(true)}>+ New job</button>}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead><tr>
            <th className="th">Customer</th><th className="th">Mobile</th><th className="th">Zone</th><th className="th">Technician</th>
            <th className="th">Service type</th><th className="th">Hours</th>
            <th className="th">Status</th><th className="th">Created</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {filtered.map(j=>(
              <tr key={j.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>setDetail(j)}>
                <td className="td">
                  <div className="font-medium">{j.customer_name}</div>
                  <div className="text-gray-400">{j.customer_location}</div>
                </td>
                <td className="td text-gray-600">{customers.find(c=>c.name===j.customer_name)?.mobile || '—'}</td>
                <td className="td">
                  {j.zones && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:j.zones.color}}/>{j.zones.name}</span>}
                </td>
                <td className="td font-medium">{j.assigned_to_name||'—'}</td>
                <td className="td"><span className="badge badge-gray">{j.service_type}</span></td>
                <td className="td">
                  {j.working_hours_allowed}h
                  {j.long_distance && <span className="badge badge-warn ml-1">Long dist</span>}
                </td>
                <td className="td"><span className={`badge ${statusColor[j.status]||'badge-gray'}`}>{j.status}</span></td>
                <td className="td text-gray-400">{fmt12(j.created_at)}</td>
                <td className="td"><span className="text-blue-500 hover:underline text-xs">Details</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length===0 && <p className="text-xs text-gray-400 text-center py-8">No jobs found</p>}
      </div>

      {/* New job modal */}
      {modal && (
        <Modal title="New job assignment" onClose={()=>{setModal(false); setForm(blank); setCustomerSearch('')}} size="lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
              <label className="label">Select Customer by Mobile</label>
              <input
                type="text"
                className="input mb-2"
                placeholder="Search by mobile, name, or area..."
                value={customerSearch}
                onChange={e=>setCustomerSearch(e.target.value)}
              />
              {customerSearch && filteredCustomers.length > 0 && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredCustomers.slice(0, 10).map(c=>(
                    <div
                      key={c.id}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                      onClick={()=>{
                        setForm(f=>({
                          ...f,
                          customer_id: c.id,
                          customer_name: c.name || '',
                          customer_location: `${c.address || ''} ${c.area || ''}`.trim(),
                        }))
                        setCustomerSearch('')
                      }}
                    >
                      <div className="font-medium">{c.mobile}</div>
                      <div className="text-sm text-gray-600">{c.name} {c.area ? `(${c.area})` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {customerSearch && filteredCustomers.length === 0 && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-gray-500 text-sm">
                  No customers found
                </div>
              )}
            </div>
            <div><label className="label">Customer Name</label><input className="input" value={form.customer_name} readOnly/></div>
            <div className="col-span-2"><label className="label">Location / address</label><input className="input" value={form.customer_location} onChange={e=>setForm(f=>({...f,customer_location:e.target.value}))}/></div>
            <div>
              <label className="label">Zone</label>
              <select className="input" value={form.zone_id} onChange={e=>setForm(f=>({...f,zone_id:e.target.value,assigned_to:''}))}>
                <option value="">Select zone…</option>
                {zones.map(z=><option key={z.id} value={z.id}>{z.name} ({z.km_from_kpm}km)</option>)}
              </select>
            </div>
            <div>
              <label className="label">Technician</label>
              <select className="input" value={form.assigned_to} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}>
                <option value="">Select tech…</option>
                {techsForZone.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Service type</label>
              <select className="input" value={form.service_type} onChange={e=>setForm(f=>({...f,service_type:e.target.value}))}>
                {SERVICE_TYPES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label">Working hours allowed</label><input type="number" step="0.5" className="input" value={form.working_hours_allowed} onChange={e=>setForm(f=>({...f,working_hours_allowed:e.target.value}))}/></div>
            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.long_distance} onChange={e=>setForm(f=>({...f,long_distance:e.target.checked}))} className="rounded"/>
                <span className="text-xs">Long distance job</span>
              </label>
              {form.long_distance && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Extra hours approved:</span>
                  <input type="number" step="0.5" className="input w-20" value={form.extra_hours_approved} onChange={e=>setForm(f=>({...f,extra_hours_approved:e.target.value}))}/>
                </div>
              )}
            </div>
            <div className="col-span-2"><label className="label">Notes / remarks</label><textarea className="input resize-none" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded mt-2">Job creation is saved permanently in Updates log</div>
          <ModalFooter>
            <button className="btn" onClick={()=>setModal(false)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={saveJob}>Create job</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Detail modal */}
      {detailModal && (
        <Modal title="Job details" onClose={()=>setDetail(null)} size="md">
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
              <div><span className="text-gray-400">Customer:</span> <strong>{detailModal.customer_name}</strong></div>
              <div><span className="text-gray-400">Mobile:</span> {customers.find(c=>c.name===detailModal.customer_name)?.mobile || '—'}</div>
              <div><span className="text-gray-400">Location:</span> {detailModal.customer_location||'—'}</div>
              <div><span className="text-gray-400">Service:</span> <span className="badge badge-gray">{detailModal.service_type}</span></div>
              <div><span className="text-gray-400">Technician:</span> <strong>{detailModal.assigned_to_name||'—'}</strong></div>
              <div><span className="text-gray-400">Hours allowed:</span> {detailModal.working_hours_allowed}h</div>
              <div><span className="text-gray-400">Status:</span> <span className={`badge ${statusColor[detailModal.status]}`}>{detailModal.status}</span></div>
              {detailModal.long_distance && <div className="col-span-2"><span className="badge badge-warn">Long distance</span> — {detailModal.extra_hours_approved}h extra approved</div>}
            </div>
            {detailModal.start_time && <div><span className="text-gray-400">Started:</span> {fmt12(detailModal.start_time)}</div>}
            {detailModal.end_time && <div><span className="text-gray-400">Completed:</span> {fmt12(detailModal.end_time)}</div>}
            {detailModal.total_duration_minutes && <div><span className="text-gray-400">Total time:</span> <strong>{Math.floor(detailModal.total_duration_minutes/60)}h {detailModal.total_duration_minutes%60}m</strong></div>}
            {detailModal.notes && <div className="bg-amber-50 rounded p-2"><span className="text-gray-400">Notes:</span> {detailModal.notes}</div>}
            <div className="text-gray-400">Created by {detailModal.created_by} · {fmt12(detailModal.created_at)}</div>
          </div>
          <ModalFooter><button className="btn" onClick={()=>setDetail(null)}>Close</button></ModalFooter>
        </Modal>
      )}
    </div>
  )
}
