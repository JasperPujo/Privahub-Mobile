import React from 'react'
import { AlertTriangle } from '@/utils/icons'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  type = 'warning'
}) => {
  if (!isOpen) return null

  const confirmBtnClass = type === 'danger'
    ? 'btn-danger'
    : type === 'warning'
      ? 'btn-primary bg-warning hover:bg-warning/90'
      : 'btn-primary'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 overflow-y-auto">
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-button ${type === 'danger' ? 'bg-red-50 dark:bg-red-950/30 text-danger' : 'bg-amber-50 dark:bg-amber-950/30 text-warning'}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{title}</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{message}</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6">
            <button onClick={onClose} className="btn-secondary">
              {cancelText}
            </button>
            <button onClick={onConfirm} className={confirmBtnClass}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
