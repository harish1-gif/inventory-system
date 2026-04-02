import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { fmtM, fmt12 } from '../lib/utils'
import { useNavigate } from 'react-router-dom'

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
  const isTech = user.role === 'technician'
  const isMgr  = user.role === 'manager'

  useEffect(() => { loadAll() }, [user])

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

    if (isTech) {
      const [bag, job] = await Promise.all([
        supabase.from('bag_stock').select('remaining_qty').eq('technician_id',user.id).gt('remaining_qty',0),
        supabase.from('jobs').select('*').eq('assigned_to',user.id).eq('status','active').single(),
      ])
      const bagItems = bag.data||[]
      setMyBag({ items: bagItems.length, total: bagItems.reduce((a,b)=>a+b.remaining_qty,0) })
      if (job.data) setJob(job.data)
    }
    const { count } = await supabase.from('jobs').select('*',{count:'exact',head:true}).eq('status','pending')
    setPending(count||0)
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
          <div className="text-sm text-amber-800">
            <span className="font-medium">{pendingJobs} job{pendingJobs>1?'s':''} pending</span> — waiting to be accepted by technicians
          </div>
          <button className="btn btn-sm border-amber-300 text-amber-700" onClick={()=>navigate('/jobs')}>View jobs</button>
        </div>
      )}

      {/* Low stock alert */}
      {!isTech && (b2cStats.out>0||b2bStats.out>0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-3 flex items-center justify-between">
          <div className="text-sm text-red-700">
            <span className="font-medium">{b2cStats.out + b2bStats.out} item{(b2cStats.out+b2bStats.out)>1?'s':''} out of stock</span> — requires restocking
          </div>
          <button className="btn btn-sm border-red-300 text-red-600" onClick={()=>navigate('/inventory')}>View inventory</button>
        </div>
      )}
    </div>
  )
}
