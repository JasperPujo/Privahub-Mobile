import React from 'react'
import { X, Check, AlertTriangle, Info } from '@/utils/icons'
import { useAppStore } from '@/store'

const getIcon = (type: string) => {
  switch (type) {
    case 'success': return <Check size={18} className="text-green-500" />
    case 'error': return <AlertTriangle size={18} className="text-red-500" />
    case 'warning': return <AlertTriangle size={18} className="text-yellow-500" />
    default: return <Info size={18} className="text-blue-500" />
  }
}

const getBg = (type: string) => {
  switch (type) {
    case 'success': return 'bg-green-50 border-green-200'
    case 'error': return 'bg-red-50 border-red-200'
    case 'warning': return 'bg-yellow-50 border-yellow-200'
    default: return 'bg-blue-50 border-blue-200'
  }
}

const Notification: React.FC = () => {
  const { notifications, removeNotification } = useAppStore()

  return (
    <div className="fixed top-10 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-sm ${getBg(n.type)}`}
          style={{ animation: 'slideIn 0.3s ease-out' }}
        >
          {getIcon(n.type)}
          <span className="text-sm text-[#333] flex-1">{n.message}</span>
          <button
            onClick={() => removeNotification(n.id)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(100px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

export default Notification
