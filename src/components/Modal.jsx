export default function Modal({ title, onClose, children, size = 'md' }) {
  const sizes = { sm:'max-w-sm', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-3xl' }
  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-10 z-50 px-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-xl border border-gray-100 p-5 w-full ${sizes[size]} mb-10`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-sm">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ModalFooter({ children }) {
  return <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-gray-100">{children}</div>
}
