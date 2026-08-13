import React from 'react'
import { createPortal } from 'react-dom'
import { X } from '@/utils/icons'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl'
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, size = 'md' }) => {
  if (!isOpen) return null

  // 使用 Portal 渲染到 document.body，避免父级 transform 破坏 fixed 定位
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4">
      {/* 遮罩 - 不响应点击，防止误触关闭导致数据丢失 */}
      <div className="absolute inset-0 bg-black/50" />
      {/* 模态框主体 */}
      <div
        className={`relative bg-[var(--bg-primary)] rounded-t-2xl md:rounded-card shadow-xl ${sizeClasses[size]} w-full max-h-[85vh] flex flex-col`}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 移动端拖拽指示条 */}
        <div className="flex justify-center pt-2 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
        </div>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 md:px-6 py-4 md:py-4 border-b border-[var(--border-color)] flex-shrink-0">
          <h3 className="text-lg md:text-lg font-medium text-[var(--text-primary)]">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {/* 内容区 - 可滚动 */}
        <div className="px-5 md:px-6 py-4 md:py-4 overflow-y-auto flex-1">
          {children}
        </div>
        {/* 底部按钮区 - 固定 */}
        {footer && (
          <div className="px-5 md:px-6 py-4 md:py-4 border-t border-[var(--border-color)] flex items-center justify-end gap-2 md:gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default Modal
