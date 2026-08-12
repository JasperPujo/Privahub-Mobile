import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from '@/utils/icons'
import appIcon from '@/assets/app-icon.png'

export interface ReminderItem {
  id: string
  type: 'task' | 'schedule' | 'habit'
  title: string
  content: string
  startTime?: string
  endTime?: string
}

interface ReminderPopupProps {
  reminders: ReminderItem[]
  onDismiss: (id: string) => void
}

/** 播放短促提示音 */
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch (e) {
    // 静默失败
  }
}

const formatDateTime = (iso?: string) => {
  if (!iso) return ''
  const str = String(iso)
  const tIdx = str.indexOf('T')
  if (tIdx < 0) return str
  const datePart = str.substring(0, tIdx)
  const timePart = str.substring(tIdx + 1, tIdx + 6)
  const parts = datePart.split('-')
  if (parts.length < 3) return str
  return `${parseInt(parts[1])}/${parseInt(parts[2])} ${timePart}`
}

const ReminderPopup: React.FC<ReminderPopupProps> = ({ reminders, onDismiss }) => {
  const playedRef = useRef<Set<string>>(new Set())

  // 新提醒出现时播放提示音
  useEffect(() => {
    reminders.forEach(r => {
      if (!playedRef.current.has(r.id)) {
        playedRef.current.add(r.id)
        playBeep()
      }
    })
  }, [reminders])

  // 清理已关闭的记录
  useEffect(() => {
    const currentIds = new Set(reminders.map(r => r.id))
    playedRef.current.forEach(id => {
      if (!currentIds.has(id)) playedRef.current.delete(id)
    })
  }, [reminders])

  const typeLabel: Record<string, string> = {
    task: '待办提醒',
    schedule: '日程提醒',
    habit: '习惯提醒',
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {reminders.map(reminder => (
          <motion.div
            key={reminder.id}
            initial={{ opacity: 0, x: 300, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 300, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="rounded-xl shadow-xl overflow-hidden border border-[var(--border-color)]"
            style={{ background: 'var(--bg-secondary)', minWidth: 280, maxWidth: 360 }}
          >
            {/* 顶部条 */}
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#6B4C9A' }}>
              <img src={appIcon} alt="PrivaHub" className="w-4 h-4 rounded" />
              <Bell size={13} className="text-white" />
              <span className="text-xs font-medium text-white">{typeLabel[reminder.type] || '提醒'}</span>
              <span className="text-[10px] text-white/70 ml-auto">PrivaHub</span>
            </div>

            {/* 内容 */}
            <div className="px-3 py-2.5">
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{reminder.title}</h4>
              {reminder.content && (
                <p className="text-xs text-[var(--text-secondary)] mb-1.5 line-clamp-2">{reminder.content}</p>
              )}
              {/* 时间信息 */}
              {(reminder.startTime || reminder.endTime) && (
                <div className="text-[11px] text-[var(--text-tertiary)] space-y-0.5">
                  {reminder.startTime && <div>开始：{formatDateTime(reminder.startTime)}</div>}
                  {reminder.endTime && <div>结束：{formatDateTime(reminder.endTime)}</div>}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="flex border-t border-[var(--border-color)]">
              <button
                onClick={() => onDismiss(reminder.id)}
                className="flex-1 py-2 text-sm font-medium text-white transition-colors"
                style={{ background: '#6B4C9A' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#5a3f85')}
                onMouseLeave={e => (e.currentTarget.style.background = '#6B4C9A')}
              >
                确定
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default ReminderPopup
