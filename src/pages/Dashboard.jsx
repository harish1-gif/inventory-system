import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { fmtM, fmt12, fmtD } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import Modal, { ModalFooter } from '../components/Modal'

export default function Dashboard() {
  const { user }           = useAuth()
  const { business }       = useBusiness()
  const navigate            = useNavigate()
  const [b2cStats, setB2c] = useState({ total:0, low:0, out:0, value:0 })
  const [b2bStats, setB2b] = useState({ total:0, low:0, out:0, value:0 })
  const [targets, setTgts] = useState({ b2c:1500000, b2b:3500000 })
  const [myBag, setMyBag]  = useState({ items:0, total:0 })
  const [activeJob, setJob]= useState(null)
  const [pendingJobs, setPending] = useState(0)
  const [pendingJobsList, setPendingJobsList] = useState([])
  const [pendingCustomers, setPendingCustomers] = useState([])
  const [totalPendingAmount, setTotalPendingAmount] = useState(0)
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [showJobsModal, setShowJobsModal] = useState(false)
  const [outOfStockItems, setOutOfStockItems] = useState([])
  const isTech = user.role === 'technician'
  const isMgr  = user.role === 'manager'

  useEffect(() => { loadAll() }, [user])

  async function loadPendingCustomers() {
    // Get all service calls with pending amounts
    const { data: serviceCalls } = await supabase
      .from('service_calls')
      .select('id, customer_id, pending_amount, call_datetime, total_amount')
      .gt('pending_amount', 0)
      .order('call_datetime', { ascending: true })

    if (!serviceCalls || serviceCalls.length === 0) {
      setPendingCustomers([])
      setTotalPendingAmount(0)
      return
    }

    // Get customer details
    const customerIds = [...new Set(serviceCalls.map(sc => sc.customer_id))]
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, mobile, area')
      .in('id', customerIds)

    const customerMap = {}
    ;(customers || []).forEach(c => {
      customerMap[c.id] = c
    })

    // Aggregate pending amounts by customer
    const customerPendingMap = {}
    ;(serviceCalls || []).forEach(sc => {
      if (!customerPendingMap[sc.customer_id]) {
        customerPendingMap[sc.customer_id] = {
          pending_amount: 0,
          oldest_date: sc.call_datetime,
          last_date: sc.call_datetime,
          call_count: 0
        }
      }
      customerPendingMap[sc.customer_id].pending_amount += Number(sc.pending_amount || 0)
      customerPendingMap[sc.customer_id].call_count += 1
      // Keep oldest date
      if (new Date(sc.call_datetime) < new Date(customerPendingMap[sc.customer_id].oldest_date)) {
        customerPendingMap[sc.customer_id].oldest_date = sc.call_datetime
      }
    })

    // Build final list with customer details
    const pendingList = Object.entries(customerPendingMap)
      .map(([custId, data]) => ({
        ...customerMap[custId],
        id: custId,
        pending_amount: data.pending_amount,
        oldest_date: data.oldest_date,
        days_pending: Math.floor((new Date() - new Date(data.oldest_date)) / (1000 * 60 * 60 * 24)),
        call_count: data.call_count
      }))
      .sort((a, b) => {
        // First sort by days pending (descending - oldest first)
        if (b.days_pending !== a.days_pending) return b.days_pending - a.days_pending
        // Then by pending amount (ascending - lowest first)
        return a.pending_amount - b.pending_amount
      })

    const total = pendingList.reduce((sum, c) => sum + c.pending_amount, 0)
    setPendingCustomers(pendingList)
    setTotalPendingAmount(total)
  }

  async function loadAll() {
    const [s2c, s2b, tgts] = await Promise.all([
      supabase.from('stock').select('qty,min_qty,selling_price').eq('business','b2c'),
      supabase.from('stock').select('qty,min_qty,selling_price').eq('business','b2b'),
      supabase.from('app_settings').select('key,value').in('key',['b2c_monthly_target','b2b_monthly_target']),
    ])
    const calc = arr => {
      const items = arr.data || []
      return {
        total: items.length,
        low:   items.filter(s=>s.qty>0&&s.qty<=s.min_qty).length,
        out:   items.filter(s=>s.qty===0).length,
        value: items.reduce((a,s)=>a+s.qty*s.selling_price,0),
      }
    }
    setB2c(calc(s2c)); setB2b(calc(s2b))
    const tgtMap = {}
    ;(tgts.data||[]).forEach(r=>{ tgtMap[r.key]=Number(r.value) })
    setTgts({ b2c: tgtMap['b2c_monthly_target']||1500000, b2b: tgtMap['b2b_monthly_target']||3500000 })

    // Fetch out of stock items details
    const { data: outStockB2c } = await supabase.from('stock').select('product_name,qty').eq('business','b2c').eq('qty',0)
    const { data: outStockB2b } = await supabase.from('stock').select('product_name,qty').eq('business','b2b').eq('qty',0)
    const allOutStock = [...(outStockB2c || []), ...(outStockB2b || [])]
    setOutOfStockItems(allOutStock)

    // Fetch pending jobs details
    const { data: pendingJobsData } = await supabase
      .from('jobs')
      .select('id, customer_name, service_type, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setPendingJobsList(pendingJobsData || [])
    setPending(pendingJobsData?.length || 0)

    await loadPendingCustomers()

    if (isTech) {
      const [bag, job] = await Promise.all([
        supabase.from('bag_stock').select('remaining_qty').eq('technician_id',user.id).gt('remaining_qty',0),
        supabase.from('jobs').select('*').eq('assigned_to',user.id).eq('status','active').single(),
      ])
      const bagItems = bag.data||[]
      setMyBag({ items: bagItems.length, total: bagItems.reduce((a,b)=>a+b.remaining_qty,0) })
      if (job.data) setJob(job.data)
    }
  }

  const StatCard = ({ title, stats, target, color, business: biz }) => {
    const pct = Math.min(100, Math.round((stats.value/target)*100))
    const barCol = pct>=100?'#3B6D11':pct>=60?'#185FA5':'#E24B4A'
    return (
      <div className={`card border-l-4 ${biz==='b2c'?'border-blue-400':'border-emerald-400'}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className={`badge ${biz==='b2c'?'badge-b2c':'badge-b2b'} mr-2`}>{biz.toUpperCase()}</span>
            <span className="font-medium text-sm">{title}</span>
          </div>
          <button className={`text-xs ${biz==='b2c'?'text-blue-500':'text-emerald-600'} hover:underline`}
            onClick={()=>navigate('/inventory')}>View →</button>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-medium text-gray-800">{stats.total}</div>
            <div className="text-xs text-gray-400">Total items</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-2 text-center">
            <div className="text-lg font-medium text-amber-700">{stats.low}</div>
            <div className="text-xs text-gray-400">Low stock</div>
          </div>
          <div className="bg-red-50 rounded-lg p-2 text-center">
            <div className="text-lg font-medium text-red-600">{stats.out}</div>
            <div className="text-xs text-gray-400">Out of stock</div>
          </div>
        </div>
        {isMgr && (
          <>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">Stock value</span>
              <span className="font-medium">{fmtM(stats.value)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-2 rounded-full transition-all" style={{width:pct+'%',background:barCol}}/>
              </div>
              <span className="text-xs text-gray-500">{pct}% of {fmtM(target)} target</span>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Dashboard</h1>
        <div className="text-xs text-gray-500">Welcome, {user.name} · <span className={`badge role-${user.role}`}>{user.role}</span></div>
      </div>

      {/* Technician view */}
      {isTech && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card border-l-4 border-amber-400">
            <div className="section-title">My bag stock</div>
            <div className="text-2xl font-medium text-amber-700">{myBag.total}</div>
            <div className="text-xs text-gray-400">{myBag.items} item types</div>
            <button className="mt-2 text-xs text-amber-600 hover:underline" onClick={()=>navigate('/bagstock')}>View bag →</button>
          </div>
          <div className="card border-l-4 border-green-400">
            <div className="section-title">Active job</div>
            {activeJob ? (
              <>
                <div className="text-sm font-medium">{activeJob.customer_name}</div>
                <div className="text-xs text-gray-500">{activeJob.service_type}</div>
                <div className="text-xs text-green-600 mt-1">Started {fmt12(activeJob.start_time)}</div>
                <button className="mt-2 text-xs text-green-600 hover:underline" onClick={()=>navigate('/tracker')}>View tracker →</button>
              </>
            ) : (
              <div className="text-xs text-gray-400">No active job</div>
            )}
          </div>
        </div>
      )}

      {/* Inventory stat cards */}
      {!isTech && (
        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4 mb-4">
          <StatCard title="B2C Inventory" stats={b2cStats} target={targets.b2c} business="b2c"/>
          <StatCard title="B2B Inventory" stats={b2bStats} target={targets.b2b} business="b2b"/>
        </div>
      )}

      {/* Pending jobs alert */}
      {!isTech && pendingJobs > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-medium text-amber-900">{pendingJobs} job{pendingJobs>1?'s':''} pending</div>
              <div className="text-xs text-amber-700 mt-1">Waiting to be accepted by technicians</div>
            </div>
            <button className="btn btn-sm border-amber-300 text-amber-700" onClick={()=>setShowJobsModal(true)}>View all →</button>
          </div>
          {pendingJobsList.length > 0 && (
            <div className="space-y-2 mb-3 bg-white rounded-lg p-3">
              {pendingJobsList.slice(0, 2).map((job, i) => (
                <div key={i} className="flex items-start justify-between text-xs border-b last:border-b-0 pb-2 last:pb-0">
                  <div>
                    <div className="font-medium text-gray-800">{job.customer_name}</div>
                    <div className="text-gray-500">{job.service_type}</div>
                  </div>
                  <div className="text-gray-400 text-right">{fmt12(job.created_at)}</div>
                </div>
              ))}
              {pendingJobsList.length > 2 && <div className="text-xs text-center text-amber-600 pt-1 font-medium">+{pendingJobsList.length - 2} more</div>}
            </div>
          )}
        </div>
      )}

      {/* Pending customer payments */}
      {!isTech && totalPendingAmount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-stretch justify-between gap-4 mt-3">
          <div className="flex-1">
            <div className="font-medium text-red-900">₹{fmtM(totalPendingAmount)} pending</div>
            <div className="text-xs text-red-700 mt-1">From <span className="font-medium">{pendingCustomers.length} customer{pendingCustomers.length>1?'s':''}</span></div>
            <button className="btn btn-sm border-red-300 text-red-600 mt-2" onClick={()=>setShowPendingModal(true)}>View all →</button>
          </div>
          {pendingCustomers.length > 0 && (
            <div className="w-48 bg-white rounded-lg p-3 text-xs border border-red-100 space-y-1.5">
              <div className="font-medium text-gray-700 mb-2">Top pending</div>
              {pendingCustomers.slice(0, 4).map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">{c.name}</div>
                    <div className="text-gray-500 text-xs">{c.days_pending} days</div>
                  </div>
                  <div className="text-red-600 font-medium">₹{fmtM(c.pending_amount)}</div>
                </div>
              ))}
              {pendingCustomers.length > 4 && <div className="text-xs text-center text-red-600 pt-1 font-medium">+{pendingCustomers.length - 4} more</div>}
            </div>
          )}
        </div>
      )}

      {/* Low stock alert */}
      {!isTech && (b2cStats.out>0||b2bStats.out>0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-medium text-red-900">{b2cStats.out + b2bStats.out} item{(b2cStats.out+b2bStats.out)>1?'s':''} out of stock</div>
              <div className="text-xs text-red-700 mt-1">Requires restocking</div>
            </div>
            <button className="btn btn-sm border-red-300 text-red-600" onClick={()=>navigate('/inventory')}>View inventory →</button>
          </div>
          {outOfStockItems.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-2">
              <div className="text-xs font-medium text-gray-700 mb-2">Out of stock items</div>
              {outOfStockItems.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b last:border-b-0 pb-2 last:pb-0">
                  <div className="font-medium text-gray-800">{item.product_name}</div>
                  <span className="text-red-600 font-medium">0 qty</span>
                </div>
              ))}
              {outOfStockItems.length > 5 && <div className="text-xs text-center text-red-600 pt-1 font-medium">+{outOfStockItems.length - 5} more</div>}
            </div>
          )}
        </div>
      )}

      {/* Pending customers modal */}
      {showPendingModal && (
        <Modal title={`Pending Payments - ₹${fmtM(totalPendingAmount)}`} onClose={()=>setShowPendingModal(false)} size="lg">
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs min-w-max">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Mobile</th>
                  <th className="th">Area</th>
                  <th className="th">Pending ₹</th>
                  <th className="th">Days pending</th>
                  <th className="th">Oldest date</th>
                  <th className="th">Calls</th>
                </tr>
              </thead>
              <tbody>
                {pendingCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate('/customers')}>
                    <td className="td">
                      <div className="font-medium">{c.name}</div>
                    </td>
                    <td className="td">{c.mobile}</td>
                    <td className="td">{c.area}</td>
                    <td className="td">
                      <span className="font-medium text-red-500">{fmtM(c.pending_amount)}</span>
                    </td>
                    <td className="td">
                      <span className={`badge ${c.days_pending > 30 ? 'badge-danger' : c.days_pending > 14 ? 'badge-warn' : 'badge-blue'}`}>
                        {c.days_pending} days
                      </span>
                    </td>
                    <td className="td text-gray-500">{fmt12(c.oldest_date)}</td>
                    <td className="td text-gray-600">{c.call_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingCustomers.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No pending payments</p>}
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setShowPendingModal(false)}>Close</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Pending jobs modal */}
      {showJobsModal && (
        <Modal title={`${pendingJobs} Pending Job${pendingJobs>1?'s':''}`} onClose={()=>setShowJobsModal(false)} size="lg">
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs min-w-max">
              <thead>
                <tr>
                  <th className="th">Customer</th>
                  <th className="th">Service type</th>
                  <th className="th">Created</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {pendingJobsList.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="td">
                      <div className="font-medium">{job.customer_name}</div>
                    </td>
                    <td className="td">{job.service_type}</td>
                    <td className="td text-gray-500">{fmt12(job.created_at)}</td>
                    <td className="td">
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/jobs')}>View →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingJobsList.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No pending jobs</p>}
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setShowJobsModal(false)}>Close</button>
            <button className="btn-primary" onClick={() => navigate('/jobs')}>Go to Jobs →</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
