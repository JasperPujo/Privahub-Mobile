import React, { useState } from 'react'
import { Bell, Clock, Check, X } from '@/utils/icons'

type ItemType = 'task' | 'schedule' | 'habit'

/**
 * 提醒设置组件 —— 多时间段 + 智能预设
 *
 * 数据格式：reminder_time 存储为 JSON 数组字符串
 * - habit: ["09:00", "21:00"]  每日重复
 * - task: ["2026-08-06T14:00", "2026-08-07T09:00"]  一次性
 * - schedule: 同 task，但预设按钮根据 start/end_time 自动计算
 *
 * 向后兼容：如果 reminder_time 不是 JSON 数组，按单值处理
 */
interface ReminderSettingsProps {
  enabled: boolean
  customTime: string        // JSON array string, e.g. '["09:00","21:00"]'
  minutes: number           // 保留兼容，新逻辑不用
  startTime?: string        // ISO string (schedules only)
  endTime?: string          // ISO string (schedules only)
  itemType?: ItemType
  onChange: (val: {
    enabled: boolean
    mode: string            // 保留兼容，始终为 'custom'
    customTime: string      // JSON array string
    minutes: number
  }) => void
}

// 分钟快捷预设（用于日程 before_start/before_end）
const MINUTE_PRESETS = [5, 10, 15, 30, 60]

// 习惯每日时间预设
const HABIT_TIME_PRESETS = ['09:00', '12:00', '18:00', '21:00']

// 将 Date 转为 datetime-local 格式
function toLocalDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// 解析 reminder_time 为数组
function parseTimes(raw: string): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(t => typeof t === 'string' && t)
  } catch {
    // 不是 JSON，当作单值
  }
  return [raw]
}

// 序列化数组为 JSON 字符串
function serializeTimes(times: string[]): string {
  return JSON.stringify(times)
}

// 格式化时间显示
function formatTimeDisplay(time: string, itemType: ItemType): string {
  if (!time) return ''
  if (itemType === 'habit') {
    return `每天 ${time}`
  }
  // datetime-local or ISO
  const d = new Date(time)
  if (isNaN(d.getTime())) return time
  const p = (n: number) => String(n).padStart(2, '0')
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const timeStr = `${p(d.getHours())}:${p(d.getMinutes())}`
  if (isToday) return `今天 ${timeStr}`
  if (isTomorrow) return `明天 ${timeStr}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`
}

