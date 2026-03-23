import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt12, logAction } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function BagStock() {
  const { user }            = useAuth()
  const [bags, setBags]     = useState([])
  const [stock, setStock]   = useState([])
  const [techs, setTechs]   = useState([])
  const [selTech, setSelTech] = useState(user.role==='technician' ? user.id : '')
  const [tab, setTab]       = useState('current')
  const [dispatchModal, setDispatch] = useState(false)
  const [useModal, setUseModal]      = useState(null)
  const [dForm, setDForm]   = useState({ technician_id:'', stock_id:'', qty:1 })
  const [useQty, setUseQty] = useState(1)
  const [useNote, setUseNote] = useState('')
  const isTech = user.role === 'technician'
  const isAdmin = user.role === 'admin'
  const isMgr   = user.role === 'manager'

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (selTech) loadBag() }, [selTech])

  async function loadAll() {
    const [s, t] = await Promise.all([
      supabase.from('stock').select('id,name,category,business,qty').order('name'),
      supabase.from('app_users').select('id,name').eq('role','technician').eq('status','active'),
    ])
    setStock(s.data||[])
    setTechs(t.data||[])
    if (isTech) { setSelTech(user.id); loadBag(user.id) }
    else if (t.data?.length) { setSelTech(t.data[0].id); loadBag(t.data[0].id) }
  }

  async function loadBag(tid) {
    const id = tid || selTech
    if (!id) return
    const { data } = await supabase.from('bag_stock').select('*').eq('technician_id', id).order('dispatched_at',{ascending:false})
    setBags(data||[])
  }

  async function dispatch() {
    const { technician_id, stock_id, qty } = dForm
    if (!technician_id || !stock_id || !qty) return
    const s = stock.find(x=>x.id===stock_id)
    const t = techs.find(x=>x.id===technician_id)
    if (!s || s.qty < Number(qty)) { alert('Insufficient stock'); return }
    // Reduce main stock
    await supabase.from('stock').update({ qty: s.qty - Number(qty), last_updated_by: user.name, last_updated_at: new Date().toISOString() }).eq('id', stock_id)
    // Create bag_stock record
    await supabase.from('bag_stock').insert({
      technician_id, technician_name: t?.name||'',
      stock_id, stock_name: s.name, category: s.category, business: s.business,
      qty_dispatched: Number(qty), remaining_qty: Number(qty),
      dispatched_by: user.name, dispatched_at: new Date().toISOString()
    })
    await supabase.from('stock_movements').insert({ stock_id, stock_name: s.name, business: s.business, type:'dispatch', qty_change: -Number(qty), qty_before: s.qty, qty_after: s.qty-Number(qty), by_name: user.name, by_role: user.role, note: `Dispatched to ${t?.name}` })
    await logAction(user, 'bagstock', `Dispatched ${qty}x ${s.name} to ${t?.name||'technician'}`)
    setDispatch(false); setDForm({technician_id:'',stock_id:'',qty:1}); loadBag(); loadAll()
  }

  async function useFromBag(bag) {
    if (bag.remaining_qty < Number(useQty)) { alert('Not enough in bag'); return }
    const newRemain = bag.remaining_qty - Number(useQty)
    await supabase.from('bag_stock').update({ remaining_qty: newRemain, last_used_at: new Date().toISOString() }).eq('id', bag.id)
    await supabase.from('bag_stock_log').insert({
      bag_stock_id: bag.id, technician_id: bag.technician_id, technician_name: bag.technician_name,
      stock_id: bag.stock_id, stock_name: bag.stock_name, qty_used: Number(useQty),
      note: useNote, used_by: user.name, used_at: new Date().toISOString()
    })
    await logAction(user, 'bagstock', `Used ${useQty}x ${bag.stock_name} from ${bag.technician_name}'s bag${useNote?' — '+useNote:''}`)
    setUseModal(null); setUseQty(1); setUseNote(''); loadBag()
  }

  async function returnToInventory(bag) {
    if (bag.remaining_qty <= 0) { alert('Nothing to return'); return }
    const stk = stock.find(s=>s.id===bag.stock_id)
    if (!stk) return
    const updatedQty = stk.qty + bag.remaining_qty
    await supabase.from('stock').update({ qty: updatedQty, last_updated_by: user.name, last_updated_at: new Date().toISOString() }).eq('id', bag.stock_id)
    await supabase.from('bag_stock').update({ remaining_qty: 0 }).eq('id', bag.id)
    await supabase.from('stock_movements').insert({ stock_id: bag.stock_id, stock_name: bag.stock_name, business: bag.business, type:'receive', qty_change: bag.remaining_qty, qty_before: stk.qty, qty_after: updatedQty, by_name: user.name, by_role: user.role, note: `Returned from ${bag.technician_name}'s bag` })
    await logAction(user, 'bagstock', `Returned ${bag.remaining_qty}x ${bag.stock_name} to inventory from ${bag.technician_name}`)
    loadBag(); loadAll()
  }

  const displayed = bags.filter(b => tab==='current' ? b.remaining_qty > 0 : b.remaining_qty === 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Bag Stock</h1>
        <div className="flex gap-2 items-center">
          {!isTech && (
            <select className="input w-36 text-xs" value={selTech} onChange={e=>{setSelTech(e.target.value);loadBag(e.target.value)}}>
              {techs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {isAdmin && (
            <button className="btn-primary btn-sm rounded-lg" onClick={()=>setDispatch(true)}>+ Dispatch stock</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {[['current','Current stock'],['used','Used up']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`tab-btn ${tab===k?'tab-active':'tab-inactive'}`}>{l}</button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { l:'Total items', v:bags.filter(b=>b.remaining_qty>0).length, c:'text-amber-700', bg:'bg-amber-50' },
          { l:'Total units', v:bags.filter(b=>b.remaining_qty>0).reduce((a,b)=>a+b.remaining_qty,0), c:'text-gray-800', bg:'bg-gray-50' },
          { l:'Used up', v:bags.filter(b=>b.remaining_qty===0).length, c:'text-green-700', bg:'bg-green-50' },
        ].map(m=>(
          <div key={m.l} className={`${m.bg} rounded-xl p-3`}>
            <div className="text-xs text-gray-500 mb-1">{m.l}</div>
            <div className={`text-xl font-medium ${m.c}`}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Bag table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr>
            <th className="th">Item</th><th className="th">Category</th><th className="th">Business</th>
            <th className="th">Dispatched</th><th className="th">Remaining</th>
            <th className="th">Dispatched by</th><th className="th">Date</th>
            {(isAdmin||isMgr||isTech) && <th className="th">Action</th>}
          </tr></thead>
          <tbody>
            {displayed.map(b=>(
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="td font-medium">{b.stock_name}</td>
                <td className="td text-gray-500">{b.category}</td>
                <td className="td"><span className={`badge ${b.business==='b2c'?'badge-b2c':'badge-b2b'}`}>{b.business?.toUpperCase()}</span></td>
                <td className="td text-center">{b.qty_dispatched}</td>
                <td className="td">
                  <span className={`font-medium ${b.remaining_qty===0?'text-gray-400':b.remaining_qty<=2?'text-amber-600':'text-green-700'}`}>
                    {b.remaining_qty}
                  </span>
                  {b.remaining_qty===0 && <span className="badge badge-gray ml-1">Used up</span>}
                </td>
                <td className="td text-gray-500">{b.dispatched_by}</td>
                <td className="td text-gray-400">{fmt12(b.dispatched_at)}</td>
                {(isAdmin||isMgr||isTech) && (
                  <td className="td">
                    <div className="flex gap-1">
                      {b.remaining_qty > 0 && (
                        <>
                          <button className="btn btn-sm" onClick={()=>setUseModal(b)}>Use</button>
                          {(isAdmin||isMgr) && <button className="btn btn-sm text-amber-600 border-amber-200" onClick={()=>returnToInventory(b)}>Return</button>}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {displayed.length===0 && <p className="text-xs text-gray-400 text-center py-8">{tab==='current'?'No items in bag':'No used-up items'}</p>}
      </div>

      {/* Dispatch modal — admin only */}
      {dispatchModal && isAdmin && (
        <Modal title="Dispatch stock to technician" onClose={()=>setDispatch(false)}>
          <div className="space-y-3">
            <div>
              <label className="label">Technician</label>
              <select className="input" value={dForm.technician_id} onChange={e=>setDForm(f=>({...f,technician_id:e.target.value}))}>
                <option value="">Select technician…</option>
                {techs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Stock item</label>
              <select className="input" value={dForm.stock_id} onChange={e=>setDForm(f=>({...f,stock_id:e.target.value}))}>
                <option value="">Select item…</option>
                {stock.filter(s=>s.qty>0).map(s=>(
                  <option key={s.id} value={s.id}>{s.name} ({s.business?.toUpperCase()}) — {s.qty} in stock</option>
                ))}
              </select>
            </div>
            <div><label className="label">Quantity</label><input type="number" className="input" min={1} value={dForm.qty} onChange={e=>setDForm(f=>({...f,qty:e.target.value}))}/></div>
            <div className="bg-amber-50 text-amber-700 text-xs p-2 rounded">Main stock qty will reduce immediately. Logged permanently.</div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setDispatch(false)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={dispatch}>Dispatch</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Use from bag modal */}
      {useModal && (
        <Modal title={`Use from bag: ${useModal.stock_name}`} onClose={()=>setUseModal(null)} size="sm">
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Remaining in bag: <strong>{useModal.remaining_qty}</strong></p>
            <div><label className="label">Quantity used</label><input type="number" className="input" min={1} max={useModal.remaining_qty} value={useQty} onChange={e=>setUseQty(e.target.value)}/></div>
            <div><label className="label">Note (optional)</label><input className="input" placeholder="Job ref, customer…" value={useNote} onChange={e=>setUseNote(e.target.value)}/></div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setUseModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={()=>useFromBag(useModal)}>Confirm use</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
