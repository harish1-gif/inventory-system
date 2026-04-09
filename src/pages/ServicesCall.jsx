import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtD, fmt12, logAction } from '../lib/utils'
import Modal, { ModalFooter } from '../components/Modal'

export default function ServiceCalls() {
  const { user } = useAuth()
  const [enquiries, setEnquiries] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, pending, overdue, confirmed, done
  const [colorFilter, setColorFilter] = useState('all') // all, red, orange, yellow, green
  const [statFilter, setStatFilter] = useState('all') // all, no-action, overdue, call-needed, confirmed, completed
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  
  // Modals
  const [showCallModal, setShowCallModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedEnquiry, setSelectedEnquiry] = useState(null)
  
  // Form states
  const [callStatus, setCallStatus] = useState('called_no_answer')
  const [callNotes, setCallNotes] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [serviceDate, setServiceDate] = useState('')
  const [serviceAmount, setServiceAmount] = useState(0)
  const [receivedAmount, setReceivedAmount] = useState(0)
  const [sparesReplaced, setSparesReplaced] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    
    // Load enquiries with pagination (fetch all records in batches of 1000)
    let allEnquiries = []
    let page = 0
    let hasMore = true
    
    while (hasMore) {
      const start = page * 1000
      const end = start + 999
      const { data: enq, error } = await supabase
        .from('call_enquiries')
        .select('*')
        .order('due_date', { ascending: false })
        .range(start, end)
      
      if (error || !enq || enq.length === 0) {
        hasMore = false
      } else {
        allEnquiries = [...allEnquiries, ...enq]
        hasMore = enq.length === 1000
        page++
      }
    }
    
    // Load customers for creating new enquiries
    const { data: cust } = await supabase
      .from('customers')
      .select('*')
      .eq('business_type', 'b2c')
      .eq('status', 'completed')
    
    setEnquiries(allEnquiries)
    setCustomers(cust || [])
    setCurrentPage(1)
    setLoading(false)
  }

  async function generateEnquiries() {
    if (!confirm('Generate call enquiries for all AMC customers based on their due dates?')) return
    
    const { error } = await supabase.rpc('generate_call_enquiries')
    
    if (error) {
      alert('Error: ' + error.message)
    } else {
      alert('✅ Call enquiries generated successfully!')
      await logAction(user, 'service_calls', 'Generated call enquiries for all AMC customers')
      loadData()
    }
  }

  function openCallModal(enq) {
    setSelectedEnquiry(enq)
    setCallStatus('called_no_answer')
    setCallNotes('')
    setShowCallModal(true)
  }

  async function recordCall() {
    if (!selectedEnquiry) return

    const updates = {
      call_status: callStatus,
      call_attempts: (selectedEnquiry.call_attempts || 0) + 1,
      last_called_at: new Date().toISOString(),
      last_called_by: user.name,
      notes: callNotes || selectedEnquiry.notes,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('call_enquiries')
      .update(updates)
      .eq('id', selectedEnquiry.id)

    if (error) {
      alert('Error: ' + error.message)
    } else {
      await logAction(user, 'service_calls', `Call recorded: ${selectedEnquiry.customer_name} - ${callStatus}`)
      setShowCallModal(false)
      setCurrentPage(1)
      loadData()
    }
  }

  function openConfirmModal(enq) {
    setSelectedEnquiry(enq)
    setScheduledDate('')
    setShowConfirmModal(true)
  }

  async function confirmService() {
    if (!selectedEnquiry || !scheduledDate) {
      alert('Please select a scheduled date')
      return
    }

    const { error } = await supabase
      .from('call_enquiries')
      .update({
        call_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.name,
        scheduled_date: scheduledDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedEnquiry.id)

    if (error) {
      alert('Error: ' + error.message)
    } else {
      await logAction(user, 'service_calls', `Service confirmed: ${selectedEnquiry.customer_name} on ${scheduledDate}`)
      setShowConfirmModal(false)
      loadData()
    }
  }

  function openServiceModal(enq) {
    setSelectedEnquiry(enq)
    setServiceDate(enq.scheduled_date || new Date().toISOString().split('T')[0])
    setServiceAmount(0)
    setReceivedAmount(0)
    setSparesReplaced('')
    setShowServiceModal(true)
  }

  async function completeService() {
    if (!selectedEnquiry || !serviceDate) {
      alert('Please fill service date')
      return
    }

    // Create service_call record
    const serviceCall = {
      customer_id: selectedEnquiry.customer_id,
      call_datetime: new Date(serviceDate + 'T12:00:00').toISOString(),
      total_amount: Number(serviceAmount) || 0,
      received_amount: Number(receivedAmount) || 0,
      pending_amount: (Number(serviceAmount) || 0) - (Number(receivedAmount) || 0),
      payment_mode: 'CASH',
      admin_note: `Via call enquiry - ${selectedEnquiry.service_type}`,
      status: 'complete',
      completed_at: new Date().toISOString(),
      completed_by_name: user.name,
      spares_replaced: sparesReplaced,
      call_enquiry_id: selectedEnquiry.id,
      service_type: selectedEnquiry.service_type
    }

    const { data: newService, error: serviceError } = await supabase
      .from('service_calls')
      .insert([serviceCall])
      .select()
      .single()

    if (serviceError) {
      alert('Error creating service call: ' + serviceError.message)
      return
    }

    // The trigger will auto-update the call_enquiry and customer dates
    await logAction(user, 'service_calls', `Service completed: ${selectedEnquiry.customer_name} - ${selectedEnquiry.service_type}`)
    setShowServiceModal(false)
    loadData()
  }

  async function skipService(enq) {
    if (!confirm(`Mark this service as skipped?\n\nCustomer: ${enq.customer_name}\nService: ${enq.service_type}`)) return

    const { error } = await supabase
      .from('call_enquiries')
      .update({
        call_status: 'skipped',
        updated_at: new Date().toISOString()
      })
      .eq('id', enq.id)

    if (error) {
      alert('Error: ' + error.message)
    } else {
      await logAction(user, 'service_calls', `Service skipped: ${enq.customer_name} - ${enq.service_type}`)
      loadData()
    }
  }

  const getStatusColor = (status, dueDate) => {
    const isOverdue = new Date(dueDate) < new Date() && !['service_done', 'skipped'].includes(status)
    if (isOverdue) return 'red'
    if (status === 'pending') return 'red'
    if (['called_no_answer', 'called_callback'].includes(status)) return 'orange'
    if (status === 'confirmed') return 'yellow'
    if (status === 'service_done') return 'green'
    return 'gray'
  }

  // Filter enquiries
  const filtered = enquiries.filter(e => {
    // Stat filter
    if (statFilter === 'no-action' && e.call_status !== 'pending') return false
    if (statFilter === 'overdue' && (e.call_status === 'service_done' || e.call_status === 'skipped' || new Date(e.due_date) >= new Date())) return false
    if (statFilter === 'call-needed' && !['called_no_answer', 'called_callback'].includes(e.call_status)) return false
    if (statFilter === 'confirmed' && e.call_status !== 'confirmed') return false
    if (statFilter === 'completed' && e.call_status !== 'service_done') return false

    // Status filter
    if (filter === 'pending' && e.call_status !== 'pending') return false
    if (filter === 'overdue' && (e.call_status === 'service_done' || e.call_status === 'skipped' || new Date(e.due_date) >= new Date())) return false
    if (filter === 'confirmed' && e.call_status !== 'confirmed') return false
    if (filter === 'done' && e.call_status !== 'service_done') return false
    if (filter === 'called' && !['called_no_answer', 'called_callback'].includes(e.call_status)) return false

    // Color filter
    if (colorFilter !== 'all') {
      const statusColor = getStatusColor(e.call_status, e.due_date)
      if (colorFilter === 'red' && statusColor !== 'red') return false
      if (colorFilter === 'orange' && statusColor !== 'orange') return false
      if (colorFilter === 'yellow' && statusColor !== 'yellow') return false
      if (colorFilter === 'green' && statusColor !== 'green') return false
    }

    // Service type filter
    if (serviceTypeFilter !== 'all' && e.service_type !== serviceTypeFilter) return false

    // Search filter
    if (searchTerm && !e.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) 
        && !e.customer_mobile?.includes(searchTerm)) return false

    return true
  })

  // Pagination
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedEnquiries = filtered.slice(startIndex, endIndex)

  // Stats
  const stats = {
    total: enquiries.length,
    pending: enquiries.filter(e => e.call_status === 'pending').length,
    overdue: enquiries.filter(e => 
      !['service_done', 'skipped'].includes(e.call_status) && 
      new Date(e.due_date) < new Date()
    ).length,
    confirmed: enquiries.filter(e => e.call_status === 'confirmed').length,
    done: enquiries.filter(e => e.call_status === 'service_done').length,
    noAnswer: enquiries.filter(e => e.call_status === 'called_no_answer').length,
  }

  const StatusBadge = ({ status, dueDate }) => {
    const isOverdue = new Date(dueDate) < new Date() && !['service_done', 'skipped'].includes(status)
    
    const configs = {
      pending:          { label: 'No Action Yet', color: 'bg-red-100 text-red-700', icon: '🔴', definition: 'No call made' },
      called_no_answer: { label: 'Follow Up Needed', color: 'bg-orange-100 text-orange-700', icon: '🟠', definition: 'Called, need follow up' },
      called_callback:  { label: 'Follow Up Needed', color: 'bg-orange-100 text-orange-700', icon: '🟠', definition: 'Customer will call back' },
      confirmed:        { label: 'Confirmed', color: 'bg-yellow-100 text-yellow-700', icon: '🟡', definition: 'Agreed, awaiting completion' },
      service_done:     { label: 'Completed', color: 'bg-green-100 text-green-700', icon: '🟢', definition: 'Service completed' },
      skipped:          { label: 'Skipped', color: 'bg-gray-200 text-gray-500', icon: '⚪', definition: 'Customer declined' }
    }

    const config = configs[status] || configs.pending
    
    if (isOverdue) {
      return <span className="badge bg-red-200 text-red-800 text-xs font-semibold">🔴 OVERDUE</span>
    }

    return (
      <span className={`badge ${config.color} text-xs font-semibold`}>
        {config.icon} {config.label}
      </span>
    )
  }

  const ServiceTypeLabel = ({ type }) => {
    const labels = {
      general_service: { label: 'General Service', color: 'text-blue-600', icon: '🔧' },
      inline_set: { label: 'Inline Set', color: 'text-purple-600', icon: '🔄' },
      membrane: { label: 'Membrane', color: 'text-red-600', icon: '💧' },
      other: { label: 'Other', color: 'text-gray-600', icon: '📝' }
    }
    const l = labels[type] || labels.other
    return <span className={`font-medium ${l.color}`}>{l.icon} {l.label}</span>
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading service calls...</div>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Service Call Enquiries</h1>
        <button className="btn btn-sm bg-blue-500 text-white" onClick={generateEnquiries}>
          + Generate New Enquiries
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <button 
          className={`card text-center py-2 cursor-pointer transition ${statFilter === 'all' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'}`}
          onClick={() => { setStatFilter('all'); setCurrentPage(1) }}
        >
          <div className="text-xl font-bold text-gray-800">{stats.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </button>
        <button 
          className={`card text-center py-2 cursor-pointer transition ${statFilter === 'no-action' ? 'ring-2 ring-red-500 bg-red-100' : 'bg-red-50 hover:bg-red-100'}`}
          onClick={() => { setStatFilter('no-action'); setCurrentPage(1) }}
        >
          <div className="text-xl font-bold text-red-700">{stats.pending}</div>
          <div className="text-xs text-gray-500">No Action</div>
        </button>
        <button 
          className={`card text-center py-2 cursor-pointer transition ${statFilter === 'overdue' ? 'ring-2 ring-red-600 bg-red-200' : 'bg-red-100 hover:bg-red-150'}`}
          onClick={() => { setStatFilter('overdue'); setCurrentPage(1) }}
        >
          <div className="text-xl font-bold text-red-700">{stats.overdue}</div>
          <div className="text-xs text-gray-500">Overdue</div>
        </button>
        <button 
          className={`card text-center py-2 cursor-pointer transition ${statFilter === 'call-needed' ? 'ring-2 ring-orange-500 bg-orange-100' : 'bg-orange-50 hover:bg-orange-100'}`}
          onClick={() => { setStatFilter('call-needed'); setCurrentPage(1) }}
        >
          <div className="text-xl font-bold text-orange-700">{stats.noAnswer}</div>
          <div className="text-xs text-gray-500">Call Needed</div>
        </button>
        <button 
          className={`card text-center py-2 cursor-pointer transition ${statFilter === 'confirmed' ? 'ring-2 ring-yellow-500 bg-yellow-100' : 'bg-yellow-50 hover:bg-yellow-100'}`}
          onClick={() => { setStatFilter('confirmed'); setCurrentPage(1) }}
        >
          <div className="text-xl font-bold text-yellow-700">{stats.confirmed}</div>
          <div className="text-xs text-gray-500">Confirmed</div>
        </button>
        <button 
          className={`card text-center py-2 cursor-pointer transition ${statFilter === 'completed' ? 'ring-2 ring-green-500 bg-green-100' : 'bg-green-50 hover:bg-green-100'}`}
          onClick={() => { setStatFilter('completed'); setCurrentPage(1) }}
        >
          <div className="text-xl font-bold text-green-700">{stats.done}</div>
          <div className="text-xs text-gray-500">Completed</div>
        </button>
      </div>

      {/* Status Legend */}
      <div className="card mb-4 bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500">
        <h3 className="font-bold text-blue-900 mb-3">Status Color Guide</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex gap-3 items-start">
            <div className="bg-red-100 text-red-700 px-3 py-1 rounded font-bold">🔴 RED</div>
            <div className="text-sm text-gray-700">
              <div className="font-semibold text-red-700">No Action Yet</div>
              <div className="text-gray-600">No call has been made to this customer</div>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="bg-orange-100 text-orange-700 px-3 py-1 rounded font-bold">🟠 ORANGE</div>
            <div className="text-sm text-gray-700">
              <div className="font-semibold text-orange-700">Follow Up Needed</div>
              <div className="text-gray-600">Call was made but needs follow-up action</div>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded font-bold">🟡 YELLOW</div>
            <div className="text-sm text-gray-700">
              <div className="font-semibold text-yellow-700">Confirmed</div>
              <div className="text-gray-600">Customer agreed to service but not yet completed</div>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="bg-green-100 text-green-700 px-3 py-1 rounded font-bold">🟢 GREEN</div>
            <div className="text-sm text-gray-700">
              <div className="font-semibold text-green-700">Completed</div>
              <div className="text-gray-600">Service has been completed for this customer</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Search customer name or mobile..."
            className="input flex-1 min-w-[200px]"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          
          <select className="input w-auto" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="called">Called</option>
            <option value="overdue">Overdue</option>
            <option value="confirmed">Confirmed</option>
            <option value="done">Done</option>
          </select>

          <select className="input w-auto" value={colorFilter} onChange={e => setColorFilter(e.target.value)}>
            <option value="all">All Colors</option>
            <option value="red">🔴 Red - No Action</option>
            <option value="orange">🟠 Orange - Follow Up</option>
            <option value="yellow">🟡 Yellow - Confirmed</option>
            <option value="green">🟢 Green - Completed</option>
          </select>

          <select className="input w-auto" value={serviceTypeFilter} onChange={e => setServiceTypeFilter(e.target.value)}>
            <option value="all">All Services</option>
            <option value="general_service">General Service</option>
            <option value="inline_set">Inline Set</option>
            <option value="membrane">Membrane</option>
          </select>

          <button className="btn btn-sm" onClick={() => { setSearchTerm(''); setFilter('all'); setColorFilter('all'); setServiceTypeFilter('all'); setStatFilter('all'); }}>
            Clear
          </button>
        </div>
      </div>

      {/* Enquiries table */}
      <div className="card overflow-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {searchTerm || filter !== 'all' || serviceTypeFilter !== 'all' 
              ? 'No enquiries match filters'
              : 'No service call enquiries yet. Click "Generate New Enquiries" to create them.'}
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Due Date</th>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Area</th>
                  <th>Service Type</th>
                  <th>Status</th>
                  <th>Last Called</th>
                  <th>Attempts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEnquiries.map(enq => {
                  const isOverdue = new Date(enq.due_date) < new Date() && !['service_done', 'skipped'].includes(enq.call_status)
                  const daysUntil = Math.floor((new Date(enq.due_date) - new Date()) / (1000 * 60 * 60 * 24))
                  
                  // Determine row background color based on status
                  let rowBgColor = ''
                  if (isOverdue) {
                    rowBgColor = 'bg-red-100' // Red for overdue
                  } else if (enq.call_status === 'service_done') {
                    rowBgColor = 'bg-green-50' // Green for completed
                  } else if (['called_no_answer', 'called_callback'].includes(enq.call_status)) {
                    rowBgColor = 'bg-orange-50' // Orange for follow up
                  } else if (enq.call_status === 'confirmed') {
                    rowBgColor = 'bg-yellow-50' // Yellow for confirmed
                  } else if (enq.call_status === 'pending') {
                    rowBgColor = 'bg-red-50' // Red for no action
                  }
                  
                  return (
                    <tr key={enq.id} className={rowBgColor}>
                      <td>
                        <div className="font-medium">{fmtD(enq.due_date)}</div>
                        <div className={`text-xs ${isOverdue ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                          {isOverdue ? `${Math.abs(daysUntil)} days overdue` : daysUntil > 0 ? `in ${daysUntil} days` : 'today'}
                        </div>
                      </td>
                      <td className="font-medium">{enq.customer_name}</td>
                      <td className="text-gray-600">{enq.customer_mobile}</td>
                      <td className="text-gray-500 text-xs">{enq.customer_area}</td>
                      <td><ServiceTypeLabel type={enq.service_type} /></td>
                      <td><StatusBadge status={enq.call_status} dueDate={enq.due_date} /></td>
                      <td className="text-xs text-gray-500">
                        {enq.last_called_at ? fmt12(enq.last_called_at) : '−'}
                      </td>
                      <td className="text-center">
                        <span className={`badge ${enq.call_attempts > 2 ? 'badge-danger' : 'badge-gray'}`}>
                          {enq.call_attempts || 0}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {enq.call_status === 'pending' && (
                            <button className="btn btn-xs bg-blue-500 text-white" onClick={() => openCallModal(enq)}>
                              📞 Call
                            </button>
                          )}
                          {['called_no_answer', 'called_callback'].includes(enq.call_status) && (
                            <>
                              <button className="btn btn-xs bg-blue-500 text-white" onClick={() => openCallModal(enq)}>
                                📞 Retry
                              </button>
                              <button className="btn btn-xs bg-green-500 text-white" onClick={() => openConfirmModal(enq)}>
                                ✓ Confirm
                              </button>
                            </>
                          )}
                          {enq.call_status === 'confirmed' && (
                            <button className="btn btn-xs bg-green-600 text-white" onClick={() => openServiceModal(enq)}>
                              ✓ Complete
                            </button>
                          )}
                          {!['service_done', 'skipped'].includes(enq.call_status) && (
                            <button className="btn btn-xs bg-gray-400 text-white" onClick={() => skipService(enq)}>
                              Skip
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1} to {Math.min(endIndex, filtered.length)} of {filtered.length} enquiries
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Previous
                  </button>
                  <div className="flex items-center gap-2 px-3">
                    <span className="text-sm font-medium">{currentPage} / {totalPages}</span>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Call Modal */}
      {showCallModal && selectedEnquiry && (
        <Modal title="Record Call" onClose={() => setShowCallModal(false)}>
          <div className="space-y-3">
            <div>                                                                                                                                                                               
              <div className="font-medium mb-1">{selectedEnquiry.customer_name}</div>
              <div className="text-sm text-gray-600">
                {selectedEnquiry.customer_mobile} • {selectedEnquiry.customer_area}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                <ServiceTypeLabel type={selectedEnquiry.service_type} /> due {fmtD(selectedEnquiry.due_date)}
              </div>
            </div>

            <div>
              <label className="label">Call Result</label>
              <select className="input" value={callStatus} onChange={e => setCallStatus(e.target.value)}>
                <option value="called_no_answer">📵 No answer / Not reachable</option>
                <option value="called_callback">📞 Will call back / Need to follow up</option>
                <option value="confirmed">✓ Service confirmed (proceed to schedule)</option>
                <option value="skipped">− Customer declined / Not needed</option>
              </select>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={3}
                value={callNotes}
                onChange={e => setCallNotes(e.target.value)}
                placeholder="Call notes, customer feedback, issues mentioned..."
              />
            </div>
          </div>

          <ModalFooter>
            <button className="btn" onClick={() => setShowCallModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={recordCall}>Save Call Record</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Confirm Service Modal */}
      {showConfirmModal && selectedEnquiry && (
        <Modal title="Confirm Service Appointment" onClose={() => setShowConfirmModal(false)}>
          <div className="space-y-3">
            <div>
              <div className="font-medium mb-1">{selectedEnquiry.customer_name}</div>
              <div className="text-sm text-gray-600">
                <ServiceTypeLabel type={selectedEnquiry.service_type} />
              </div>
            </div>

            <div>
              <label className="label">Scheduled Date</label>
              <input
                type="date"
                className="input"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <ModalFooter>
            <button className="btn" onClick={() => setShowConfirmModal(false)}>Cancel</button>
            <button className="btn btn-primary bg-green-500" onClick={confirmService}>
              ✓ Confirm Service
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Complete Service Modal */}
      {showServiceModal && selectedEnquiry && (
        <Modal title="Complete Service" onClose={() => setShowServiceModal(false)}>
          <div className="space-y-3">
            <div>
              <div className="font-medium mb-1">{selectedEnquiry.customer_name}</div>
              <div className="text-sm text-gray-600">
                <ServiceTypeLabel type={selectedEnquiry.service_type} />
              </div>
            </div>

            <div>
              <label className="label">Service Date</label>
              <input
                type="date"
                className="input"
                value={serviceDate}
                onChange={e => setServiceDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Total Amount (₹)</label>
                <input
                  type="number"
                  className="input"
                  value={serviceAmount}
                  onChange={e => setServiceAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Received Amount (₹)</label>
                <input
                  type="number"
                  className="input"
                  value={receivedAmount}
                  onChange={e => setReceivedAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Spares Replaced</label>
              <textarea
                className="input"
                rows={2}
                value={sparesReplaced}
                onChange={e => setSparesReplaced(e.target.value)}
                placeholder="List parts replaced (e.g., 250 SPUN Filter, CTO Filter)"
              />
            </div>

            {serviceAmount > 0 && (
              <div className="bg-yellow-50 p-2 rounded text-xs">
                <div className="font-medium">Pending: ₹{(Number(serviceAmount) - Number(receivedAmount)).toFixed(2)}</div>
              </div>
            )}
          </div>

          <ModalFooter>
            <button className="btn" onClick={() => setShowServiceModal(false)}>Cancel</button>
            <button className="btn btn-primary bg-green-600" onClick={completeService}>
              ✓ Complete Service
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}