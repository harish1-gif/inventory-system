import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt12, CAT_COLORS, CAT_LABELS } from '../lib/utils'
import { format, startOfMonth, endOfMonth, getDaysInMonth, getDay, subMonths, addMonths } from 'date-fns'

export default function Updates() {
  const [logs, setLogs]           = useState([])
  const [monthDate, setMonthDate] = useState(new Date())
  const [selectedDate, setSel]    = useState(null)
  const [search, setSearch]       = useState('')
  const [catFilter, setCat]       = useState('all')
  const [roleFilter, setRole]     = useState('all')
  const [loading, setLoading]     = useState(true)

  useEffect(() => { load() }, [monthDate])

  async function load() {
    setLoading(true)
    const start = format(startOfMonth(monthDate),'yyyy-MM-dd')
    const end   = format(endOfMonth(monthDate),'yyyy-MM-dd')+'T23:59:59'
    const { data } = await supabase.from('update_log').select('*')
      .gte('logged_at', start).lte('logged_at', end)
      .order('logged_at',{ascending:false})
    setLogs(data||[])
    setLoading(false)
  }

  const year  = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const daysInMonth    = getDaysInMonth(monthDate)
  const firstDayOfWeek = getDay(startOfMonth(monthDate))
  const todayStr       = format(new Date(),'yyyy-MM-dd')
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Group by date
  const byDate = {}
  logs.forEach(l => { const d=l.logged_at.split('T')[0]; if(!byDate[d])byDate[d]=[]; byDate[d].push(l) })

  const selLogs = selectedDate ? (byDate[selectedDate]||[]) : []
  const filtered = selLogs.filter(l=>{
    const matchSearch = !search || l.description?.toLowerCase().includes(search.toLowerCase()) || l.by_name?.toLowerCase().includes(search.toLowerCase())
    const matchCat  = catFilter==='all' || l.category===catFilter
    const matchRole = roleFilter==='all' || l.by_role===roleFilter
    return matchSearch && matchCat && matchRole
  })

  // Group by category
  const byCategory = {}
  filtered.forEach(l=>{ if(!byCategory[l.category])byCategory[l.category]=[]; byCategory[l.category].push(l) })

  const CAT_ICONS = { stock:'📦', bagstock:'🎒', job:'🔧', zone:'📍', settings:'⚙️', customer:'👤' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Updates</h1>
        <div className="flex gap-2 items-center">
          <button className="btn btn-sm" onClick={()=>{setMonthDate(m=>subMonths(m,1));setSel(null)}}>← Prev</button>
          <span className="font-medium text-sm min-w-[100px] text-center">{MONTHS[month]} {year}</span>
          <button className="btn btn-sm" onClick={()=>{setMonthDate(m=>addMonths(m,1));setSel(null)}}>Next →</button>
        </div>
      </div>

      {/* Calendar */}
      <div className="card">
        <div className="text-xs font-medium text-gray-500 mb-3">
          Permanent change log — click a highlighted date to see all changes
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map(d=><div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1 mb-4">
          {Array.from({length:firstDayOfWeek}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth}).map((_,i)=>{
            const day     = i+1
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const hasData = !!byDate[dateStr]
            const isToday = dateStr===todayStr
            const isSel   = dateStr===selectedDate
            const count   = hasData ? byDate[dateStr].length : 0
            return (
              <button key={day} onClick={()=>setSel(isSel?null:dateStr)}
                className={`relative p-2 rounded-lg text-center text-xs transition-all ${
                  isSel    ? 'bg-brand text-white font-medium' :
                  hasData  ? 'bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 border border-blue-200' :
                  isToday  ? 'border border-brand text-gray-600 hover:bg-gray-50' :
                  'text-gray-400 hover:bg-gray-50'
                }`}>
                <div>{day}</div>
                {hasData && <div className="text-center mt-0.5" style={{fontSize:'9px',color:isSel?'rgba(255,255,255,0.8)':'#185FA5'}}>{count}</div>}
              </button>
            )
          })}
        </div>

        {/* Monthly summary */}
        <div className="border-t border-gray-50 pt-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {Object.entries(CAT_LABELS).map(([key,label])=>{
            const cnt = logs.filter(l=>l.category===key).length
            return (
              <div key={key} className="text-center">
                <div className="text-lg font-medium" style={{color:CAT_COLORS[key]}}>{cnt}</div>
                <div className="text-xs text-gray-400">{CAT_ICONS[key]} {label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">
              Changes on {selectedDate} <span className="text-gray-400 font-normal text-xs">({selLogs.length} total)</span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <input className="input w-full sm:w-44 text-xs" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="input w-full sm:w-36 text-xs" value={catFilter} onChange={e=>setCat(e.target.value)}>
              <option value="all">All categories</option>
              {Object.entries(CAT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input w-full sm:w-28 text-xs" value={roleFilter} onChange={e=>setRole(e.target.value)}>
              <option value="all">All roles</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              <option value="technician">Technician</option>
            </select>
          </div>

          {filtered.length===0 ? (
            <p className="text-xs text-gray-400">No changes match filters</p>
          ) : (
            Object.entries(byCategory).map(([cat,items])=>(
              <div key={cat} className="mb-4">
                <div className="text-xs font-medium mb-2 pb-1 border-b border-gray-100 flex items-center gap-1"
                  style={{color:CAT_COLORS[cat]||'#888780'}}>
                  {CAT_ICONS[cat]} {CAT_LABELS[cat]||cat} ({items.length})
                </div>
                <div className="space-y-2">
                  {items.map(log=>(
                    <div key={log.id} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{background:CAT_COLORS[log.category]||'#888780'}}/>
                      <div className="flex-1">
                        <div className="text-xs font-medium">{log.description}</div>
                        {log.extra && <div className="text-xs text-amber-700 mt-0.5">{log.extra}</div>}
                        <div className="text-xs text-gray-400 mt-0.5">
                          by <strong>{log.by_name}</strong> <span className={`badge role-${log.by_role}`}>{log.by_role}</span> · {fmt12(log.logged_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!selectedDate && !loading && (
        <div className="card text-center py-10">
          <p className="text-sm text-gray-400">Click a highlighted date to see all changes</p>
          <p className="text-xs text-gray-300 mt-1">Blue dates have recorded activity · {logs.length} entries this month</p>
        </div>
      )}
    </div>
  )
}
