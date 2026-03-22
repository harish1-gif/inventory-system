import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt12, logAction } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function Zones() {
  const { user }          = useAuth()
  const [zones, setZones] = useState([])
  const [techs, setTechs] = useState([])
  const [assignments, setAssign] = useState([])
  const [modal, setModal] = useState(null)  // 'add' | {zone}
  const [assignModal, setAssignModal] = useState(null) // {zone}
  const [selTech, setSelTech] = useState('')
  const [form, setForm]   = useState({ name:'', description:'', color:'#185FA5', km_from_kpm:0 })
  const isMgr = user.role === 'manager'

  const COLORS = ['#185FA5','#059669','#854F0B','#534AB7','#993C1D','#3B6D11','#BA7517','#0C447C','#712B13']

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [z, u, a] = await Promise.all([
      supabase.from('zones').select('*').order('km_from_kpm'),
      supabase.from('app_users').select('id,name,role').eq('role','technician').eq('status','active'),
      supabase.from('zone_technicians').select('*,app_users(name),zones(name)'),
    ])
    setZones(z.data||[]); setTechs(u.data||[]); setAssign(a.data||[])
  }

  async function saveZone() {
    if (!form.name.trim()) return
    if (modal === 'add') {
      await supabase.from('zones').insert({ ...form, created_by: user.name })
      await logAction(user, 'zone', `New zone created: "${form.name}" — ${form.km_from_kpm}km from KPM`)
    } else {
      await supabase.from('zones').update({ ...form }).eq('id', modal.id)
      await logAction(user, 'zone', `Zone updated: "${form.name}"`)
    }
    setModal(null); loadAll()
  }

  async function deleteZone(id, name) {
    if (!confirm(`Delete zone "${name}"?`)) return
    await supabase.from('zones').delete().eq('id', id)
    await logAction(user, 'zone', `Zone deleted: "${name}"`)
    loadAll()
  }

  async function assignTech() {
    if (!selTech || !assignModal) return
    const { error } = await supabase.from('zone_technicians').insert({
      zone_id: assignModal.id, technician_id: selTech, assigned_by: user.name
    })
    if (error) { alert('Already assigned'); return }
    const t = techs.find(t=>t.id===selTech)
    await logAction(user, 'zone', `Technician ${t?.name} assigned to zone "${assignModal.name}"`)
    setSelTech(''); loadAll()
  }

  async function removeTech(ztId, techName, zoneName) {
    await supabase.from('zone_technicians').delete().eq('id', ztId)
    await logAction(user, 'zone', `Technician ${techName} removed from zone "${zoneName}"`)
    loadAll()
  }

  function openEdit(z) {
    setForm({ name:z.name, description:z.description||'', color:z.color||'#185FA5', km_from_kpm:z.km_from_kpm||0 })
    setModal(z)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Zones</h1>
        <div className="text-xs text-gray-400">Around Kanchipuram Bus Stand — {zones.length} zones</div>
        {isMgr && (
          <button className="btn-primary btn-sm rounded-lg"
            onClick={()=>{ setForm({name:'',description:'',color:'#185FA5',km_from_kpm:0}); setModal('add') }}>
            + Add zone
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {zones.map(z => {
          const zTechs = assignments.filter(a=>a.zone_id===z.id)
          return (
            <div key={z.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:z.color}}/>
                  <div>
                    <div className="font-medium text-sm">{z.name}</div>
                    {z.description && <div className="text-xs text-gray-500">{z.description}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-gray">{z.km_from_kpm} km</span>
                  {isMgr && (
                    <div className="flex gap-1">
                      <button className="btn btn-sm" onClick={()=>openEdit(z)}>Edit</button>
                      <button className="btn btn-sm text-red-500 border-red-200" onClick={()=>deleteZone(z.id,z.name)}>Del</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-50 pt-2 mt-2">
                <div className="text-xs text-gray-400 mb-1">Technicians ({zTechs.length})</div>
                <div className="flex flex-wrap gap-1">
                  {zTechs.map(a=>(
                    <span key={a.id} className="inline-flex items-center gap-1 badge badge-blue text-xs">
                      {a.app_users?.name}
                      {isMgr && (
                        <button className="ml-1 text-blue-400 hover:text-red-500"
                          onClick={()=>removeTech(a.id,a.app_users?.name,z.name)}>×</button>
                      )}
                    </span>
                  ))}
                  {zTechs.length===0 && <span className="text-xs text-gray-300">No technicians assigned</span>}
                </div>
                {isMgr && (
                  <button className="text-xs text-blue-500 hover:underline mt-2"
                    onClick={()=>setAssignModal(z)}>+ Assign technician</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add/Edit zone modal */}
      {modal && (
        <Modal title={modal==='add'?'Add zone':'Edit zone'} onClose={()=>setModal(null)} size="sm">
          <div className="space-y-3">
            <div><label className="label">Zone name</label><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label className="label">Description</label><input className="input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
            <div><label className="label">Distance from KPM Bus Stand (km)</label><input type="number" className="input" value={form.km_from_kpm} onChange={e=>setForm(f=>({...f,km_from_kpm:e.target.value}))}/></div>
            <div>
              <label className="label">Color tag</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color===c?'border-gray-800 scale-110':'border-transparent'}`}
                    style={{background:c}}/>
                ))}
              </div>
            </div>
            <div className="bg-green-50 text-green-700 text-xs p-2 rounded">Saved permanently in Updates log</div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={saveZone}>Save</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Assign technician modal */}
      {assignModal && (
        <Modal title={`Assign technician to "${assignModal.name}"`} onClose={()=>setAssignModal(null)} size="sm">
          <div className="space-y-3">
            <div>
              <label className="label">Select technician</label>
              <select className="input" value={selTech} onChange={e=>setSelTech(e.target.value)}>
                <option value="">Select…</option>
                {techs.map(t=>(
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setAssignModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={assignTech}>Assign</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
