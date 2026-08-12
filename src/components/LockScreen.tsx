import React, { useState } from 'react'
import { useAppStore } from '@/store'
import { Lock, Unlock } from '@/utils/icons'

const LockScreen: React.FC = () => {
  const { unlockApp, lockScreen, addNotification } = useAppStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleUnlock = () => {
    if (!password.trim()) {
      setError('请输入密码')
      return
    }

    const success = unlockApp(password)
    if (success) {
      setPassword('')
      setError('')
      addNotification({ message: '已解锁', type: 'success' })
    } else {
      if (lockScreen.lockUntil && Date.now() < lockScreen.lockUntil) {
        const remaining = Math.ceil((lockScreen.lockUntil - Date.now()) / 1000 / 60)
        setError(`已锁定，请 ${remaining} 分钟后重试`)
      } else {
        const remaining = 5 - lockScreen.failedAttempts
        setError(`密码错误，还剩 ${remaining} 次机会`)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock()
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg-primary)] flex items-center justify-center">
      <div className="w-full max-w-sm mx-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-card bg-primary-600 flex items-center justify-center mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">工作台已锁定</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">请输入锁屏密码解锁</p>
        </div>

        <div className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入锁屏密码"
            className="input-dark text-center"
            autoFocus
          />

          {error && (
            <p className="text-sm text-danger text-center">{error}</p>
          )}

          <button
            onClick={handleUnlock}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Unlock size={18} />
            解锁
          </button>
        </div>
      </div>
    </div>
  )
}

export default LockScreen
