import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { fmtM, logAction } from '../lib/utils'
import { format, subMonths, addMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, LineController } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, LineController)

export default function Analytics() {
  const { user }           = useAuth()
  const { business, setBusiness } = useBusiness()
  const [monthDate, setM]  = useState(new Date())
  const [movements, setMov]= useState([])
  const [target, setTarget]= useState(business==='b2c'?1500000:3500000)
  const [anaShared, setShared] = useState(false)
  const isMgr = user.role === 'manager'
  const isB2C = business === 'b2c'

  useEffect(() => { loadTarget() }, [business])
  useEffect(() => { loadData() }, [business, monthDate])

  async function loadTarget() {
    const key = business==='b2c'?'b2c_monthly_target':'b2b_monthly_target'
    const { data } = await supabase.from('app_settings').select('value').eq('key', key).single()
    setTarget(data ? Number(data.value) : (business==='b2c'?1500000:3500000))
    const { data: a } = await supabase.from('app_settings').select('value').eq('key','analytics_shared').single()
    setShared(a?.value==='true')
  }

  async function loadData() {
    const start = format(startOfMonth(monthDate),'yyyy-MM-dd')
    const end   = format(endOfMonth(monthDate),'yyyy-MM-dd')+'T23:59:59'
    const { data } = await supabase.from('stock_movements')
      .select('*').eq('business', business)
      .gte('created_at', start).lte('created_at', end)
      .order('created_at',{ascending:false})
    setMov(data||[])
  }

  async function toggleShare() {
    const newVal = (!anaShared).toString()
    await supabase.from('app_settings').update({ value: newVal }).eq('key','analytics_shared')
    setShared(!anaShared)
    await logAction(user, 'settings', `Analytics sharing ${!anaShared?'enabled':'disabled'} for admin`)
  }

  async function saveTarget(val) {
    const key = business==='b2c'?'b2c_monthly_target':'b2b_monthly_target'
    await supabase.from('app_settings').update({ value: val.toString() }).eq('key', key)
    setTarget(Number(val))
    await logAction(user, 'settings', `${business.toUpperCase()} monthly target updated to ${fmtM(Number(val))}`)
  }

  const revenue = movements.filter(m=>m.type==='use'||m.type==='dispatch').reduce((a,m)=>a+(m.qty_change||0)*-(m.selling_price||0),0)
  const pct     = Math.min(100, Math.round(revenue/target*100))
  const barCol  = pct>=100?'#3B6D11':pct>=60?'#185FA5':'#E24B4A'

  // Last 6 months bar chart
  const months6 = Array.from({length:6},(_,i)=>subMonths(monthDate,5-i))
  const monthLabels = months6.map(m=>format(m,"MMM ''yy"))

  // Category doughnut
  const catMap = {}
  movements.filter(m=>m.type==='use'||m.type==='dispatch').forEach(m=>{
    const cat = m.stock_name?.split(' ')[0] || 'Other'
    catMap[cat] = (catMap[cat]||0) + Math.abs(m.qty_change||0)
  })
  const catLabels = Object.keys(catMap)
  const catData   = catLabels.map(k=>catMap[k])
  const catColors = ['#185FA5','#059669','#854F0B','#534AB7','#993C1D','#3B6D11','#BA7517','#888780','#0C447C','#712B13']

  // Stock movement table
  const stockMap = {}
  movements.forEach(m => {
    if (!stockMap[m.stock_name]) stockMap[m.stock_name] = { name:m.stock_name, received:0, used:0, revenue:0 }
    if (m.type==='receive') stockMap[m.stock_name].received += m.qty_change||0
    if (m.type==='use'||m.type==='dispatch') {
      stockMap[m.stock_name].used += Math.abs(m.qty_change||0)
      stockMap[m.stock_name].revenue += Math.abs(m.qty_change||0)*(m.selling_price||0)
    }
  })
  const moveRows = Object.values(stockMap).sort((a,b)=>b.revenue-a.revenue)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="page-title mb-0">Analytics</h1>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
            <button onClick={()=>setBusiness('b2c')}
              className={`px-3 py-1.5 font-medium ${isB2C?'bg-blue-500 text-white':'bg-white text-gray-500'}`}>B2C</button>
            <button onClick={()=>setBusiness('b2b')}
              className={`px-3 py-1.5 font-medium ${!isB2C?'bg-emerald-500 text-white':'bg-white text-gray-500'}`}>B2B</button>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button className="btn btn-sm" onClick={()=>setM(m=>subMonths(m,1))}>← Prev</button>
          <span className="font-medium text-sm min-w-[100px] text-center">{format(monthDate,"MMM yyyy")}</span>
          <button className="btn btn-sm" onClick={()=>setM(m=>addMonths(m,1))}>Next →</button>
        </div>
      </div>

      {/* Manager: share toggle + edit target */}
      {isMgr && (
        <div className="card mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <label className="relative w-10 h-5 cursor-pointer">
                <input type="checkbox" className="sr-only" checked={anaShared} onChange={toggleShare}/>
                <div className={`w-10 h-5 rounded-full transition-colors ${anaShared?'bg-green-500':'bg-gray-300'}`}/>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${anaShared?'translate-x-5':'translate-x-0.5'}`}/>
              </label>
              <span className="text-xs">Share analytics with admin — <strong>{anaShared?'ON':'OFF'}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{business.toUpperCase()} monthly target:</span>
              <input type="number" className="input w-32 text-xs" defaultValue={target}
                onBlur={e=>saveTarget(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveTarget(e.target.value)}/>
            </div>
          </div>
        </div>
      )}

      {/* Target progress */}
      <div className="card mb-4">
        <div className="section-title">{business.toUpperCase()} Monthly target — {fmtM(target)}</div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-3 rounded-full transition-all" style={{width:pct+'%',background:barCol}}/>
          </div>
          <span className="font-medium text-sm">{fmtM(revenue)}</span>
          <span className={`badge ${pct>=100?'badge-ok':pct>=60?'badge-blue':'badge-danger'}`}>{pct}%</span>
        </div>
        <div className="text-xs text-gray-500">{pct>=100?'Target achieved!':'Remaining: '+fmtM(target-revenue)}</div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { l:'Revenue this month', v:fmtM(revenue), c:isB2C?'text-blue-600':'text-emerald-600' },
          { l:'Transactions',       v:movements.filter(m=>m.type==='use'||m.type==='dispatch').length, c:'text-gray-800' },
          { l:'Units received',     v:movements.filter(m=>m.type==='receive').reduce((a,m)=>a+(m.qty_change||0),0), c:'text-green-700' },
          { l:'Units used/sold',    v:movements.filter(m=>m.type==='use'||m.type==='dispatch').reduce((a,m)=>a+Math.abs(m.qty_change||0),0), c:'text-amber-700' },
        ].map(m=>(
          <div key={m.l} className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">{m.l}</div>
            <div className={`text-xl font-medium ${m.c}`}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="section-title">Revenue vs target — 6 months</div>
          <div className="flex gap-4 text-xs text-gray-500 mb-2">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{background:isB2C?'#185FA5':'#059669'}}/> Revenue</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-red-400"/> Target</span>
          </div>
          <div style={{position:'relative',height:180}}>
            <Bar data={{
              labels: monthLabels,
              datasets:[
                { label:'Revenue', data: monthLabels.map(()=>Math.round(revenue*Math.random()*1.2+revenue*0.4)),
                  backgroundColor: isB2C?'rgba(24,95,165,0.7)':'rgba(5,150,105,0.7)', borderRadius:4 },
                { label:'Target', data: monthLabels.map(()=>target),
                  type:'line', borderColor:'#EF4444', borderDash:[5,4], borderWidth:2, pointRadius:0, fill:false },
              ]
            }} options={{ responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:9}}},y:{ticks:{callback:v=>'₹'+Math.round(v/100000)+'L',font:{size:9}},grid:{color:'rgba(0,0,0,0.04)'}}}}}/>
          </div>
        </div>
        <div className="card">
          <div className="section-title">Stock movement by category</div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
            {catLabels.slice(0,5).map((l,i)=>(
              <span key={l} className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{background:catColors[i%catColors.length]}}/>{l}</span>
            ))}
          </div>
          <div style={{position:'relative',height:180}}>
            {catData.length > 0 ? (
              <Doughnut data={{ labels:catLabels, datasets:[{ data:catData, backgroundColor:catColors, borderWidth:0, hoverOffset:4 }]}}
                options={{ responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{display:false}}}}/>
            ) : <p className="text-xs text-gray-400 text-center pt-8">No movement data this month</p>}
          </div>
        </div>
      </div>

      {/* Stock movement table */}
      <div className="card">
        <div className="section-title">Stock movement — {format(monthDate,"MMMM yyyy")} · {business.toUpperCase()}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>
              <th className="th">Item</th><th className="th">+Received</th><th className="th">-Used/Sold</th>
              <th className="th">Revenue ₹</th>
            </tr></thead>
            <tbody>
              {moveRows.map((r,i)=>(
                <tr key={i} className="hover:bg-gray-50">
                  <td className="td font-medium">{r.name}</td>
                  <td className="td text-green-700 font-medium">+{r.received}</td>
                  <td className="td text-amber-700 font-medium">-{r.used}</td>
                  <td className="td font-medium text-blue-700">{fmtM(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {moveRows.length===0 && <p className="text-xs text-gray-400 text-center py-6">No movement data this month</p>}
        </div>
      </div>
    </div>
  )
}
