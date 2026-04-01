import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt12 } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function JobHistory() {
  const [jobs, setJobs] = useState([])
  const [zones, setZones] = useState([])
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [detailModal, setDetail] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const { data } = await supabase
      .from('jobs')
      .select('*,zones(name,color)')
      .eq('status', 'completed')
      .not('end_time', 'is', null)
      .lt('end_time', sevenDaysAgo.toISOString())
      .order('end_time', { ascending: false })
    setJobs(data || [])

    const { data: z } = await supabase.from('zones').select('*')
    setZones(z || [])

    const { data: c } = await supabase.from('customers').select('name,mobile')
    setCustomers(c || [])
  }

  const filteredJobs = jobs.filter(j => 
    !search || 
    j.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    j.customer_location?.toLowerCase().includes(search.toLowerCase()) ||
    j.assigned_to_name?.toLowerCase().includes(search.toLowerCase()) ||
    customers.find(c=>c.name===j.customer_name)?.mobile?.toLowerCase().includes(search.toLowerCase())
  ).filter(j => {
    if (!selectedMonth) return true
    const jobDate = new Date(j.end_time)
    const jobMonth = `${jobDate.getFullYear()}-${String(jobDate.getMonth() + 1).padStart(2, '0')}`
    return jobMonth === selectedMonth
  })

  // Generate month options from available jobs
  const monthOptions = Array.from(new Set(
    jobs.map(j => {
      const date = new Date(j.end_time)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    })
  )).sort().reverse().map(month => {
    const [year, monthNum] = month.split('-')
    const date = new Date(year, monthNum - 1)
    return {
      value: month,
      label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    }
  })

  const statusColor = { pending:'badge-warn', active:'badge-blue', extra_hrs_requested:'badge-purple',
    completed:'badge-ok', flagged:'badge-danger' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Job Completed History</h1>
        <div className="flex gap-2 items-center">
          <input 
            type="text" 
            placeholder="Search jobs..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            className="input w-64" 
          />
          <select 
            className="input w-40 text-xs" 
            value={selectedMonth} 
            onChange={e=>setSelectedMonth(e.target.value)}
          >
            <option value="">All months</option>
            {monthOptions.map(month => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr>
            <th className="th">Customer</th><th className="th">Mobile</th><th className="th">Zone</th><th className="th">Technician</th>
            <th className="th">Service type</th><th className="th">Hours</th>
            <th className="th">Completed</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {filteredJobs.map(j=>(
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
                <td className="td text-gray-400">{fmt12(j.end_time)}</td>
                <td className="td"><span className="text-blue-500 hover:underline text-xs">Details</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredJobs.length===0 && <p className="text-xs text-gray-400 text-center py-8">No completed jobs older than 7 days{(search || selectedMonth) ? ' matching filters' : ''}</p>}
      </div>

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