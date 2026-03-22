import { createContext, useContext, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const s = localStorage.getItem('ro_user')
    return s ? JSON.parse(s) : null
  })
  const [loading, setLoading] = useState(false)

  const login = async (phone, password) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('app_users').select('*')
      .eq('phone', phone.trim()).eq('password', password).eq('status','active').single()
    setLoading(false)
    if (error || !data) return { error: 'Wrong phone or password' }
    localStorage.setItem('ro_user', JSON.stringify(data))
    setUser(data)
    return { data }
  }

  const logout = () => { localStorage.removeItem('ro_user'); setUser(null) }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
