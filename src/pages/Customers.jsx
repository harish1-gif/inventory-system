import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt12, fmtD, fmtM } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

const STATUS_COLORS = {
  pending:   'badge-warn',
  completed: 'badge-ok',
  rejected:  'badge-danger',
}
const STATUS_LABELS = { pending:'Pending', completed:'Completed', rejected:'Rejected' }

const SOURCE_COLORS = { online:'badge-blue', offline:'badge-gray' }
const SOURCE_LABELS = { online:'Online', offline:'Offline' }

export default function Customers() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('b2c')
  const [customers, setCustomers] = useState([])
  const [purifierModels, setPurifierModels] = useState([])
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [addModal, setAddModal]   = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [profile, setProfile]     = useState(null)
  const [statusModal, setStatusModal] = useState(null)
  const [payModal, setPayModal]   = useState(null)
  const [purifierModal, setPurifierModal] = useState(null)
  const [form, setForm]           = useState({ name:'', mobile:'', address:'', area:'', business_type:'b2c', source:'offline', since: new Date().toISOString().split('T')[0] })
  const canEdit     = user.role === 'admin' || user.role === 'manager'
  const canSeeNotes = user.role !== 'technician'

  useEffect(() => { load() }, [activeTab])

  async function load() {
    const { data: modelsData } = await supabase.from('purifier_models').select('*')
    setPurifierModels(modelsData || [])

    // Fetch all customers with pagination since Supabase limits to 1000 per query
    let allCustomers = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data: customersData } = await supabase
        .from('customers')
        .select('*')
        .eq('business_type', activeTab)
        .order('name')
        .range(from, from + pageSize - 1)
      if (!customersData || customersData.length === 0) break
      allCustomers = allCustomers.concat(customersData)
      from += pageSize
      if (customersData.length < pageSize) break // Last page
    }

    const customers = allCustomers
    customers.forEach(c => {
      const model = modelsData.find(m => m.id === c.purifier_model_id)
      c.purifier_model_name = model ? model.name : 'Unknown'
    })
    const customerIds = customers.map(c => c.id)
    if (customerIds.length > 0) {
      const [purifiersResponse, serviceCallsResponse] = await Promise.all([
        supabase.from('purifiers').select('id,customer_id,model,serial_no,installed_date,interval_days,total_services,status,image_url'),
        supabase.from('service_calls').select('id,customer_id,pending_amount,call_datetime,total_amount,status')
      ])
      const purifiersData = purifiersResponse.data || []
      const serviceCallsData = serviceCallsResponse.data || []
      const purifiersMap = {}
      purifiersData.filter(p => customerIds.includes(p.customer_id)).forEach(p => {
        if (!purifiersMap[p.customer_id]) purifiersMap[p.customer_id] = []
        const idToMatch = p.model
        const model = modelsData.find(m => m.id === idToMatch)
        p.model_name = model ? model.name : (p.model || 'Unknown')
        purifiersMap[p.customer_id].push(p)
      })
      const serviceCallsMap = {}
      serviceCallsData.filter(s => customerIds.includes(s.customer_id)).forEach(s => {
        if (!serviceCallsMap[s.customer_id]) serviceCallsMap[s.customer_id] = []
        serviceCallsMap[s.customer_id].push(s)
      })
      customers.forEach(c => {
        c.purifiers = purifiersMap[c.id] || []
        c.service_calls = serviceCallsMap[c.id] || []
      })
    }
    setCustomers(customers)
  }

  async function openProfile(cid) {
    const [cr, sr, pr] = await Promise.all([
      supabase.from('customers').select('*').eq('id',cid).single(),
      supabase.from('service_calls').select('*, app_users(name)').eq('customer_id',cid).order('call_datetime',{ascending:false}),
      supabase.from('purifiers').select('*').eq('customer_id',cid),
    ])
    const purifs = pr.data || []
    purifs.forEach(p => {
      const idToMatch = p.model
      const model = purifierModels.find(m => m.id === idToMatch)
      p.model_name = model ? model.name : (p.model || 'Unknown')
    })
    setProfile({ cust: cr.data, svcs: sr.data||[], purifs })
  }

  async function addCustomer() {
    if (!form.name || !form.mobile) return
    await supabase.from('customers').insert({ ...form, business_type: activeTab, source: form.source || 'offline', status:'pending' })
    await supabase.from('update_log').insert({
      by_user_id: user.id, by_name: user.name, by_role: user.role,
      category: 'customer', description: `New ${activeTab.toUpperCase()} customer added: ${form.name}`
    })
    setAddModal(false)
    setForm({ name:'', mobile:'', address:'', area:'', business_type:activeTab, since: new Date().toISOString().split('T')[0] })
    load()
  }

  async function editCustomer() {
    if (!editModal || !editModal.name || !editModal.mobile) return
    const { id, ...updates } = editModal
    await supabase.from('customers').update(updates).eq('id', id)
    await supabase.from('update_log').insert({
      by_user_id: user.id, by_name: user.name, by_role: user.role,
      category: 'customer', description: `Customer updated: ${editModal.name}`
    })
    setEditModal(null)
    load()
  }

  async function deleteCustomer(id, name) {
    if (!confirm(`Delete customer "${name}"? This will also delete all their purifiers and service calls.`)) return
    await supabase.from('customers').delete().eq('id', id)
    await supabase.from('update_log').insert({
      by_user_id: user.id, by_name: user.name, by_role: user.role,
      category: 'customer', description: `Customer deleted: ${name}`
    })
    load()
  }

  // Change customer status (pending / completed / rejected)
  async function saveStatus() {
    if (!statusModal) return
    await supabase.from('customers').update({
      status:              statusModal.status,
      status_changed_at:   new Date().toISOString(),
      status_changed_by:   user.id,
      status_note:         statusModal.note || '',
    }).eq('id', statusModal.id)
    setStatusModal(null)
    load()
    if (profile?.cust?.id === statusModal.id) await openProfile(statusModal.id)
  }

  // Edit payment on a service call
  async function savePayment() {
    if (!payModal) return
    const rcvd    = Number(payModal.received_amount)||0
    const pending = Math.max(0, payModal.total_amount - rcvd)
    await supabase.from('service_calls').update({
      received_amount: rcvd,
      pending_amount:  pending,
      payment_mode:    payModal.payment_mode,
      admin_note:      payModal.admin_note,
      status:          pending===0?'complete':'pending',
      completed_at:    pending===0?new Date().toISOString():null,
      completed_by_name: pending===0?user.name:null,
    }).eq('id', payModal.id)
    setPayModal(null)
    if (profile) await openProfile(profile.cust.id)
    load()
  }

  async function markFullyPaid(svcId, totalAmount, custId) {
    await supabase.from('service_calls').update({
      received_amount: totalAmount, pending_amount: 0, status:'complete',
      completed_at: new Date().toISOString(), completed_by_name: user.name,
    }).eq('id', svcId)
    if (custId) await openProfile(custId)
    load()
  }

  // Purifier management
  async function savePurifier() {
    if (!purifierModal || !profile) return
    if (!purifierModal.purifier_model_id || !purifierModal.serial_no) {
      alert('Model and serial number required'); return
    }
    if (purifierModal.id) {
      // Update existing
      await supabase.from('purifiers').update({
        model: purifierModal.purifier_model_id,
        serial_no: purifierModal.serial_no,
        installed_date: purifierModal.installed_date,
        interval_days: purifierModal.interval_days,
        total_services: purifierModal.total_services,
        status: purifierModal.status,
        image_url: purifierModal.image_url,
      }).eq('id', purifierModal.id)
      await supabase.from('update_log').insert({
        by_user_id: user.id, by_name: user.name, by_role: user.role,
        category: 'customer', description: `Updated purifier ${purifierModal.model} (${purifierModal.serial_no}) for ${profile.cust.name}`
      })
    } else {
      // Create new
      const uid = user.id || 'anon'
      const { error } = await supabase.from('purifiers').insert({
        customer_id: profile.cust.id,
        model: purifierModal.purifier_model_id,
        serial_no: purifierModal.serial_no,
        installed_date: purifierModal.installed_date,
        interval_days: purifierModal.interval_days,
        total_services: purifierModal.total_services,
        done_count: 0,
        last_service_date: purifierModal.installed_date,
        status: purifierModal.status,
        image_url: purifierModal.image_url,
        created_by: uid,
      })
      if (!error) {
        await supabase.from('update_log').insert({
          by_user_id: user.id, by_name: user.name, by_role: user.role,
          category: 'customer', description: `New purifier added: ${purifierModal.model} (${purifierModal.serial_no}) for ${profile.cust.name}`
        })
      }
    }
    setPurifierModal(null)
    await openProfile(profile.cust.id)
  }

  async function deletePurifier(pid) {
    if (!confirm('Delete this purifier?')) return
    if (!profile) return
    await supabase.from('purifiers').delete().eq('id', pid)
    await supabase.from('update_log').insert({
      by_user_id: user.id, by_name: user.name, by_role: user.role,
      category: 'customer', description: `Deleted purifier from ${profile.cust.name}`
    })
    await openProfile(profile.cust.id)
  }

  const filtered = customers
    .filter(c => filterStatus==='all' ? true : c.status===filterStatus)
    .filter(c => filterSource==='all' ? true : c.source===filterSource)
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search))

  // Stats
  const counts = {
    pending: customers.filter(c=>c.status==='pending').length,
    completed: customers.filter(c=>c.status==='completed').length,
    rejected: customers.filter(c=>c.status==='rejected').length,
    online: customers.filter(c=>c.source==='online').length,
    offline: customers.filter(c=>c.source==='offline').length,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="page-title mb-0">Customers</h1>
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('b2c')}
              className={`px-4 py-2 rounded-md font-medium transition ${
                activeTab === 'b2c'
                  ? 'bg-brand text-white'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              B2C
            </button>
            <button
              onClick={() => setActiveTab('b2b')}
              className={`px-4 py-2 rounded-md font-medium transition ${
                activeTab === 'b2b'
                  ? 'bg-brand text-white'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              B2B
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <input className="input w-44" placeholder="Search name / mobile..." value={search} onChange={e=>setSearch(e.target.value)} />
          {canEdit && <button className="btn-primary btn-sm rounded-lg" onClick={()=>{setForm({...form, business_type:activeTab}); setAddModal(true)}}>+ Add customer</button>}
        </div>
      </div>

      {/* Status + Source filter + counts */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key:'all',       label:`All (${customers.length})` },
          { key:'pending',   label:`Pending (${counts.pending})`,   cls:'text-amber-700 border-amber-200 bg-amber-50' },
          { key:'completed', label:`Completed (${counts.completed})`, cls:'text-green-700 border-green-200 bg-green-50' },
          { key:'rejected',  label:`Rejected (${counts.rejected})`,  cls:'text-red-700 border-red-200 bg-red-50' },
        ].map(tab=>(
          <button key={tab.key} onClick={()=>setFilter(tab.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
              ${filterStatus===tab.key ? (tab.cls||'bg-brand text-white border-brand') : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key:'all', label:`All (${customers.length})` },
          { key:'online', label:`Online (${counts.online})`, cls:'text-blue-700 border-blue-200 bg-blue-50' },
          { key:'offline', label:`Offline (${counts.offline})`, cls:'text-gray-700 border-gray-200 bg-gray-50' },
        ].map(tab=>(
          <button key={tab.key} onClick={()=>setFilterSource(tab.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
              ${filterSource===tab.key ? (tab.cls||'bg-brand text-white border-brand') : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr>
            <th className="th">Name</th><th className="th">Mobile</th><th className="th">Area</th><th className="th">Address</th><th className="th">Source</th>
            <th className="th">Purifiers</th><th className="th">Last service</th>
            <th className="th">Pending ₹</th><th className="th">Status</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {filtered.map(c=>{
              const pend   = (c.service_calls||[]).reduce((a,b)=>a+Number(b.pending_amount),0)
              const sorted = (c.service_calls||[]).sort((a,b)=>new Date(b.call_datetime)-new Date(a.call_datetime))
              const lastSvc = sorted[0] ? fmt12(sorted[0].call_datetime) : '—'
              return(
                <tr key={c.id} className={`hover:bg-gray-50 ${c.status==='rejected'?'opacity-60':''}`}>
                  <td className="td">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-gray-400">Since {c.since}</div>
                  </td>
                  <td className="td">{c.mobile}</td>
                  <td className="td">{c.area}</td>
                  <td className="td">{c.address}</td>
                  <td className="td"><span className={`badge ${SOURCE_COLORS[c.source]||'badge-gray'}`}>{SOURCE_LABELS[c.source]||'Unknown'}</span></td>
                  <td className="td">{c.purifier_model_name ? <span className="badge badge-blue">{c.purifier_model_name}</span> : '—'}</td>
                  <td className="td text-gray-400" style={{fontSize:'11px'}}>{lastSvc}</td>
                  <td className="td">
                    {pend>0?<span className="font-medium text-red-500">{fmtM(pend)}</span>:<span className="badge badge-ok">Clear</span>}
                  </td>
                  <td className="td">
                    <div>
                      <span className={`badge ${STATUS_COLORS[c.status]||'badge-gray'}`}>{STATUS_LABELS[c.status]||c.status}</span>
                      {c.status_changed_at && <div className="text-gray-400 mt-0.5" style={{fontSize:'10px'}}>{fmt12(c.status_changed_at)}</div>}
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex gap-1 flex-wrap">
                      <button className="text-blue-500 hover:underline text-xs" onClick={()=>openProfile(c.id)}>History</button>
                      {canEdit && (
                        <>
                          <button className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
                            onClick={()=>setStatusModal({id:c.id,status:c.status,note:'',name:c.name})}>
                            Status
                          </button>
                          <button className="text-xs text-green-600 hover:underline"
                            onClick={()=>setEditModal({...c})}>
                            Edit
                          </button>
                          <button className="text-xs text-red-500 hover:underline"
                            onClick={()=>deleteCustomer(c.id, c.name)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length===0&&<p className="text-xs text-gray-400 text-center py-6">No customers found</p>}
      </div>

      {/* Add customer modal */}
      {addModal&&(
        <Modal title={`Add ${activeTab.toUpperCase()} customer`} onClose={()=>setAddModal(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label className="label">Mobile</label><input className="input" value={form.mobile} onChange={e=>setForm(f=>({...f,mobile:e.target.value}))}/></div>
            <div><label className="label">Area</label><input className="input" value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))}/></div>
            <div><label className="label">Source</label>
              <select className="input" value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))}>
                <option value="offline">Offline</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div><label className="label">Customer since</label><input type="date" className="input" value={form.since} onChange={e=>setForm(f=>({...f,since:e.target.value}))}/></div>
            <div className="col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
            <div className="col-span-2">
              <label className="label">Business Type</label>
              <div className="flex gap-2">
                <button onClick={()=>setForm(f=>({...f,business_type:'b2c'}))} className={`px-4 py-2 rounded-lg border text-sm ${form.business_type==='b2c'?'bg-brand text-white border-brand':'bg-white text-gray-600 border-gray-200'}`}>B2C</button>
                <button onClick={()=>setForm(f=>({...f,business_type:'b2b'}))} className={`px-4 py-2 rounded-lg border text-sm ${form.business_type==='b2b'?'bg-brand text-white border-brand':'bg-white text-gray-600 border-gray-200'}`}>B2B</button>
              </div>
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setAddModal(false)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={addCustomer}>Save</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Edit customer modal */}
      {editModal&&(
        <Modal title={`Edit customer: ${editModal.name}`} onClose={()=>setEditModal(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Name</label><input className="input" value={editModal.name} onChange={e=>setEditModal(m=>({...m,name:e.target.value}))}/></div>
            <div><label className="label">Mobile</label><input className="input" value={editModal.mobile} onChange={e=>setEditModal(m=>({...m,mobile:e.target.value}))}/></div>
            <div><label className="label">Area</label><input className="input" value={editModal.area} onChange={e=>setEditModal(m=>({...m,area:e.target.value}))}/></div>
            <div><label className="label">Source</label>
              <select className="input" value={editModal.source||'offline'} onChange={e=>setEditModal(m=>({...m,source:e.target.value}))}>
                <option value="offline">Offline</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div><label className="label">Customer since</label><input type="date" className="input" value={editModal.since} onChange={e=>setEditModal(m=>({...m,since:e.target.value}))}/></div>
            <div className="col-span-2"><label className="label">Address</label><input className="input" value={editModal.address||''} onChange={e=>setEditModal(m=>({...m,address:e.target.value}))}/></div>
            <div className="col-span-2">
              <label className="label">Business Type</label>
              <div className="flex gap-2">
                <button onClick={()=>setEditModal(m=>({...m,business_type:'b2c'}))} className={`px-4 py-2 rounded-lg border text-sm ${editModal.business_type==='b2c'?'bg-brand text-white border-brand':'bg-white text-gray-600 border-gray-200'}`}>B2C</button>
                <button onClick={()=>setEditModal(m=>({...m,business_type:'b2b'}))} className={`px-4 py-2 rounded-lg border text-sm ${editModal.business_type==='b2b'?'bg-brand text-white border-brand':'bg-white text-gray-600 border-gray-200'}`}>B2B</button>
              </div>
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setEditModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={editCustomer}>Update</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Status change modal */}
      {statusModal&&(
        <Modal title={`Change status: ${statusModal.name}`} onClose={()=>setStatusModal(null)} size="sm">
          <div className="space-y-3">
            <div>
              <label className="label">New status</label>
              <div className="grid grid-cols-3 gap-2">
                {['pending','completed','rejected'].map(s=>(
                  <button key={s} onClick={()=>setStatusModal(m=>({...m,status:s}))}
                    className={`text-xs py-2 rounded-lg border font-medium transition-colors
                      ${statusModal.status===s
                        ? s==='completed'?'bg-green-500 text-white border-green-500':s==='rejected'?'bg-red-500 text-white border-red-500':'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Note (optional)</label>
              <input className="input" placeholder="Reason for status change..." value={statusModal.note} onChange={e=>setStatusModal(m=>({...m,note:e.target.value}))}/>
            </div>
            <div className="bg-gray-50 rounded p-2 text-xs text-gray-500">
              Change will be saved with your name and current date &amp; time: <strong>{fmt12(new Date().toISOString())}</strong>
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setStatusModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={saveStatus}>Save</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Edit payment modal */}
      {payModal&&(
        <Modal title="Edit payment" onClose={()=>setPayModal(null)}>
          <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs space-y-0.5">
            <div><span className="text-gray-400">Date:</span> {fmt12(payModal.call_datetime)}</div>
            <div><span className="text-gray-400">Total:</span> <strong>{fmtM(payModal.total_amount)}</strong></div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Amount received ₹</label>
              <input type="number" className="input" value={payModal.received_amount} onChange={e=>setPayModal(m=>({...m,received_amount:e.target.value}))}/>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs flex gap-5">
              <span>Total: <strong>{fmtM(payModal.total_amount)}</strong></span>
              <span>Received: <strong className="text-green-700">{fmtM(Number(payModal.received_amount)||0)}</strong></span>
              <span>Remaining: <strong className={Math.max(0,payModal.total_amount-(Number(payModal.received_amount)||0))>0?'text-red-500':'text-green-700'}>
                {fmtM(Math.max(0,payModal.total_amount-(Number(payModal.received_amount)||0)))}
              </strong></span>
            </div>
            <div>
              <label className="label">Payment mode</label>
              <select className="input" value={payModal.payment_mode} onChange={e=>setPayModal(m=>({...m,payment_mode:e.target.value}))}>
                <option>CASH</option><option>ONLINE</option><option>CHEQUE</option>
              </select>
            </div>
            {canSeeNotes&&(
              <div>
                <label className="label">Admin note</label>
                <textarea className="input resize-none" rows={2} value={payModal.admin_note} onChange={e=>setPayModal(m=>({...m,admin_note:e.target.value}))}/>
              </div>
            )}
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setPayModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={savePayment}>Save</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Full profile modal */}
      {profile&&(
        <Modal title={`${profile.cust?.name} — Full Profile`} onClose={()=>setProfile(null)} size="lg">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              {label:'Total spent',value:fmtM(profile.svcs.reduce((a,b)=>a+Number(b.total_amount||0),0)),color:'text-blue-600',bg:'bg-blue-50'},
              {label:'Service calls',value:profile.svcs.length,color:'text-gray-800',bg:'bg-gray-50'},
              {label:'Pending',value:fmtM(profile.svcs.reduce((a,b)=>a+Number(b.pending_amount||0),0)),color:profile.svcs.reduce((a,b)=>a+Number(b.pending_amount||0),0)>0?'text-red-500':'text-green-700',bg:profile.svcs.reduce((a,b)=>a+Number(b.pending_amount||0),0)>0?'bg-red-50':'bg-gray-50'},
            ].map(m=>(
              <div key={m.label} className={`${m.bg} rounded-lg p-3 text-center`}>
                <div className="text-xs text-gray-500 mb-1">{m.label}</div>
                <div className={`text-lg font-medium ${m.color}`}>{m.value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-3">
            <p className="text-xs text-gray-500 flex-1">{profile.cust?.address} · {profile.cust?.area} · {profile.cust?.mobile} · Since {profile.cust?.since}</p>
            <div>
              <span className={`badge ${STATUS_COLORS[profile.cust?.status]||'badge-gray'}`}>{STATUS_LABELS[profile.cust?.status]}</span>
              {profile.cust?.status_changed_at && <div className="text-gray-400 mt-0.5" style={{fontSize:'10px'}}>{fmt12(profile.cust.status_changed_at)}</div>}
            </div>
            {canEdit&&(
              <button className="btn btn-sm" onClick={()=>setStatusModal({id:profile.cust.id,status:profile.cust.status,note:'',name:profile.cust.name})}>
                Change status
              </button>
            )}
          </div>

          {profile.purifs.length>0&&(
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="section-title mb-0">Purifiers ({profile.purifs.length})</div>
                {canEdit && <button className="btn btn-sm text-xs" onClick={()=>setPurifierModal({purifier_model_id:'',model:'',serial_no:'',installed_date:new Date().toISOString().split('T')[0],interval_days:90,total_services:4,status:'active',image_url:''})}>+ Add purifier</button>}
              </div>
              {profile.purifs.map(p=>{
                const nd=new Date(p.last_service_date);nd.setDate(nd.getDate()+p.interval_days)
                const left=p.total_services-p.done_count
                return(
                  <div key={p.id} className="bg-gray-50 rounded-lg p-3 mb-2 cursor-pointer hover:bg-gray-100 transition"
                    onClick={canEdit?()=>setPurifierModal({id:p.id,purifier_model_id:p.model,model:p.model_name,serial_no:p.serial_no,installed_date:p.installed_date,interval_days:p.interval_days,total_services:p.total_services,status:p.status,image_url:p.image_url}):undefined}>
                    <div className="text-xs font-medium">{p.model_name} <span className="text-gray-400 font-normal">#{p.serial_no}</span></div>
                    {p.image_url&&<img src={p.image_url} alt={p.model_name} className="w-full h-24 object-cover rounded mb-2"/>}
                    <div className="text-xs text-gray-500 mb-1">Installed: {p.installed_date} · Next due: {fmtD(nd)}</div>
                    <div className="text-xs mb-2">{p.done_count} done · <span className="text-blue-600 font-medium">{left} left</span></div>
                    <div className="flex gap-1">
                      {Array.from({length:p.total_services}).map((_,i)=>(
                        <div key={i} className={`w-2.5 h-2.5 rounded-full ${i<p.done_count?'bg-green-600':'bg-blue-100 border border-blue-300'}`}></div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
          {profile.purifs.length===0&&canEdit&&(
            <div className="flex items-center justify-between mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span className="text-xs text-blue-700">No purifiers added yet</span>
              <button className="btn btn-sm text-xs" onClick={()=>setPurifierModal({purifier_model_id:'',model:'',serial_no:'',installed_date:new Date().toISOString().split('T')[0],interval_days:90,total_services:4,status:'active',image_url:''})}>+ Add purifier</button>
            </div>
          )}

          <div className="section-title">Service timeline ({profile.svcs.length})</div>
          <div className="pl-4 border-l-2 border-blue-100 space-y-3">
            {profile.svcs.length===0&&<p className="text-xs text-gray-400">No service history yet</p>}
            {profile.svcs.map(s=>{
              const isPending = Number(s.pending_amount)>0
              return(
                <div key={s.id} className="relative">
                  <div className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${s.status==='complete'?'bg-brand':'bg-amber-400'}`}/>
                  <div className="text-xs text-gray-400">{fmt12(s.call_datetime)} · {s.app_users?.name}</div>
                  <div className="text-xs font-medium">
                    {s.spares_replaced||'Service'} → <span className="text-blue-600">{fmtM(s.total_amount)}</span>
                    {isPending&&<span className="text-red-500"> ({fmtM(s.pending_amount)} pending)</span>}
                    {s.status==='complete'&&s.completed_at&&<span className="text-green-600 ml-1 font-normal">✓ paid {fmt12(s.completed_at)}</span>}
                  </div>
                  {s.admin_note&&canSeeNotes&&<div className="mt-1 text-xs bg-amber-50 border-l-2 border-amber-400 px-2 py-1 text-gray-600">{s.admin_note}</div>}
                  {canEdit&&isPending&&(
                    <div className="flex gap-2 mt-1">
                      <button className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5 hover:bg-green-100"
                        onClick={()=>markFullyPaid(s.id,Number(s.total_amount),profile.cust.id)}>
                        Mark fully paid
                      </button>
                      <button className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-100"
                        onClick={()=>setPayModal({id:s.id,total_amount:Number(s.total_amount),received_amount:Number(s.received_amount),pending_amount:Number(s.pending_amount),payment_mode:s.payment_mode||'CASH',admin_note:s.admin_note||'',call_datetime:s.call_datetime})}>
                        Edit payment
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <ModalFooter><button className="btn" onClick={()=>setProfile(null)}>Close</button></ModalFooter>
        </Modal>
      )}

      {/* Purifier add/edit modal */}
      {purifierModal&&(
        <Modal title={purifierModal.id?'Edit Purifier':'Add Purifier'} onClose={()=>setPurifierModal(null)} size="md">
          <div className="space-y-3">
            <div>
              <label className="label">Model</label>
              <select className="input" value={purifierModal.purifier_model_id} onChange={e=>setPurifierModal(m=>({...m,purifier_model_id:e.target.value}))}>
                <option value="">Select Model</option>
                {purifierModels.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Serial number</label>
              <input type="text" className="input" placeholder="e.g., SN-12345" value={purifierModal.serial_no} onChange={e=>setPurifierModal(m=>({...m,serial_no:e.target.value}))}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Installed date</label>
                <input type="date" className="input" value={purifierModal.installed_date} onChange={e=>setPurifierModal(m=>({...m,installed_date:e.target.value}))}/>
              </div>
              <div>
                <label className="label">Service interval (days)</label>
                <input type="number" className="input" placeholder="90" value={purifierModal.interval_days} onChange={e=>setPurifierModal(m=>({...m,interval_days:parseInt(e.target.value)}))}/>
              </div>
            </div>
            <div>
              <label className="label">Total services</label>
              <input type="number" className="input" placeholder="4" value={purifierModal.total_services} onChange={e=>setPurifierModal(m=>({...m,total_services:parseInt(e.target.value)}))}/>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={purifierModal.status} onChange={e=>setPurifierModal(m=>({...m,status:e.target.value}))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="servicing">Servicing</option>
              </select>
            </div>
            <div>
              <label className="label">Image URL (optional)</label>
              <input type="url" className="input" placeholder="https://..." value={purifierModal.image_url||''} onChange={e=>setPurifierModal(m=>({...m,image_url:e.target.value}))}/>
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setPurifierModal(null)}>Cancel</button>
            { purifierModal.id&&<button className="btn btn-danger" onClick={()=>deletePurifier(purifierModal.id)}>Delete</button>}
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={savePurifier}>Save</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}