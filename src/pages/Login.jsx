import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const DEMOS = [
  ['9000000001','mgr123','manager'],
  ['9000000002','admin123','admin'],
  ['9445937023','ravi123','technician'],
]

export default function Login() {
  const [phone, setPhone]   = useState('')
  const [pass, setPass]     = useState('')
  const [error, setError]   = useState('')
  const { login, loading }  = useAuth()
  const navigate             = useNavigate()

  const handle = async e => {
    e.preventDefault(); setError('')
    const { error } = await login(phone, pass)
    if (error) { setError(error); return }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-100 rounded-xl p-8 w-full max-w-sm">
        <h1 className="font-medium text-base mb-1">RO Inventory System</h1>
        <p className="text-xs text-gray-500 mb-6">Service & Spare Parts Management · Kanchipuram</p>
        <form onSubmit={handle} className="space-y-4">
          <div>
            <label className="label">Phone number</label>
            <input className="input" placeholder="9XXXXXXXXX" maxLength={10}
              value={phone} onChange={e=>setPhone(e.target.value)} required/>
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="Password"
              value={pass} onChange={e=>setPass(e.target.value)} required/>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2 rounded-lg disabled:opacity-60">
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">Demo accounts — click to fill:</p>
          <div className="space-y-1">
            {DEMOS.map(([ph,pw,role])=>(
              <button key={ph} onClick={()=>{setPhone(ph);setPass(pw)}}
                className="block w-full text-left text-xs bg-gray-50 hover:bg-gray-100 rounded px-2 py-1.5 transition-colors">
                {ph} / {pw} — <span className={`badge role-${role} text-xs`}>{role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
