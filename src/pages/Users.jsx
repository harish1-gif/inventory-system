import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt12, logAction } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function Users() {
  const { user }          = useAuth()
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState({ name:'', phone:'', password:'', role:'technician', area:'', status:'active' })
  const isMgr = user.role === 'manager'

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('app_users').select('*').order('role').order('name')
    setUsers(data||[])
  }

  async function save() {
    if (!form.name || !form.phone) return
    if (modal === 'add') {
      await supabase.from('app_users').insert({ ...form })
      await logAction(user, 'settings', `New user added: ${form.name} (${form.role})`)
    } else {
      await supabase.from('app_users').update({ ...form }).eq('id', modal.id)
      await logAction(user, 'settings', `User updated: ${form.name}`)
    }
    setModal(null); load()
  }

  async function toggleStatus(u) {
    const newStatus = u.status==='active' ? 'inactive' : 'active'
    await supabase.from('app_users').update({ status: newStatus }).eq('id', u.id)
    await logAction(user, 'settings', `User ${u.name} set to ${newStatus}`)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Users</h1>
        {isMgr && (
          <button className="btn-primary btn-sm rounded-lg"
            onClick={()=>{ setForm({name:'',phone:'',password:'',role:'technician',area:'',status:'active'}); setModal('add') }}>
            + Add user
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr>
            <th className="th">Name</th><th className="th">Phone</th>
            {/* Passwords: manager sees plain text, admin sees dots */}
            <th className="th">Password</th>
            <th className="th">Role</th><th className="th">Area</th><th className="th">Status</th>
            {isMgr && <th className="th">Actions</th>}
          </tr></thead>
          <tbody>
            {users.map(u=>(
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="td font-medium">{u.name}</td>
                <td className="td">{u.phone}</td>
                <td className="td">
                  {isMgr
                    ? <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{u.password}</code>
                    : <span className="text-gray-400 tracking-widest">••••••••</span>}
                </td>
                <td className="td"><span className={`badge role-${u.role}`}>{u.role}</span></td>
                <td className="td text-gray-500">{u.area||'ALL'}</td>
                <td className="td">
                  <span className={`badge ${u.status==='active'?'badge-ok':'badge-danger'}`}>{u.status}</span>
                </td>
                {isMgr && (
                  <td className="td">
                    <div className="flex gap-1">
                      <button className="btn btn-sm" onClick={()=>{ setForm({...u}); setModal(u) }}>Edit</button>
                      <button className={`btn btn-sm ${u.status==='active'?'text-red-500 border-red-200':'text-green-600 border-green-200'}`}
                        onClick={()=>toggleStatus(u)}>
                        {u.status==='active'?'Deactivate':'Activate'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && isMgr && (
        <Modal title={modal==='add'?'Add user':'Edit user'} onClose={()=>setModal(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
            <div><label className="label">Password</label><input className="input" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/></div>
            <div><label className="label">Role</label>
              <select className="input" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="technician">Technician</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div><label className="label">Area</label><input className="input" value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))}/></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={save}>Save</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
