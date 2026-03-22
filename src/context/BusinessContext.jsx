import { createContext, useContext, useState } from 'react'

const BusinessContext = createContext(null)

export function BusinessProvider({ children }) {
  const [business, setBusiness] = useState('b2c')
  const toggle = () => setBusiness(b => b === 'b2c' ? 'b2b' : 'b2c')
  return (
    <BusinessContext.Provider value={{ business, setBusiness, toggle }}>
      {children}
    </BusinessContext.Provider>
  )
}

export const useBusiness = () => useContext(BusinessContext)
