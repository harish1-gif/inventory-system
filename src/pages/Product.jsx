import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { format } from 'date-fns'
import Modal, { ModalFooter } from '../components/Modal'

export default function Product() {
  const { user } = useAuth()
  const { business } = useBusiness()
  const [products, setProducts] = useState([])
  const [addModal, setAddModal] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [viewModal, setViewModal] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const fileRef = useRef(null)
  const canEdit = user.role === 'admin' || user.role === 'manager'

  const [productType, setProductType] = useState('spare')
  const [form, setForm] = useState({
    name: '', model: '', description: '',
    category: '', price: '', imageFile: null, type: '',
  })

  const [editForm, setEditForm] = useState({
    id: '', name: '', model: '', description: '',
    category: '', price: '', imageFile: null, type: '',
  })

  useEffect(() => { load() }, [business])

  async function load() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('type', business)
      .order('price', { ascending: false })
      .order('created_at', { ascending: false })
    setProducts(data || [])
  }

  const filteredByType = products.filter(p => productType === 'spare' ? p.category !== 'Purifier' : p.category === 'Purifier')

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setForm(f => ({ ...f, imageFile: file }))
    setImagePreview(URL.createObjectURL(file))
  }

  async function uploadImage(file) {
    if (!file) return null
    const ext = file.name.split('.').pop()
    const path = `products/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (error) { console.error('Image upload error:', error); return null }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function save() {
    if (!form.name || !form.model) return
    setUploading(true)
    const imageUrl = form.imageFile ? await uploadImage(form.imageFile) : null
    const category = productType === 'purifier' ? 'Purifier' : form.category
    await supabase.from('products').insert({
      type: business,
      name: form.name,
      model: form.model,
      description: form.description,
      category: category,
      price: Number(form.price),
      image_url: imageUrl,
    })
    await supabase.from('update_log').insert({
      by_user_id: user.id, by_name: user.name, by_role: user.role,
      category: 'product', description: `New ${productType} added: ${form.name} (${business.toUpperCase()})`
    })
    setUploading(false)
    setAddModal(false)
    setImagePreview(null)
    setForm({ name: '', model: '', description: '', category: '', price: '', imageFile: null, type: '' })
    load()
  }

  async function uploadImageForExisting(productId) {
    const file = fileRef.current?.files[0]
    if (!file) return
    setUploading(true)
    const url = await uploadImage(file)
    if (url) {
      await supabase.from('products').update({ image_url: url }).eq('id', productId)
      await load()
      const updated = (await supabase.from('products').select('*').eq('id', productId).single()).data
      setViewModal(updated)
    }
    setUploading(false)
  }

  // UPDATE - Edit existing product
  async function openEditModal(product) {
    const pType = product.category === 'Purifier' ? 'purifier' : 'spare'
    setProductType(pType)
    setEditForm({
      id: product.id,
      name: product.name,
      model: product.model,
      description: product.description,
      category: product.category,
      price: product.price,
      imageFile: null,
      type: pType,
    })
    setImagePreview(product.image_url || null)
    setEditModal(true)
    setViewModal(null)
  }

  async function updateProduct() {
    if (!editForm.name || !editForm.model) return
    setUploading(true)
    let imageUrl = editForm.imageFile ? await uploadImage(editForm.imageFile) : null
    const category = productType === 'purifier' ? 'Purifier' : editForm.category
    const updateData = {
      name: editForm.name,
      model: editForm.model,
      description: editForm.description,
      category: category,
      price: Number(editForm.price),
    }
    if (imageUrl) updateData.image_url = imageUrl
    await supabase.from('products').update(updateData).eq('id', editForm.id)
    await supabase.from('update_log').insert({
      by_user_id: user.id, by_name: user.name, by_role: user.role,
      category: 'product', description: `${productType} updated: ${editForm.name}`
    })
    setUploading(false)
    setEditModal(false)
    setImagePreview(null)
    setEditForm({ id: '', name: '', model: '', description: '', category: '', price: '', imageFile: null, type: '' })
    load()
  }

  // DELETE - Remove product
  async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return
    setUploading(true)
    await supabase.from('products').delete().eq('id', productId)
    await supabase.from('update_log').insert({
      by_user_id: user.id, by_name: user.name, by_role: user.role,
      category: 'product', description: `Product deleted from ${business.toUpperCase()}`
    })
    setUploading(false)
    setViewModal(null)
    load()
  }

  function handleEditFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setEditForm(f => ({ ...f, imageFile: file }))
    setImagePreview(URL.createObjectURL(file))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title mb-0">Product Management ({business.toUpperCase()})</h1>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 text-xs">
            {['spare', 'purifier'].map(t=>(productType===t?<button key={t} className="px-3 py-1 rounded bg-brand text-white">{t.charAt(0).toUpperCase()+t.slice(1)}s</button>:<button key={t} onClick={()=>setProductType(t)} className="px-3 py-1 text-gray-500 hover:bg-gray-50">{t.charAt(0).toUpperCase()+t.slice(1)}s</button>))}
          </div>
          {canEdit && (
            <button className="btn-primary btn-sm rounded-lg" onClick={() => { setImagePreview(null); setAddModal(true) }}>
              + Add {productType}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead><tr>
            <th className="th">Name</th><th className="th">Model</th><th className="th">Category</th>
            <th className="th">Price</th><th className="th">Image</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {filteredByType.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="td font-medium">{p.name}</td>
                <td className="td">
                  <span className="badge badge-blue">{p.model}</span>
                </td>
                <td className="td text-gray-400">{p.category}</td>
                <td className="td">₹{p.price}</td>
                <td className="td">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="w-10 h-8 object-cover rounded cursor-pointer border border-gray-100" onClick={() => setViewModal(p)}/>
                    : <span className="text-gray-300 text-xs">No image</span>
                  }
                </td>
                <td className="td">
                  <button className="text-blue-500 text-xs hover:underline" onClick={() => setViewModal(p)}>View</button>
                  {canEdit && (
                    <>
                      <span className="text-gray-300 mx-1">•</span>
                      <button className="text-amber-500 text-xs hover:underline" onClick={() => openEditModal(p)}>Edit</button>
                      <span className="text-gray-300 mx-1">•</span>
                      <button className="text-red-500 text-xs hover:underline" onClick={() => deleteProduct(p.id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add product modal */}
      {addModal && (
        <Modal title={`Add ${productType === 'purifier' ? 'Purifier' : 'Spare'}`} onClose={() => setAddModal(false)} size="lg">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Name</label><input className="input" placeholder="Product name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
              <div><label className="label">Model</label><input className="input" placeholder="Model number" value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))}/></div>
              {productType !== 'purifier' && (
                <div><label className="label">Category</label><input className="input" placeholder="Category" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/></div>
              )}
              <div><label className="label">Price</label><input type="number" className="input" placeholder="Price" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/></div>
            </div>
            <div><label className="label">Description</label><textarea className="input" rows="3" placeholder="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>

            {/* Image upload */}
            <div>
              <label className="label">Product photo <span className="text-gray-400 font-normal">(stored in Supabase Storage — optional)</span></label>
              <div
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-brand transition-colors"
                onClick={() => document.getElementById('productImg').click()}
              >
                {imagePreview
                  ? <img src={imagePreview} alt="preview" className="mx-auto h-32 object-cover rounded"/>
                  : <div className="text-gray-400 text-xs">Click to select photo (JPG / PNG / WEBP)</div>
                }
              </div>
              <input id="productImg" type="file" accept="image/*" className="hidden" onChange={handleFileChange}/>
            </div>
          </div>

          <ModalFooter>
            <button className="btn" onClick={() => setAddModal(false)}>Cancel</button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={save} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Save'}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Edit product modal */}
      {editModal && (
        <Modal title={`Edit ${editForm.category === 'Purifier' ? 'Purifier' : 'Spare'}`} onClose={() => setEditModal(false)} size="lg">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Name</label><input className="input" placeholder="Product name" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}/></div>
              <div><label className="label">Model</label><input className="input" placeholder="Model number" value={editForm.model} onChange={e=>setEditForm(f=>({...f,model:e.target.value}))}/></div>
              {editForm.category !== 'Purifier' && (
                <div><label className="label">Category</label><input className="input" placeholder="Category" value={editForm.category} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))}/></div>
              )}
              <div><label className="label">Price</label><input type="number" className="input" placeholder="Price" value={editForm.price} onChange={e=>setEditForm(f=>({...f,price:e.target.value}))}/></div>
            </div>
            <div><label className="label">Description</label><textarea className="input" rows="3" placeholder="Description" value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))}/></div>

            {/* Image upload for edit */}
            <div>
              <label className="label">Product photo <span className="text-gray-400 font-normal">(optional)</span></label>
              <div
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-brand transition-colors"
                onClick={() => document.getElementById('editProductImg').click()}
              >
                {imagePreview
                  ? <img src={imagePreview} alt="preview" className="mx-auto h-32 object-cover rounded"/>
                  : <div className="text-gray-400 text-xs">Click to select photo (JPG / PNG / WEBP)</div>
                }
              </div>
              <input id="editProductImg" type="file" accept="image/*" className="hidden" onChange={handleEditFileChange}/>
            </div>
          </div>

          <ModalFooter>
            <button className="btn" onClick={() => setEditModal(false)}>Cancel</button>
            <button className="btn-danger rounded-lg px-4 py-1.5 text-sm mr-auto" onClick={() => deleteProduct(editForm.id)}>
              Delete
            </button>
            <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={updateProduct} disabled={uploading}>
              {uploading ? 'Updating…' : 'Update'}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* View product modal */}
      {viewModal && (
        <Modal title={`${viewModal.name} — ${viewModal.model}`} onClose={() => setViewModal(null)} size="lg">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              {viewModal.image_url
                ? <img src={viewModal.image_url} alt={viewModal.name} className="w-full h-48 object-cover rounded-lg border border-gray-100"/>
                : (
                  <div className="w-full h-48 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2">
                    <div className="text-gray-400 text-xs">No photo uploaded</div>
                    {canEdit && (
                      <>
                        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>Upload photo</button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={() => uploadImageForExisting(viewModal.id)}/>
                      </>
                    )}
                  </div>
                )
              }
              {viewModal.image_url && canEdit && (
                <button className="btn btn-sm mt-2 w-full" onClick={() => fileRef.current?.click()}>
                  {uploading ? 'Uploading…' : 'Replace photo'}
                </button>
              )}
              {viewModal.image_url && canEdit && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={() => uploadImageForExisting(viewModal.id)}/>}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{viewModal.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Model</span>
                <span className="font-medium">{viewModal.model}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Category</span>
                <span>{viewModal.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Price</span>
                <span>₹{viewModal.price}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Description</span>
                <span>{viewModal.description}</span>
              </div>
            </div>
          </div>
          <ModalFooter>
            {canEdit && (
              <>
                <button className="btn-danger rounded-lg px-4 py-1.5 text-sm" onClick={() => deleteProduct(viewModal.id)}>
                  Delete
                </button>
                <button className="btn-primary rounded-lg px-4 py-1.5 text-sm" onClick={() => openEditModal(viewModal)}>
                  Edit
                </button>
              </>
            )}
            <button className="btn" onClick={() => setViewModal(null)}>Close</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}