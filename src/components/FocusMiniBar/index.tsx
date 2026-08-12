import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusStore } from '@/store/focusStore'
import { Pause, Play, X } from '@/utils/icons'

const FocusMiniBar: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = useFocusStore((s) => s.isActive)
  const isRunning = useFocusStore((s) => s.isRunning)
  const elapsed = useFocusStore((s) => s.elapsed)
  const mode = useFocusStore((s) => s.mode)
  const isRest = useFocusStore((s) => s.isRest)
  const focusTheme = useFocusStore((s) => s.focusTheme)
  const miniBarVisible = useFocusStore((s) => s.miniBarVisible)
  const setRunning = useFocusStore((s) => s.setRunning)
  const setMiniBarVisible = useFocusStore((s) => s.setMiniBarVisible)

  if (location.pathname === '/focus') return null
  if (!isActive || (!isRunning && elapsed === 0)) return null
  if (!miniBarVisible) return null

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const modeLabel = mode === 'pomodoro' ? (isRest ? '休息' : '番茄钟') : mode === 'countDown' ? '倒计时' : '正计时'
  const accentColor = isRest ? '#22c55e' : '#7c3aed'

  const handleToggleRunning = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setRunning(!isRunning)
  }

  const handleClose = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setMiniBarVisible(false)
  }

  const handleNavigate = () => {
    navigate('/focus')
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 select-none"
      >
        <div
          className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-2xl shadow-xl border border-white/20 cursor-pointer transition-transform hover:scale-105 backdrop-blur-md"
          style={{ backgroundColor: accentColor + 'F0' }}
          onClick={handleNavigate}
        >
          {/* 计时器图标 */}
          <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/20 pointer-events-none">
            <span className="text-white text-sm md:text-lg font-bold">{isRest ? '🌿' : '🎯'}</span>
          </div>

          {/* 计时信息 */}
          <div className="flex flex-col min-w-[70px] md:min-w-[80px] pointer-events-none">
            <span className="text-white/80 text-[10px] md:text-xs truncate">{modeLabel} · {focusTheme}</span>
            <span className="text-white text-base md:text-xl font-bold tabular-nums leading-tight">
              {formatTime(elapsed)}
            </span>
          </div>

          {/* 暂停/播放按钮 */}
          <button
            onPointerDown={handleToggleRunning}
            className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-full bg-white/25 hover:bg-white/40 active:scale-90 transition-all relative z-10"
            title={isRunning ? '暂停' : '继续'}
          >
            {isRunning ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white" />}
          </button>

          {/* 关闭按钮 - 隐藏悬浮窗 */}
          <button
            onPointerDown={handleClose}
            className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/20 hover:bg-white/35 active:scale-90 transition-all relative z-10"
            title="隐藏悬浮窗"
          >
            <X size={14} className="text-white" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default FocusMiniBar