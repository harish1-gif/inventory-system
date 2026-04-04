import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { fmt12, fmtM, fmtNum } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function OnlineOrders() {
  const { user } = useAuth()
  const { business } = useBusiness()
  const [orders, setOrders] = useState([])
  const [stocks, setStocks] = useState([])
  const [addModal, setAddModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [filterType, setFilterType] = useState('month') // 'day' or 'month'
  const [historyOrders, setHistoryOrders] = useState([])
  const [form, setForm] = useState({
    order_number: '', stock_id: '', quantity_ordered: 1, customer_name: '',
    platform: 'Direct', order_price: '', order_date: format(new Date(), 'yyyy-MM-dd'),
  })
  const canEdit = user.role === 'admin' || user.role === 'manager'
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [business])

  async function loadHistory() {
    let start, end
    if (filterType === 'day') {
      start = format(selectedDate, 'yyyy-MM-dd')
      end = format(selectedDate, 'yyyy-MM-dd') + 'T23:59:59'
    } else {
      start = format(startOfMonth(selectedDate), 'yyyy-MM-dd')
      end = format(endOfMonth(selectedDate), 'yyyy-MM-dd') + 'T23:59:59'
    }
    
    const { data } = await supabase
      .from('online_orders')
      .select('*')
      .eq('business', business)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
    
    setHistoryOrders(data || [])
  }

  useEffect(() => {
    if (historyModal) {
      loadHistory()
    }
  }, [selectedDate, filterType, historyModal, business])

  async function load() {
    const [ordersRes, stocksRes] = await Promise.all([
      supabase.from('online_orders').select('*').eq('business', business).order('created_at', { ascending: false }),
      supabase.from('stock').select('*').eq('business', business).order('name'),
    ])
    setOrders(ordersRes.data || [])
    setStocks(stocksRes.data || [])
  }

  async function addOrder() {
    if (!form.order_number || !form.stock_id || !form.quantity_ordered) return
    
    // Get stock to deduct
    const stock = stocks.find(s => s.id === form.stock_id)
    if (!stock) return

    try {
      // Add order
      await supabase.from('online_orders').insert({
        order_number: form.order_number,
        order_date: form.order_date,
        stock_id: form.stock_id,
        stock_name: stock.name,
        business: business,
        quantity_ordered: Number(form.quantity_ordered),
        customer_name: form.customer_name || 'Online Customer',
        platform: form.platform,
        order_price: Number(form.order_price) || 0,
        created_by: user.name,
        status: 'completed',
      })

      // Auto-deduct from stock
      const newQty = Math.max(0, stock.qty - Number(form.quantity_ordered))
      await supabase.from('stock').update({ qty: newQty }).eq('id', form.stock_id)

      // Log movement
      await supabase.from('stock_movements').insert({
        stock_id: form.stock_id,
        stock_name: stock.name,
        business: business,
        type: 'dispatch',
        qty_change: -Number(form.quantity_ordered),
        qty_before: stock.qty,
        qty_after: newQty,
        selling_price: stock.selling_price,
        note: `Online order ${form.order_number} via ${form.platform}`,
        by_name: user.name,
        by_role: user.role,
      })

      // Audit log
      await supabase.from('update_log').insert({
        by_user_id: user.id, by_name: user.name, by_role: user.role,
        category: 'stock',
        description: `Online order created: ${form.order_number} · ${stock.name} × ${form.quantity_ordered}`,
      })

      setAddModal(false)
      setForm({ order_number: '', stock_id: '', quantity_ordered: 1, customer_name: '', platform: 'Direct', order_price: '', order_date: today })
      load()
    } catch (err) {
      console.error('Error adding order:', err)
      alert('Failed to add order')
    }
  }

  // Calculate stats
  const todayOrders = orders.filter(o => o.order_date === today)
  const stockMap = {}
  stocks.forEach(s => {
    stockMap[s.id] = { ...s, todaySold: 0 }
  })
  todayOrders.forEach(o => {
    if (stockMap[o.stock_id]) stockMap[o.stock_id].todaySold += o.quantity_ordered
  })

  const stats = {
    totalOrders: orders.length,
    todayCount: todayOrders.length,
    outOfStock: stocks.filter(s => s.qty === 0).length,
    lowStock: stocks.filter(s => s.qty > 0 && s.qty <= s.min_qty).length,
    totalSoldToday: todayOrders.reduce((a, b) => a + b.quantity_ordered, 0),
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Online Orders Stock Tracker ({business.toUpperCase()})</h1>
        {canEdit && (
          <button className="btn-primary btn-sm rounded-lg" onClick={() => setAddModal(true)}>
            + New Order
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        {[
          { label: 'Total Orders', value: stats.totalOrders, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Today Orders', value: stats.todayCount, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Sold Today', value: stats.totalSoldToday, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Out of Stock', value: stats.outOfStock, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Low Stock', value: stats.lowStock, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-lg p-3 text-center`}>
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Stock Status Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4 overflow-x-auto">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="text-sm font-semibold">Stock Status & Today's Sales</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="th">Item Name</th>
              <th className="th">Current Qty</th>
              <th className="th">Min Qty</th>
              <th className="th">Sold Today</th>
              <th className="th">Remaining</th>
              <th className="th">Price</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map(stock => {
              const todaySold = stockMap[stock.id]?.todaySold || 0
              const status = stock.qty === 0 ? 'out' : stock.qty <= stock.min_qty ? 'low' : 'ok'
              const statusClass = status === 'out' ? 'badge-danger' : status === 'low' ? 'badge-warn' : 'badge-ok'
              return (
                <tr key={stock.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="td font-medium">{stock.name}</td>
                  <td className="td">
                    <span className="font-bold text-lg">{fmtNum(stock.qty)}</span>
                  </td>
                  <td className="td text-gray-400">{fmtNum(stock.min_qty)}</td>
                  <td className="td">
                    <span className="badge badge-blue">{todaySold}</span>
                  </td>
                  <td className="td">
                    <span className={`font-medium ${stock.qty <= stock.min_qty ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtNum(stock.qty)}
                    </span>
                  </td>
                  <td className="td text-blue-600 font-medium">{fmtM(stock.selling_price)}</td>
                  <td className="td">
                    <span className={`badge ${statusClass}`}>
                      {status === 'out' ? '🔴 OUT' : status === 'low' ? '🟡 LOW' : '🟢 OK'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {stocks.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No stock found</p>}
      </div>

      {/* Today's Orders Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Today's Online Orders ({todayOrders.length})</h3>
          <button className="btn btn-sm text-xs border-blue-300 text-blue-600" onClick={() => setHistoryModal(true)}>
            📅 View History
          </button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="th">Order #</th>
              <th className="th">Item</th>
              <th className="th">Qty</th>
              <th className="th">Price</th>
              <th className="th">Total</th>
              <th className="th">Platform</th>
              <th className="th">Customer</th>
              <th className="th">Time</th>
            </tr>
          </thead>
          <tbody>
            {todayOrders.map(order => (
              <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="td font-medium">{order.order_number}</td>
                <td className="td">{order.stock_name}</td>
                <td className="td">
                  <span className="badge badge-blue">{order.quantity_ordered}</span>
                </td>
                <td className="td">{fmtM(order.order_price)}</td>
                <td className="td font-medium text-blue-600">{fmtM(order.quantity_ordered * order.order_price)}</td>
                <td className="td">
                  <span className="text-gray-500 text-xs">{order.platform}</span>
                </td>
                <td className="td text-gray-500">{order.customer_name}</td>
                <td className="td text-gray-400">{format(new Date(order.created_at), 'HH:mm')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {todayOrders.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No orders today</p>}
      </div>

      {/* Add Order Modal */}
      {addModal && (
        <Modal title="Create Online Order" onClose={() => setAddModal(false)} size="lg">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Order Number *</label>
                <input className="input" placeholder="e.g., ORD-20260322-001" value={form.order_number} onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))} />
              </div>
              <div>
                <label className="label">Order Date *</label>
                <input type="date" className="input" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="label">Select Item *</label>
              <select className="input" value={form.stock_id} onChange={e => {
                const stock = stocks.find(s => s.id === e.target.value)
                setForm(f => ({ ...f, stock_id: e.target.value, order_price: stock?.selling_price || 0 }))
              }}>
                <option value="">-- Select Item --</option>
                {stocks.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (Qty: {s.qty}, Min: {s.min_qty})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity Ordered *</label>
                <input type="number" min="1" className="input" value={form.quantity_ordered} onChange={e => setForm(f => ({ ...f, quantity_ordered: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <label className="label">Platform</label>
                <select className="input" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                  <option>Direct</option>
                  <option>Flipkart</option>
                  <option>Amazon</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Unit Price ₹</label>
                <input type="number" className="input" value={form.order_price} onChange={e => setForm(f => ({ ...f, order_price: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">Customer Name</label>
                <input className="input" placeholder="Online Customer" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-3 text-xs">
              <div className="font-medium text-blue-900">Order Summary:</div>
              <div className="text-blue-700 mt-1">
                {form.quantity_ordered} × {fmtM(form.order_price)} = <span className="font-bold">{fmtM(form.quantity_ordered * form.order_price)}</span>
              </div>
              <div className="text-blue-600 mt-1">Stock will be auto-deducted from inventory</div>
            </div>
          </div>
          <ModalFooter>
            <button className="btn" onClick={() => setAddModal(false)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={addOrder}>Create Order</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Sales History Modal */}
      {historyModal && (
        <Modal title="Sales History" onClose={() => setHistoryModal(false)} size="lg">
          <div className="mb-4 space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('day')}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                  filterType === 'day'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                By Day
              </button>
              <button
                onClick={() => setFilterType('month')}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                  filterType === 'month'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                By Month
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate(filterType === 'day' ? new Date(selectedDate.getTime() - 86400000) : subMonths(selectedDate, 1))}
                className="btn btn-sm text-xs"
              >
                ← Prev
              </button>
              <input
                type={filterType === 'day' ? 'date' : 'month'}
                value={format(selectedDate, filterType === 'day' ? 'yyyy-MM-dd' : 'yyyy-MM')}
                onChange={e => setSelectedDate(new Date(e.target.value + (filterType === 'day' ? '' : '-01')))}
                className="input flex-1 text-xs"
              />
              <button
                onClick={() => setSelectedDate(filterType === 'day' ? new Date(selectedDate.getTime() + 86400000) : addMonths(selectedDate, 1))}
                className="btn btn-sm text-xs"
              >
                Next →
              </button>
            </div>

            {/* Summary Stats */}
            {historyOrders.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">Orders</div>
                  <div className="text-lg font-bold text-blue-600">{historyOrders.length}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">Total Qty</div>
                  <div className="text-lg font-bold text-green-600">{historyOrders.reduce((a, o) => a + o.quantity_ordered, 0)}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">Revenue</div>
                  <div className="text-lg font-bold text-purple-600">{fmtM(historyOrders.reduce((a, o) => a + (o.quantity_ordered * o.order_price), 0))}</div>
                </div>
              </div>
            )}
          </div>

          {/* History Table */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs min-w-max">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="th">Order #</th>
                  <th className="th">Item</th>
                  <th className="th">Qty</th>
                  <th className="th">Price</th>
                  <th className="th">Total</th>
                  <th className="th">Platform</th>
                  <th className="th">Customer</th>
                  <th className="th">Date</th>
                </tr>
              </thead>
              <tbody>
                {historyOrders.map(order => (
                  <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="td font-medium">{order.order_number}</td>
                    <td className="td">{order.stock_name}</td>
                    <td className="td">
                      <span className="badge badge-blue">{order.quantity_ordered}</span>
                    </td>
                    <td className="td">{fmtM(order.order_price)}</td>
                    <td className="td font-medium text-blue-600">{fmtM(order.quantity_ordered * order.order_price)}</td>
                    <td className="td text-gray-500">{order.platform}</td>
                    <td className="td text-gray-500 text-xs">{order.customer_name}</td>
                    <td className="td text-gray-400 text-xs">{fmt12(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historyOrders.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No orders in selected period</p>}
          </div>
          <ModalFooter>
            <button className="btn" onClick={() => setHistoryModal(false)}>Close</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}