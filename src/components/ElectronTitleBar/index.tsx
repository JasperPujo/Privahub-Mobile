import React from 'react'
import appIcon from '@/assets/app-icon.png'

declare global {
  interface Window {
    electronAPI?: {
      minimizeWindow?: () => Promise<void>
      maximizeWindow?: () => Promise<void>
      closeWindow?: () => Promise<void>
      [key: string]: any
    }
  }
}

const ElectronTitleBar: React.FC = () => {
  const isElectron = !!(window as any).electronAPI

  if (!isElectron) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-8 flex items-center justify-between select-none"
      style={{ background: 'var(--bg-secondary, #f3f4f6)', borderBottom: '1px solid var(--border-color, #e5e7eb)', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center px-3 gap-2">
        <img src={appIcon} alt="PrivaHub" className="w-5 h-5 rounded" />
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary, #6b7280)' }}>PrivaHub</span>
      </div>
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => (window as any).electronAPI?.minimizeWindow?.()}
          className="w-12 h-8 flex items-center justify-center transition-colors hover:bg-black/5"
          title="最小化"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
            <rect width="10" height="1" fill="#666" />
          </svg>
        </button>
        <button
          onClick={() => (window as any).electronAPI?.maximizeWindow?.()}
          className="w-12 h-8 flex items-center justify-center transition-colors hover:bg-black/5"
          title="最大化"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="#666" strokeWidth="1" fill="none" />
          </svg>
        </button>
        <button
          onClick={() => (window as any).electronAPI?.closeWindow?.()}
          className="w-12 h-8 flex items-center justify-center transition-colors hover:bg-red-500"
          title="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="1" y1="1" x2="9" y2="9" stroke="#666" strokeWidth="1" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="#666" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default ElectronTitleBar
