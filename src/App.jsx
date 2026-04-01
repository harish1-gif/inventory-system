import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BusinessProvider } from './context/BusinessContext'
import Layout from './components/Layout'
import Login      from './pages/Login'
import Dashboard  from './pages/Dashboard'
import Inventory  from './pages/Inventory'
import Zones      from './pages/Zones'
import Jobs       from './pages/Jobs'
import TechTracker from './pages/TechTracker'
import BagStock   from './pages/BagStock'
import Analytics  from './pages/Analytics'
import Product    from './pages/Product'
import Customers  from './pages/Customers'
import OnlineOrders from './pages/OnlineOrders'
import Updates    from './pages/Updates'
import Users      from './pages/Users'
import JobHistory from './pages/JobHistory'

function Protected({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="inventory"  element={<Protected roles={['admin','manager']}><Inventory /></Protected>} />
        <Route path="zones"      element={<Protected roles={['admin','manager']}><Zones /></Protected>} />
        <Route path="jobs"       element={<Jobs />} />
        <Route path="tracker"    element={<TechTracker />} />
        <Route path="bagstock"   element={<BagStock />} />
        <Route path="analytics"  element={<Protected roles={['admin','manager']}><Analytics /></Protected>} />
        <Route path="product"    element={<Product />} />
        <Route path="customers"  element={<Customers />} />
        <Route path="online"     element={<OnlineOrders />} />
        <Route path="updates"    element={<Protected roles={['admin','manager']}><Updates /></Protected>} />
        <Route path="users"      element={<Protected roles={['admin','manager']}><Users /></Protected>} />
        <Route path="jobhistory" element={<Protected roles={['admin','manager']}><JobHistory /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </BusinessProvider>
    </AuthProvider>
  )
}
