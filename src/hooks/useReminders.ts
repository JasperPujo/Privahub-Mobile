import { useState, useEffect, useCallback, useRef } from 'react'
import { useTodoStore, useScheduleStore, useHabitStore } from '@/store'
import type { ReminderItem } from '@/components/ReminderPopup'

/**
 * 提醒检查 Hook
 * 每 30 秒扫描待办、日程、习惯，发现到期提醒则发送桌面通知
 *
 * 核心策略：使用 lastCheckTime 时间窗口机制
 * - 记录上次检查的时间戳，只弹出在上次检查后到本次检查期间到期的提醒
 * - 应用启动时 lastCheckTime 设为当前时间，所有之前过期的提醒自动跳过
 * - 不依赖 isFirstCheck 或数据同步时序，确保关闭软件期间错过的提醒不会弹出
 *
 * 支持多时间段：
 * - reminder_time 存储为 JSON 数组字符串，如 '["09:00","21:00"]' 或 '["2026-08-06T14:00:00Z"]'
 * - 旧格式（单值）也兼容
 *
 * 习惯提醒：每日重复，按 "HH:mm" 格式，次日自动重置
 * 待办/日程提醒：一次性，按 ISO datetime
 */

// 解析 reminder_time 为数组
function parseTimes(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(t => typeof t === 'string' && t)
  } catch {
    // 不是 JSON，当作单值
  }
  return [raw]
}

// 获取今天的日期字符串 YYYY-MM-DD
function getTodayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// localStorage 中存储已触发的提醒 key（双保险，防止时间窗口边界问题）
const TRIGGERED_KEY = 'privahub_reminder_triggered'

// 读取已触发记录
function getTriggeredMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TRIGGERED_KEY) || '{}')
  } catch {
    return {}
  }
}

// 写入已触发记录
function setTriggeredMap(map: Record<string, string>) {
  try {
    localStorage.setItem(TRIGGERED_KEY, JSON.stringify(map))
  } catch {
    // localStorage 不可用时静默失败
  }
}

// 标记某个提醒的某个时间为已触发
function markTriggered(id: string, timeKey: string, dateStr: string) {
  const map = getTriggeredMap()
  map[`${id}:${timeKey}`] = dateStr
  setTriggeredMap(map)
}

// 检查某个提醒的某个时间是否已触发
function isTriggered(id: string, timeKey: string, dateStr: string): boolean {
  const map = getTriggeredMap()
  return map[`${id}:${timeKey}`] === dateStr
}

// 清理过期记录（超过 7 天的）
function cleanupTriggered() {
  const map = getTriggeredMap()
  const now = Date.now()
  let changed = false
  for (const key of Object.keys(map)) {
    const dateStr = map[key]
    const d = new Date(dateStr)
    if (isNaN(d.getTime()) || now - d.getTime() > 7 * 86400000) {
      delete map[key]
      changed = true
    }
  }
  if (changed) setTriggeredMap(map)
}

