import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { fmt12, fmtM, logAction } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function Inventory() {
  const { user }          = useAuth()
  const { business, setBusiness } = useBusiness()
  const [items, setItems] = useState([])
  const [search, setSearch]   = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [statusFilter, setStatus] = useState('all')
  const [addModal, setAddModal] = useState(false)
  const [receiveModal, setReceive] = useState(null)
  const [useModal, setUseModal] = useState(null)
  const [editingCell, setEditingCell] = useState(null) // {id, field}
  const cellRef = useRef(null)
  const isMgr   = user.role === 'manager'
  const isAdmin = user.role === 'admin'
  const [form, setForm] = useState({ name:'', category:'', qty:0, min_qty:5, landing_price:0, purchase_price:0, selling_price:0, notes:'' })
  const [rcvQty, setRcvQty] = useState(1)
  const [rcvNote, setRcvNote] = useState('')
  const [useQty, setUseQty] = useState(1)
  const [useNote, setUseNote] = useState('')

  useEffect(() => { load() }, [business])

  async function load() {
    const { data } = await supabase.from('stock').select('*').eq('business', business).order('selling_price', { ascending: false })
    if (data) {
      data.sort((a, b) => b.qty - a.qty)
    }
    setItems(data || [])
  }

  const categories = [...new Set(items.map(i=>i.category))].sort()

  const filtered = items.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase())
    const matchCat    = catFilter==='all' || s.category===catFilter
    const matchStatus = statusFilter==='all'
      || (statusFilter==='ok' && s.qty>s.min_qty)
      || (statusFilter==='low' && s.qty>0 && s.qty<=s.min_qty)
      || (statusFilter==='out' && s.qty===0)
    return matchSearch && matchCat && matchStatus
  })

  // Inline cell save — one field at a time
  async function saveCell(id, field, value) {
    const item = items.find(x=>x.id===id)
    if (!item) return
    const oldVal = item[field]
    if (String(oldVal) === String(value)) { setEditingCell(null); return }
    const upd = { [field]: field.includes('price')||field==='qty'||field==='min_qty' ? Number(value) : value, last_updated_by: user.name, last_updated_at: new Date().toISOString() }
    await supabase.from('stock').update(upd).eq('id', id)
    await logAction(user, 'stock', `${item.name} [${business.toUpperCase()}] — ${field} changed: ${oldVal} → ${value}`)
    setEditingCell(null)
    load()
  }

  async function addItem() {
    await supabase.from('stock').insert({ ...form, business, last_updated_by: user.name, last_updated_at: new Date().toISOString() })
    await logAction(user, 'stock', `New item added [${business.toUpperCase()}]: ${form.name}`)
    setAddModal(false); setForm({ name:'', category:'', qty:0, min_qty:5, landing_price:0, purchase_price:0, selling_price:0, notes:'' }); load()
  }

  async function deleteItem(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    await supabase.from('stock').delete().eq('id', id)
    await logAction(user, 'stock', `Item deleted [${business.toUpperCase()}]: ${name}`)
    load()
  }

  async function receiveStock() {
    if (!receiveModal) return
    const item = items.find(x=>x.id===receiveModal.id)
    const before = item.qty, after = before + Number(rcvQty)
    await supabase.from('stock').update({ qty: after, last_updated_by: user.name, last_updated_at: new Date().toISOString() }).eq('id', receiveModal.id)
    await supabase.from('stock_movements').insert({ stock_id: receiveModal.id, stock_name: item.name, business, type:'receive', qty_change: Number(rcvQty), qty_before: before, qty_after: after, selling_price: item.selling_price, note: rcvNote, by_name: user.name, by_role: user.role })
    await logAction(user, 'stock', `Received +${rcvQty} units of ${item.name} [${business.toUpperCase()}]${rcvNote ? ' — '+rcvNote : ''}`)
    setReceive(null); setRcvQty(1); setRcvNote(''); load()
  }

  async function useStock() {
    if (!useModal) return
    const item = items.find(x=>x.id===useModal.id)
    if (item.qty < Number(useQty)) { alert('Not enough stock'); return }
    const before = item.qty, after = before - Number(useQty)
    await supabase.from('stock').update({ qty: after, last_updated_by: user.name, last_updated_at: new Date().toISOString() }).eq('id', useModal.id)
    await supabase.from('stock_movements').insert({ stock_id: useModal.id, stock_name: item.name, business, type:'use', qty_change: -Number(useQty), qty_before: before, qty_after: after, selling_price: item.selling_price, note: useNote, by_name: user.name, by_role: user.role })
    await logAction(user, 'stock', `Used ${useQty} units of ${item.name} [${business.toUpperCase()}]${useNote ? ' — '+useNote : ''}`)
    setUseModal(null); setUseQty(1); setUseNote(''); load()
  }

  const isB2C = business === 'b2c'

  function EditableCell({ item, field, type='text', canEdit }) {
    const isEditing = editingCell?.id===item.id && editingCell?.field===field
    const val = item[field] ?? ''
    if (!canEdit) return <span>{type==='number'&&field.includes('price')?fmtM(val):val||'—'}</span>
    if (isEditing) {
      return (
        <input
          ref={cellRef}
          className="input-inline"
          type={type}
          defaultValue={val}
          autoFocus
          onBlur={e => saveCell(item.id, field, e.target.value)}
          onKeyDown={e => {
            if (e.key==='Enter') saveCell(item.id, field, e.target.value)
            if (e.key==='Escape') setEditingCell(null)
          }}
        />
      )
    }
    return (
      <span className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 rounded px-1 transition-colors"
        onClick={() => setEditingCell({id:item.id, field})}
        title="Click to edit">
        {type==='number'&&field.includes('price') ? fmtM(val) : val||<span className="text-gray-300">—</span>}
      </span>
    )
  }

  return (
    <div>
      {/* B2C / B2B switcher */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="page-title mb-0">Inventory</h1>
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs ml-2">
          <button onClick={()=>setBusiness('b2c')}
            className={`px-4 py-1.5 font-medium transition-colors ${isB2C?'bg-blue-500 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}>
            B2C — RO Parts
          </button>
          <button onClick={()=>setBusiness('b2b')}
            className={`px-4 py-1.5 font-medium transition-colors ${!isB2C?'bg-emerald-500 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}>
            B2B — Commercial
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {[
          { l:'Total items', v:items.length, c:'text-gray-800', bg:'bg-gray-50' },
          { l:'Low stock',   v:items.filter(s=>s.qty>0&&s.qty<=s.min_qty).length, c:'text-amber-700', bg:'bg-amber-50' },
          { l:'Out of stock',v:items.filter(s=>s.qty===0).length, c:'text-red-600', bg:'bg-red-50' },
          { l:'Stock value', v:isMgr?fmtM(items.reduce((a,s)=>a+s.qty*s.selling_price,0)):'—', c:isB2C?'text-blue-600':'text-emerald-600', bg:isB2C?'bg-blue-50':'bg-emerald-50' },
        ].map(m=>(
          <div key={m.l} className={`${m.bg} rounded-xl p-3`}>
            <div className="text-xs text-gray-500 mb-1">{m.l}</div>
            <div className={`text-xl font-medium ${m.c}`}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <input className="input w-44" placeholder="Search items…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="input w-36" value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input w-32" value={statusFilter} onChange={e=>setStatus(e.target.value)}>
          <option value="all">All status</option>
          <option value="ok">OK</option>
          <option value="low">Low</option>
          <option value="out">Out of stock</option>
        </select>
        <div className="ml-auto flex gap-2">
          {isMgr && <button className="btn-primary btn-sm rounded-lg" onClick={()=>setAddModal(true)}>+ Add item</button>}
          <span className="text-xs text-gray-400 self-center">Click any cell to edit</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={isB2C?'bg-blue-50':'bg-emerald-50'}>
                <th className="th">#</th>
                <th className="th">Item name</th>
                <th className="th">Category</th>
                <th className="th">Qty</th>
                <th className="th">Min qty</th>
                {/* LP PP SP: ONLY for manager — not rendered at all for admin/tech */}
                {isMgr && <><th className="th text-orange-600">LP ₹</th><th className="th text-green-700">PP ₹</th><th className="th text-blue-700">SP ₹</th></>}
                <th className="th">Status</th>
                <th className="th">Notes</th>
                <th className="th">Last updated</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s,i)=>{
                const st = s.qty===0?'danger':s.qty<=s.min_qty?'warn':'ok'
                const lbl = s.qty===0?'Out of stock':s.qty<=s.min_qty?'Low':'OK'
                const pct = s.qty===0?0:Math.min(100,Math.round(s.qty/Math.max(s.qty,s.min_qty*3)*100))
                const bc  = s.qty===0?'#EF4444':s.qty<=s.min_qty?'#F59E0B':'#16A34A'
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="td text-gray-400">{i+1}</td>
                    <td className="td font-medium min-w-[130px]">
                      <EditableCell item={s} field="name" canEdit={isMgr}/>
                    </td>
                    <td className="td min-w-[100px]">
                      <EditableCell item={s} field="category" canEdit={isMgr}/>
                    </td>
                    <td className="td text-center font-medium">
                      <EditableCell item={s} field="qty" type="number" canEdit={isMgr||isAdmin}/>
                    </td>
                    <td className="td text-center">
                      <EditableCell item={s} field="min_qty" type="number" canEdit={isMgr||isAdmin}/>
                    </td>
                    {/* LP PP SP — manager only, completely not rendered otherwise */}
                    {isMgr && (
                      <>
                        <td className="td text-orange-700 font-medium">
                          <EditableCell item={s} field="landing_price" type="number" canEdit={true}/>
                        </td>
                        <td className="td text-green-700 font-medium">
                          <EditableCell item={s} field="purchase_price" type="number" canEdit={true}/>
                        </td>
                        <td className="td text-blue-700 font-medium">
                          <EditableCell item={s} field="selling_price" type="number" canEdit={true}/>
                        </td>
                      </>
                    )}
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <span className={`badge badge-${st}`}>{lbl}</span>
                        <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden md:block">
                          <div className="h-1.5 rounded-full" style={{width:pct+'%',background:bc}}/>
                        </div>
                      </div>
                    </td>
                    <td className="td min-w-[120px]">
                      <EditableCell item={s} field="notes" canEdit={isMgr||isAdmin}/>
                    </td>
                    <td className="td text-gray-400 whitespace-nowrap">
                      <div>{s.last_updated_by||'—'}</div>
                      <div style={{fontSize:'10px'}}>{fmt12(s.last_updated_at)}</div>
                    </td>
                    <td className="td whitespace-nowrap">
                      <div className="flex gap-1">
                        <button className="btn btn-sm" onClick={()=>setReceive({id:s.id,name:s.name})}>+Recv</button>
                        <button className="btn btn-sm" onClick={()=>setUseModal({id:s.id,name:s.name})} disabled={s.qty===0}>Use</button>
                        {isMgr && <button className="btn btn-sm text-red-500 border-red-200" onClick={()=>deleteItem(s.id,s.name)}>Del</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length===0 && <p className="text-xs text-gray-400 text-center py-8">No items found</p>}
      </div>

      {/* Add item modal — manager only */}
      {addModal && isMgr && (
        <Modal title={`Add new ${business.toUpperCase()} item`} onClose={()=>setAddModal(false)} size="lg">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Item name</label><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label className="label">Category</label><input className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/></div>
            <div><label className="label">Initial qty</label><input type="number" className="input" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/></div>
            <div><label className="label">Min qty</label><input type="number" className="input" value={form.min_qty} onChange={e=>setForm(f=>({...f,min_qty:e.target.value}))}/></div>
            <div><label className="label">LP ₹ (landing price)</label><input type="number" className="input" value={form.landing_price} onChange={e=>setForm(f=>({...f,landing_price:e.target.value}))}/></div>
            <div><label className="label">PP ₹ (purchase price)</label><input type="number" className="input" value={form.purchase_price} onChange={e=>setForm(f=>({...f,purchase_price:e.target.value}))}/></div>
            <div><label className="label">SP ₹ (selling price)</label><input type="number" className="input" value={form.selling_price} onChange={e=>setForm(f=>({...f,selling_price:e.target.value}))}/></div>
            <div className="col-span-2"><label className="label">Notes</label><input className="input" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setAddModal(false)}>Cancel</button>
            <button className={isB2C?'btn-primary rounded-lg px-4 py-1.5 text-sm':'btn-b2b rounded-lg px-4 py-1.5 text-sm'} onClick={addItem}>Add item</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Receive stock */}
      {receiveModal && (
        <Modal title={`Receive stock: ${receiveModal.name}`} onClose={()=>setReceive(null)} size="sm">
          <div className="space-y-3">
            <div><label className="label">Quantity received</label><input type="number" className="input" min={1} value={rcvQty} onChange={e=>setRcvQty(e.target.value)}/></div>
            <div><label className="label">Note (optional)</label><input className="input" placeholder="Batch no, supplier…" value={rcvNote} onChange={e=>setRcvNote(e.target.value)}/></div>
            <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded">Saved permanently in Updates log</div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setReceive(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={receiveStock}>Confirm receive</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Use stock */}
      {useModal && (
        <Modal title={`Record use: ${useModal.name}`} onClose={()=>setUseModal(null)} size="sm">
          <div className="space-y-3">
            <div><label className="label">Quantity used</label><input type="number" className="input" min={1} value={useQty} onChange={e=>setUseQty(e.target.value)}/></div>
            <div><label className="label">Note (optional)</label><input className="input" placeholder="Customer, job ref…" value={useNote} onChange={e=>setUseNote(e.target.value)}/></div>
            <div className="bg-amber-50 text-amber-700 text-xs p-2 rounded">Saved permanently in Updates log</div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={()=>setUseModal(null)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={useStock}>Confirm use</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