const ReminderSettings: React.FC<ReminderSettingsProps> = ({
  enabled, customTime, minutes, startTime, endTime, itemType = 'task', onChange
}) => {
  const times = parseTimes(customTime)
  const hasStart = !!startTime
  const hasEnd = !!endTime
  // 待确认的自定义时间：用户选择日期时间后需点击"确认添加"才真正添加
  const [pendingTime, setPendingTime] = useState('')

  // 添加时间到列表
  const addTime = (time: string) => {
    if (!time) return
    if (times.includes(time)) return
    const newTimes = [...times, time]
    onChange({ enabled, mode: 'custom', customTime: serializeTimes(newTimes), minutes })
  }

  // 移除时间
  const removeTime = (time: string) => {
    const newTimes = times.filter(t => t !== time)
    onChange({ enabled, mode: 'custom', customTime: serializeTimes(newTimes), minutes })
  }

  // 确认添加自定义时间（用户点击"添加"按钮后才生效）
  const confirmAddTime = () => {
    if (!pendingTime) return
    addTime(new Date(pendingTime).toISOString())
    setPendingTime('')
  }

  // 日程预设：根据 start/end 计算实际时间并添加
  const addSchedulePreset = (preset: string) => {
    let computedTime: string | null = null
    if (preset === 'at_start' && startTime) {
      computedTime = new Date(startTime).toISOString()
    } else if (preset === 'at_end' && endTime) {
      computedTime = new Date(endTime).toISOString()
    } else if (preset.startsWith('before_start:') && startTime) {
      const mins = parseInt(preset.split(':')[1])
      computedTime = new Date(new Date(startTime).getTime() - mins * 60000).toISOString()
    } else if (preset.startsWith('before_end:') && endTime) {
      const mins = parseInt(preset.split(':')[1])
      computedTime = new Date(new Date(endTime).getTime() - mins * 60000).toISOString()
    }
    if (computedTime) addTime(computedTime)
  }

  // 检查某个日程预设是否已添加
  const isPresetAdded = (preset: string): boolean => {
    let targetTime: string | null = null
    if (preset === 'at_start' && startTime) {
      targetTime = new Date(startTime).toISOString()
    } else if (preset === 'at_end' && endTime) {
      targetTime = new Date(endTime).toISOString()
    } else if (preset.startsWith('before_start:') && startTime) {
      const mins = parseInt(preset.split(':')[1])
      targetTime = new Date(new Date(startTime).getTime() - mins * 60000).toISOString()
    } else if (preset.startsWith('before_end:') && endTime) {
      const mins = parseInt(preset.split(':')[1])
      targetTime = new Date(new Date(endTime).getTime() - mins * 60000).toISOString()
    }
    if (!targetTime) return false
    return times.some(t => {
      const tDate = new Date(t)
      const targetDate = new Date(targetTime!)
      return Math.abs(tDate.getTime() - targetDate.getTime()) < 60000 // 1分钟误差
    })
  }

  // 任务/日程快捷时间预设
  const quickTimePresets = [
    { label: '10分钟后', get: () => new Date(Date.now() + 10 * 60000).toISOString() },
    { label: '30分钟后', get: () => new Date(Date.now() + 30 * 60000).toISOString() },
    { label: '1小时后', get: () => new Date(Date.now() + 60 * 60000).toISOString() },
    { label: '明天9点', get: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString() } },
  ]

  return (
    <div className="space-y-2 pt-3 border-t border-[var(--border-color)]">
      {/* 开关 */}
      <button
        type="button"
        onClick={() => onChange({ enabled: !enabled, mode: 'custom', customTime, minutes })}
        className="flex items-center gap-2 cursor-pointer w-full text-left"
      >
        <div
          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            enabled ? 'bg-[#6B4C9A] border-[#6B4C9A]' : 'border-[var(--text-tertiary)]'
          }`}
        >
          {enabled && <Check size={10} className="text-white" />}
        </div>
        <Bell size={14} className="text-[#6B4C9A]" />
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          提醒{times.length > 0 ? `（${times.length}个）` : ''}
        </span>
      </button>

      {enabled && (
        <div className="pl-6 space-y-2.5">
          {/* 已设提醒时间列表 */}
          {times.length > 0 && (
            <div className="space-y-1">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--bg-tertiary)]">
                  <Clock size={12} className="text-[#6B4C9A] flex-shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] flex-1">
                    {formatTimeDisplay(t, itemType)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeTime(t)}
                    className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ==================== 习惯预设 ==================== */}
          {itemType === 'habit' && (
            <>
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[11px] text-[var(--text-tertiary)]">每天</span>
                {HABIT_TIME_PRESETS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTime(t)}
                    disabled={times.includes(t)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                      times.includes(t)
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-50 cursor-not-allowed'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {t.slice(0, 2)}:{t.slice(2)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={pendingTime}
                  onChange={e => setPendingTime(e.target.value)}
                  className="input-dark text-xs w-24"
                />
                {pendingTime && (
                  <button
                    type="button"
                    onClick={confirmAddTime}
                    className="px-2 py-0.5 text-[11px] rounded bg-[#6B4C9A] text-white hover:bg-[#5a3f82] transition-colors flex-shrink-0"
                  >
                    添加
                  </button>
                )}
                {!pendingTime && <span className="text-[11px] text-[var(--text-tertiary)]">添加自定义时间</span>}
              </div>
            </>
          )}

          {/* ==================== 日程预设 ==================== */}
          {itemType === 'schedule' && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {hasStart && (
                  <>
                    <button type="button" onClick={() => addSchedulePreset('at_start')}
                      disabled={isPresetAdded('at_start')}
                      className={`px-2 py-1 text-[11px] rounded-md transition-all ${isPresetAdded('at_start') ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-50 cursor-not-allowed' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
                      开始时
                    </button>
                    <button type="button" onClick={() => addSchedulePreset('before_start:15')}
                      disabled={isPresetAdded('before_start:15')}
                      className={`px-2 py-1 text-[11px] rounded-md transition-all ${isPresetAdded('before_start:15') ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-50 cursor-not-allowed' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
                      开始前15分
                    </button>
                    <button type="button" onClick={() => addSchedulePreset('before_start:30')}
                      disabled={isPresetAdded('before_start:30')}
                      className={`px-2 py-1 text-[11px] rounded-md transition-all ${isPresetAdded('before_start:30') ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-50 cursor-not-allowed' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
                      开始前30分
                    </button>
                  </>
                )}
                {hasEnd && (
                  <>
                    <button type="button" onClick={() => addSchedulePreset('at_end')}
                      disabled={isPresetAdded('at_end')}
                      className={`px-2 py-1 text-[11px] rounded-md transition-all ${isPresetAdded('at_end') ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-50 cursor-not-allowed' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
                      结束时
                    </button>
                    <button type="button" onClick={() => addSchedulePreset('before_end:15')}
                      disabled={isPresetAdded('before_end:15')}
                      className={`px-2 py-1 text-[11px] rounded-md transition-all ${isPresetAdded('before_end:15') ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-50 cursor-not-allowed' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
                      结束前15分
                    </button>
                    <button type="button" onClick={() => addSchedulePreset('before_end:30')}
                      disabled={isPresetAdded('before_end:30')}
                      className={`px-2 py-1 text-[11px] rounded-md transition-all ${isPresetAdded('before_end:30') ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-50 cursor-not-allowed' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
                      结束前30分
                    </button>
                  </>
                )}
              </div>
              {/* 自定义时间 */}
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-[var(--text-tertiary)]" />
                <input
                  type="datetime-local"
                  value={pendingTime}
                  onChange={e => setPendingTime(e.target.value)}
                  className="input-dark text-xs flex-1"
                />
                {pendingTime && (
                  <button
                    type="button"
                    onClick={confirmAddTime}
                    className="px-2 py-0.5 text-[11px] rounded bg-[#6B4C9A] text-white hover:bg-[#5a3f82] transition-colors flex-shrink-0"
                  >
                    添加
                  </button>
                )}
              </div>
              {/* 快捷时间 */}
              <div className="flex gap-1 flex-wrap">
                {quickTimePresets.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => addTime(preset.get())}
                    className="px-2 py-0.5 text-[11px] rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ==================== 待办预设 ==================== */}
          {itemType === 'task' && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {quickTimePresets.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => addTime(preset.get())}
                    className="px-2.5 py-1 text-xs rounded-md bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-[var(--text-tertiary)]" />
                <input
                  type="datetime-local"
                  value={pendingTime}
                  onChange={e => setPendingTime(e.target.value)}
                  className="input-dark text-xs flex-1"
                />
                {pendingTime && (
                  <button
                    type="button"
                    onClick={confirmAddTime}
                    className="px-2 py-0.5 text-[11px] rounded bg-[#6B4C9A] text-white hover:bg-[#5a3f82] transition-colors flex-shrink-0"
                  >
                    添加
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ReminderSettings