export function useReminders() {
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const todayStr = useRef(getTodayStr())
  // 上次检查时间：初始化为 hook 创建时的时间
  // 这意味着应用启动时所有已过期的提醒都会被跳过
  const lastCheckTime = useRef(Date.now())

  const checkAndTrigger = useCallback(() => {
    const now = Date.now()
    const lastCheck = lastCheckTime.current
    // 更新检查时间戳（立即更新，确保本次检查覆盖的时间窗口正确）
    lastCheckTime.current = now

    const today = getTodayStr()
    // 检查是否跨天
    if (today !== todayStr.current) {
      todayStr.current = today
    }
    cleanupTriggered()

    const newReminders: ReminderItem[] = []

    // --- 待办任务 ---
    const tasks = useTodoStore.getState().tasks
    for (const task of tasks) {
      if (task.deleted_at || task.is_completed || task.is_archived) continue
      if (!task.reminder_enabled) continue

      const times = parseTimes(task.reminder_time)
      for (const t of times) {
        const triggerTime = new Date(t).getTime()
        if (isNaN(triggerTime)) continue
        // 还没到时间
        if (now < triggerTime) continue
        // 核心过滤：只在"上次检查 → 本次检查"期间到期的提醒才弹出
        // 如果 triggerTime <= lastCheck，说明上次检查时提醒已过期，跳过
        if (triggerTime <= lastCheck) {
          markTriggered(task.id, t, today)
          continue
        }
        // 双保险：检查是否已触发
        if (isTriggered(task.id, t, today)) continue

        newReminders.push({
          id: task.id,
          type: 'task',
          title: task.title,
          content: task.content,
        })
        markTriggered(task.id, t, today)
        break // 每个任务只弹一次
      }
    }

    // --- 日程 ---
    const schedules = useScheduleStore.getState().schedules
    for (const sch of schedules) {
      if (sch.deleted_at) continue
      if (!sch.is_reminder) continue

      const times = parseTimes(sch.reminder_time)
      // 也兼容旧格式：如果 reminder_time 为空但有 mode
      if (times.length === 0 && sch.reminder_mode && sch.reminder_mode !== 'custom') {
        const mode = sch.reminder_mode
        if (mode === 'at_start' && sch.start_time) {
          times.push(sch.start_time)
        } else if (mode === 'before_start' && sch.start_time) {
          times.push(new Date(new Date(sch.start_time).getTime() - (sch.reminder_minutes || 0) * 60000).toISOString())
        } else if (mode === 'at_end' && sch.end_time) {
          times.push(sch.end_time)
        } else if (mode === 'before_end' && sch.end_time) {
          times.push(new Date(new Date(sch.end_time).getTime() - (sch.reminder_minutes || 0) * 60000).toISOString())
        }
      }

      for (const t of times) {
        const triggerTime = new Date(t).getTime()
        if (isNaN(triggerTime)) continue
        if (now < triggerTime) continue
        // 超过结束时间 1 小时则不再提醒
        if (sch.end_time && now > new Date(sch.end_time).getTime() + 3600000) continue
        // 核心过滤：只在"上次检查 → 本次检查"期间到期的提醒才弹出
        if (triggerTime <= lastCheck) {
          markTriggered(sch.id, t, today)
          continue
        }
        if (isTriggered(sch.id, t, today)) continue

        newReminders.push({
          id: sch.id,
          type: 'schedule',
          title: sch.title,
          content: sch.content,
          startTime: sch.start_time,
          endTime: sch.end_time,
        })
        markTriggered(sch.id, t, today)
        break
      }
    }

    // --- 习惯（每日重复） ---
    const habits = useHabitStore.getState().habits
    for (const habit of habits) {
      if (habit.deleted_at) continue
      if (!habit.reminder_enabled) continue

      const times = parseTimes(habit.reminder_time)
      for (const t of times) {
        // 习惯时间格式："HH:mm" 或 ISO datetime
        const isDailyFormat = t.length <= 5 // "HH:mm"
        let triggerTime: number
        let triggerKey: string

        if (isDailyFormat) {
          const [hh, mm] = t.split(':').map(Number)
          if (isNaN(hh) || isNaN(mm)) continue
          const todayDate = new Date()
          todayDate.setHours(hh, mm, 0, 0)
          triggerTime = todayDate.getTime()
          triggerKey = t // "09:00"
        } else {
          // ISO datetime 一次性提醒（旧格式兼容）
          triggerTime = new Date(t).getTime()
          triggerKey = t
        }

        if (isNaN(triggerTime)) continue
        if (now < triggerTime) continue
        // 核心过滤：只在"上次检查 → 本次检查"期间到期的提醒才弹出
        if (triggerTime <= lastCheck) {
          markTriggered(habit.id, triggerKey, today)
          continue
        }
        if (isTriggered(habit.id, triggerKey, today)) continue

        newReminders.push({
          id: habit.id,
          type: 'habit',
          title: habit.name,
          content: '该打卡了',
        })
        markTriggered(habit.id, triggerKey, today)
        break // 每个习惯每次只弹一次
      }
    }

    // 发送桌面通知
    for (const r of newReminders) {
      if (window.electronAPI?.showReminderNotification) {
        window.electronAPI.showReminderNotification(r)
      }
    }

    // 也保留 in-app 状态（用于 UI 同步）
    if (newReminders.length > 0) {
      setReminders(prev => [...prev, ...newReminders])
    }
  }, [])

  useEffect(() => {
    const firstTimer = setTimeout(checkAndTrigger, 5000)
    const interval = setInterval(checkAndTrigger, 30000)
    return () => {
      clearTimeout(firstTimer)
      clearInterval(interval)
    }
  }, [checkAndTrigger])

  const dismiss = useCallback((id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id))
  }, [])

  return { reminders, dismiss }
}
