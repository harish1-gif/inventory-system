import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Modal, { ModalFooter } from '../components/Modal'

export default function Settings() {
  const { user } = useAuth()
  const [targets, setTargets] = useState({ b2c: '', b2b: '' })
  const [editModal, setEditModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const canEdit = user.role === 'admin'

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['b2c_monthly_target', 'b2b_monthly_target'])

    if (data) {
      const settingsMap = {}
      data.forEach(item => {
        if (item.key === 'b2c_monthly_target') settingsMap.b2c = item.value
        if (item.key === 'b2b_monthly_target') settingsMap.b2b = item.value
      })
      setTargets(settingsMap)
    }
  }

  async function saveTargets() {
    if (!targets.b2c || !targets.b2b) {
      setMessage('❌ Both targets are required')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      // Update B2C target
      await supabase
        .from('app_settings')
        .update({ value: targets.b2c })
        .eq('key', 'b2c_monthly_target')

      // Update B2B target
      await supabase
        .from('app_settings')
        .update({ value: targets.b2b })
        .eq('key', 'b2b_monthly_target')

      setMessage('✅ Monthly targets updated successfully!')
      setEditModal(false)
      load()
    } catch (error) {
      setMessage('❌ Error updating targets: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Settings</h1>
        {canEdit && (
          <button className="btn-primary btn-sm rounded-lg" onClick={() => setEditModal(true)}>
            ✎ Edit Targets
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* B2C Target Card */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              B2C
            </div>
            <h2 className="text-lg font-semibold text-gray-800">B2C Monthly Target</h2>
          </div>
          <div className="text-3xl font-bold text-blue-600 mb-2">
            ₹{Number(targets.b2c || 0).toLocaleString('en-IN')}
          </div>
          <p className="text-xs text-gray-600">Retail consumer business monthly revenue target</p>
        </div>

        {/* B2B Target Card */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              B2B
            </div>
            <h2 className="text-lg font-semibold text-gray-800">B2B Monthly Target</h2>
          </div>
          <div className="text-3xl font-bold text-purple-600 mb-2">
            ₹{Number(targets.b2b || 0).toLocaleString('en-IN')}
          </div>
          <p className="text-xs text-gray-600">Commercial business monthly revenue target</p>
        </div>
      </div>

      {/* Combined Target */}
      <div className="mt-6 bg-white border border-gray-100 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">Total Monthly Target</h3>
        <div className="text-4xl font-bold text-gray-800">
          ₹{(Number(targets.b2c || 0) + Number(targets.b2b || 0)).toLocaleString('en-IN')}
        </div>
        <p className="text-xs text-gray-500 mt-2">Combined B2C + B2B target</p>
      </div>

      {/* Edit Modal */}
      {editModal && (
        <Modal title="Edit Monthly Targets" onClose={() => { setEditModal(false); setMessage('') }} size="md">
          <div className="space-y-4">
            {message && (
              <div className={`p-3 rounded-lg text-sm ${message.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message}
              </div>
            )}

            <div>
              <label className="label">B2C Monthly Target</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">₹</span>
                <input
                  type="number"
                  className="input flex-1"
                  placeholder="Enter B2C target"
                  value={targets.b2c}
                  onChange={e => setTargets(t => ({ ...t, b2c: e.target.value }))}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Retail consumer business monthly revenue</p>
            </div>

            <div>
              <label className="label">B2B Monthly Target</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">₹</span>
                <input
                  type="number"
                  className="input flex-1"
                  placeholder="Enter B2B target"
                  value={targets.b2b}
                  onChange={e => setTargets(t => ({ ...t, b2b: e.target.value }))}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Commercial business monthly revenue</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                <strong>Combined Total:</strong> ₹{(Number(targets.b2c || 0) + Number(targets.b2b || 0)).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <ModalFooter>
            <button className="btn" onClick={() => { setEditModal(false); setMessage('') }} disabled={loading}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={saveTargets} disabled={loading}>
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
