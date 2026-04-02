import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const NAV = [
  { to:'/',            label:'Dashboard',    icon:'▦', roles:['admin','manager','technician'] },
  { to:'/inventory',   label:'Inventory',    icon:'◈', roles:['admin','manager'] },
  { to:'/zones',       label:'Zones',        icon:'◎', roles:['admin','manager'] },
  { to:'/jobs',        label:'Jobs',         icon:'✎', roles:['admin','manager','technician'] },
  { to:'/tracker',     label:'Tech Tracker', icon:'⊙', roles:['admin','manager','technician'] },
  { to:'/bagstock',    label:'Bag Stock',    icon:'◫', roles:['admin','manager','technician'] },
  { to:'/analytics',   label:'Analytics',    icon:'◉', roles:['manager'] },
  { to:'/product',     label:'Product',      icon:'◈', roles:['admin','manager','technician'] },
  { to:'/customers',   label:'Customers',    icon:'👥', roles:['admin','manager','technician'] },
  { to:'/online',      label:'Online Orders',icon:'🛒', roles:['admin','manager','technician'] },
  { to:'/updates',     label:'Updates',      icon:'◑', roles:['admin','manager'] },
  { to:'/users',       label:'Users',        icon:'👤', roles:['admin','manager'] },
  { to:'/jobhistory',  label:'Job History',  icon:'📋', roles:['admin','manager'] },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { business, toggle } = useBusiness()
  const navigate = useNavigate()
  const [anaShared, setAnaShared] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key','analytics_shared').single()
      .then(({ data }) => { if (data) setAnaShared(data.value === 'true') })
    const sub = supabase.channel('settings_ch')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'app_settings'},p=>{
        if(p.new.key==='analytics_shared') setAnaShared(p.new.value==='true')
      }).subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  const visible = NAV.filter(item => {
    if (item.roles.includes(user.role)) return true
    if (item.to==='/analytics' && user.role==='admin' && anaShared) return true
    return false
  })

  const isB2C = business === 'b2c'

  const SideContent = () => (
    <>
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="font-medium text-sm">RO Inventory</div>
        <div className="text-xs text-gray-500 mt-0.5">{user.name}</div>
        <span className={`badge role-${user.role} mt-1 text-xs`}>{user.role}</span>
      </div>

      {/* B2C / B2B Switch */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
          <button onClick={()=>!isB2C&&toggle()}
            className={`flex-1 py-1.5 font-medium transition-colors ${isB2C?'bg-blue-500 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}>
            B2C
          </button>
          <button onClick={()=>isB2C&&toggle()}
            className={`flex-1 py-1.5 font-medium transition-colors ${!isB2C?'bg-emerald-500 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}>
            B2B
          </button>
        </div>
        <div className={`text-xs mt-1 text-center font-medium ${isB2C?'text-blue-600':'text-emerald-600'}`}>
          {isB2C ? 'RO Spare Parts' : 'Commercial Products'}
        </div>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {visible.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to==='/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors ${
                isActive
                  ? isB2C ? 'bg-brand-light text-brand font-medium' : 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
            <span className="text-sm">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-gray-100">
        <button onClick={handleLogout} className="btn btn-sm w-full text-gray-600">Logout</button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="w-48 bg-white border-r border-gray-100 flex-col flex-shrink-0 hidden md:flex">
        <SideContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="w-48 bg-white border-r border-gray-100 flex flex-col">
            <SideContent />
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMobileOpen(false)}/>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
          <button onClick={() => setMobileOpen(true)} className="text-gray-600 text-xl">☰</button>
          <span className="font-medium text-sm">RO Inventory</span>
          <span className={`badge ${isB2C?'badge-b2c':'badge-b2b'} ml-auto`}>{isB2C?'B2C':'B2B'}</span>
        </div>
        <main className="flex-1 p-4 md:p-5 overflow-auto bg-gray-50">
          <Outlet context={{ business, anaShared, setAnaShared }} />
        </main>
      </div>
    </div>
  )
}
