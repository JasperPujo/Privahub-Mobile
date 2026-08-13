import React, { useState, useMemo, useEffect } from 'react'
import { useScheduleStore, usePlanStore, useRecycleBinStore, useTodoStore, useAppStore, useShiftStore } from '@/store'
import { syncDelete, syncUpsert, scheduleToDb, taskToDb } from '@/lib/sync'
import type { ShiftType } from '@/types'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '@/components/Modal/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ReminderSettings from '@/components/ReminderSettings'
import {
  Plus, ChevronLeft, ChevronRight, Trash, Edit,
  Calendar as CalendarIcon, Target, X
} from '@/utils/icons'
import type { Schedule, RepeatRule, Tag } from '@/types'
import { generateUUID } from '@/lib/utils'

// 本地日期辅助函数 —— 修复时区偏移问题
const toLocalDateStr = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const toLocalISO = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 日程色块预设 —— 深色文字保证可读性
const scheduleColors = [
  { bg: 'bg-primary-600', text: 'text-[#1A1759]', light: 'bg-primary-600/15', border: 'border-primary-600/30', hex: '#4B3FE3' },
  { bg: 'bg-accent', text: 'text-[#0F4C42]', light: 'bg-accent/15', border: 'border-accent/30', hex: '#27D2BF' },
  { bg: 'bg-success', text: 'text-[#14532D]', light: 'bg-success/15', border: 'border-success/30', hex: '#1DC981' },
  { bg: 'bg-warning', text: 'text-[#713F12]', light: 'bg-warning/15', border: 'border-warning/30', hex: '#EFAA17' },
  { bg: 'bg-danger', text: 'text-[#7F1D1D]', light: 'bg-danger/15', border: 'border-danger/30', hex: '#E8463A' },
  { bg: 'bg-[#8B5CF6]', text: 'text-[#3B1270]', light: 'bg-[#8B5CF6]/15', border: 'border-[#8B5CF6]/30', hex: '#8B5CF6' },
  { bg: 'bg-[#F97316]', text: 'text-[#7C2D12]', light: 'bg-[#F97316]/15', border: 'border-[#F97316]/30', hex: '#F97316' },
  { bg: 'bg-[#EC4899]', text: 'text-[#831843]', light: 'bg-[#EC4899]/15', border: 'border-[#EC4899]/30', hex: '#EC4899' },
]

const CalendarPage: React.FC = () => {
  /* Desktop-only */

  const { schedules, addSchedule, updateSchedule, deleteSchedule, tags: storeTags, addTag } = useScheduleStore()
  const { user, settings } = useAppStore()
  // 获取各板块功能开关
  const flags = settings.featureFlags || {}
  const { plans } = usePlanStore()
  const { addItem } = useRecycleBinStore()
  const { tasks, updateTask } = useTodoStore()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month')
  const [selectedDayDate, setSelectedDayDate] = useState(new Date())
  // 排班弹窗状态
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [pendingShifts, setPendingShifts] = useState<Map<number, ShiftType>>(new Map())
  const [shiftDate, setShiftDate] = useState<Date>(() => new Date())

  const [form, setForm] = useState({
    title: '',
    content: '',
    start_time: '',
    end_time: '',
    start_time_value: '09:00',
    end_time_value: '10:00',
    is_all_day: true,
    is_reminder: false,
    reminder_type: 'popup' as Schedule['reminder_type'],
    reminder_mode: 'custom' as 'custom' | 'at_start' | 'before_start' | 'at_end' | 'before_end',
    reminder_time: '',
    reminder_minutes: 15,
    repeat_rule: null as RepeatRule | null,
    plan_id: null as string | null,
    tags: [] as string[],
    tagInput: ''
  })

  // 从 Schedule 填充表单的辅助函数（避免多处重复代码）
  const fillFormFromSchedule = (s: Schedule) => {
    setForm({
      title: s.title, content: s.content,
      start_time: s.start_time.slice(0, 10), end_time: s.end_time.slice(0, 10),
      start_time_value: s.start_time.slice(11, 16) || '00:00',
      end_time_value: s.end_time.slice(11, 16) || '00:00',
      is_all_day: s.is_all_day || (s.start_time.slice(11, 16) === '00:00' && s.end_time.slice(11, 16) === '00:00'),
      is_reminder: s.is_reminder, reminder_type: s.reminder_type,
      reminder_mode: s.reminder_mode || 'custom',
      reminder_time: s.reminder_time || '',
      reminder_minutes: s.reminder_minutes ?? 15,
      repeat_rule: s.repeat_rule, plan_id: s.plan_id,
      tags: s.tags || [], tagInput: ''
    })
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPadding = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  // 排班数据：构建当月排班映射（注意 month 是 0-indexed，shift store 用 1-indexed）
  const { shifts } = useShiftStore()
  const monthShifts = shifts.filter(s => s.year === year && s.month === month + 1 && !s.deleted_at)
  const shiftsMap = new Map(monthShifts.map(s => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return [`${year}-${pad(month + 1)}-${pad(s.day)}`, s]
  }))

  // 排班弹窗月份参数
  const sYear = shiftDate.getFullYear()
  const sMonth = shiftDate.getMonth()
  const sFirstDay = new Date(sYear, sMonth, 1)
  const sDaysInMonth = new Date(sYear, sMonth + 1, 0).getDate()
  const sStartPadding = sFirstDay.getDay()

  // 排班弹窗切换月份时加载已有数据
  React.useEffect(() => {
    const sy = shiftDate.getFullYear()
    const sm = shiftDate.getMonth() + 1
    const existing = new Map<number, ShiftType>()
    shifts.filter(s => s.year === sy && s.month === sm && !s.deleted_at).forEach(s => existing.set(s.day, s.type))
    setPendingShifts(existing)
  }, [shiftDate])

  // 给每个日程分配一个固定颜色索引
  const scheduleColorMap = useMemo(() => {
    const map: Record<string, number> = {}
    const active = schedules.filter(s => !s.deleted_at)
    active.forEach((s, i) => { map[s.id] = i % scheduleColors.length })
    return map
  }, [schedules])

  const monthSchedules = schedules.filter(s => !s.deleted_at)

  const getSchedulesForDay = (day: number) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const targetStr = `${year}-${pad(month + 1)}-${pad(day)}`
    return monthSchedules.filter(s => {
      // 提取开始日期字符串（YYYY-MM-DD）
      const startStr = s.start_time.slice(0, 10)
      // 提取结束日期字符串
      let endStr: string
      if (s.end_time && s.end_time.length >= 10) {
        endStr = s.end_time.slice(0, 10)
      } else {
        endStr = startStr
      }
      return targetStr >= startStr && targetStr <= endStr
    })
  }

  // 跨天日程列表
  const multiDaySchedules = monthSchedules.filter(s => {
    const startStr = s.start_time.slice(0, 10)
    const endStr = s.end_time && s.end_time.length >= 10 ? s.end_time.slice(0, 10) : startStr
    return startStr !== endStr
  })

  // 计算每个跨天日程按周的段
  const getMultiDayWeekSegments = () => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const monthStartStr = `${year}-${pad(month + 1)}-01`
    const monthEndStr = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`

    // 计算当前月1号所在的"全局周序号"
    const firstOfMonth = new Date(year, month, 1)
    const firstWeekSunday = new Date(firstOfMonth)
    firstWeekSunday.setDate(firstWeekSunday.getDate() - firstOfMonth.getDay())
    const toWeekIdx = (d: Date) => {
      return Math.floor((d.getTime() - firstWeekSunday.getTime()) / (7 * 86400000))
    }

    return multiDaySchedules.map(s => {
      const startStr = s.start_time.slice(0, 10)
      const endStr = s.end_time && s.end_time.length >= 10 ? s.end_time.slice(0, 10) : startStr
      const visStart = startStr >= monthStartStr ? startStr : monthStartStr
      const visEnd = endStr <= monthEndStr ? endStr : monthEndStr

      const segments: Array<{ weekIdx: number; startCol: number; span: number }> = []
      const cur = new Date(Number(visStart.split('-')[0]), Number(visStart.split('-')[1]) - 1, Number(visStart.split('-')[2]))
      const end = new Date(Number(visEnd.split('-')[0]), Number(visEnd.split('-')[1]) - 1, Number(visEnd.split('-')[2]))

      while (cur <= end) {
        const weekDay = cur.getDay()
        const weekIdx = toWeekIdx(cur)
        const daysLeftInWeek = 7 - weekDay
        const span = Math.min(daysLeftInWeek, Math.floor((end.getTime() - cur.getTime()) / 86400000) + 1)

        segments.push({ weekIdx, startCol: weekDay, span })
        cur.setDate(cur.getDate() + daysLeftInWeek)
      }

      return segments
    })
  }

  // 为每个跨天日程分配行号，避免重叠
  const multiDayLayout = useMemo(() => {
    const segments = getMultiDayWeekSegments()
    // 对每个 schedule 的所有 segments 分配同一个 row
    const rowAssignment: Record<string, number> = {}
    let maxRow = 0
    const weekRowOccupancy: Record<string, Set<number>> = {} // weekIdx-row -> set of occupied cols

    segments.forEach((schedSegments, sIdx) => {
      const s = multiDaySchedules[sIdx]
      // 找一个不冲突的行
      let row = 0
      let found = false
      while (!found) {
        const conflict = schedSegments.some(seg => {
          const key = `${seg.weekIdx}-${row}`
          if (!weekRowOccupancy[key]) weekRowOccupancy[key] = new Set()
          // 检查这一行在这一周的这个段范围是否有占用
          for (let c = seg.startCol; c < seg.startCol + seg.span; c++) {
            if (weekRowOccupancy[key].has(c)) return true
          }
          return false
        })
        if (conflict) {
          row++
        } else {
          found = true
        }
      }
      rowAssignment[s.id] = row
      maxRow = Math.max(maxRow, row + 1)
      // 标记占用
      schedSegments.forEach(seg => {
        const key = `${seg.weekIdx}-${row}`
        if (!weekRowOccupancy[key]) weekRowOccupancy[key] = new Set()
        for (let c = seg.startCol; c < seg.startCol + seg.span; c++) {
          weekRowOccupancy[key].add(c)
        }
      })
    })

    return { segments, rowAssignment, maxRows: maxRow }
  }, [multiDaySchedules, year, month, startPadding, daysInMonth])

  // 初始化弹窗时重置到当前月
  useEffect(() => {
    if (showShiftModal) {
      setShiftDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))
    }
  }, [showShiftModal, year, month])

  // 排班弹窗：循环切换某天的排班类型
  const toggleDayShift = (day: number) => {
    setPendingShifts(prev => {
      const next = new Map(prev)
      const current = next.get(day)
      if (!current) next.set(day, 'work')
      else if (current === 'work') next.set(day, 'rest')
      else if (current === 'rest') next.set(day, 'public_rest')
      else next.delete(day)
      return next
    })
  }

  // 排班弹窗：保存排班到 store
  const saveShifts = () => {
    const { batchSetMonth } = useShiftStore.getState()
    batchSetMonth(sYear, sMonth + 1, Array.from(pendingShifts.entries()).map(([day, type]) => ({ day, type })))
    setShowShiftModal(false)
  }

  // 排班弹窗：全部设为上班
  const fillAllWork = () => {
    const next = new Map<number, ShiftType>()
    for (let d = 1; d <= sDaysInMonth; d++) next.set(d, 'work')
    setPendingShifts(next)
  }

  // 排班弹窗：按周末休息（周六日休息，工作日上班）
  const fillAllRest = () => {
    const next = new Map<number, ShiftType>()
    for (let d = 1; d <= sDaysInMonth; d++) {
      const date = new Date(sYear, sMonth, d)
      const weekDay = date.getDay()
      next.set(d, weekDay === 0 || weekDay === 6 ? 'rest' : 'work')
    }
    setPendingShifts(next)
  }

  // 排班弹窗：清空排班
  const clearAll = () => setPendingShifts(new Map())

  const resetForm = () => {
    setForm({
      title: '', content: '', start_time: '', end_time: '',
      start_time_value: '09:00', end_time_value: '10:00', is_all_day: true,
      is_reminder: false, reminder_type: 'popup',
      reminder_mode: 'custom', reminder_time: '', reminder_minutes: 15,
      repeat_rule: null, plan_id: null,
      tags: [], tagInput: ''
    })
    setEditingSchedule(null)
  }

  const handleSave = () => {
    if (!form.title.trim() || !form.start_time) return
    const finalEndTime = form.end_time || form.start_time
    const startH = form.is_all_day ? '00:00' : form.start_time_value
    const endH = form.is_all_day ? '00:00' : form.end_time_value
    const startISO = form.start_time + 'T' + startH
    const endISO = finalEndTime + 'T' + endH
    // 提醒数据
    const reminderExtra = form.is_reminder ? {
      reminder_mode: form.reminder_mode,
      reminder_time: form.reminder_time || null,
      reminder_minutes: form.reminder_minutes,
      reminder_triggered: false,
    } : { reminder_time: null, reminder_mode: 'custom', reminder_triggered: false }
    const payload = {
      title: form.title,
      content: form.content,
      start_time: startISO,
      end_time: endISO,
      is_all_day: form.is_all_day,
      is_reminder: form.is_reminder,
      reminder_type: form.reminder_type,
      ...reminderExtra,
      repeat_rule: form.repeat_rule,
      plan_id: form.plan_id,
      tags: form.tags,
    }
    if (editingSchedule) {
      updateSchedule(editingSchedule.id, payload)
      if (user) {
        const updated = { ...editingSchedule, ...payload, updated_at: new Date().toISOString() }
        syncUpsert('schedules', user.id, updated, scheduleToDb).then(r => {
          if (!r.success) console.error('[Calendar] Failed to sync update schedule:', r.error)
        })
      }
    } else {
      const newSchedule = {
        id: generateUUID(), user_id: user?.id || 'current-user', ...payload,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      addSchedule(newSchedule)
      if (user) {
        syncUpsert('schedules', user.id, newSchedule, scheduleToDb).then(r => {
          if (!r.success) console.error('[Calendar] Failed to sync add schedule:', r.error)
        })
      }
    }
    setShowModal(false)
    resetForm()
  }

  const handleDelete = (schedule: Schedule) => {
    deleteSchedule(schedule.id)
    addItem({ id: schedule.id, type: 'schedule', title: schedule.title, data: schedule })
    if (user) {
      syncDelete('schedules', schedule.id, user.id).then(r => {
        if (!r.success) console.error('[Calendar] Failed to hard delete from cloud:', r.error)
      })
    }
    setConfirmDelete(null)
  }

  // 根据标签名获取颜色
  const getTagColor = (tagName: string): string => {
    const tag = storeTags.find(t => t.name === tagName)
    return tag?.color || '#6B7280'
  }

  // 添加自定义标签到 store
  const handleAddCustomTag = (tagName: string) => {
    const trimmed = tagName.trim()
    if (!trimmed) return
    if (!storeTags.some(t => t.name === trimmed)) {
      const colors = ['#4B3FE3', '#1DC981', '#EFAA17', '#E8463A', '#8B5CF6', '#F97316', '#EC4899', '#27D2BF']
      const newTag: Tag = {
        id: generateUUID(),
        name: trimmed,
        color: colors[storeTags.length % colors.length],
        is_builtin: false,
        created_at: new Date().toISOString()
      }
      addTag(newTag)
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const today = new Date()
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  const numWeeks = Math.ceil((startPadding + daysInMonth) / 7)

  const handleGridClick = (day: number) => {
    const date = new Date(year, month, day)
    const dateStr = toLocalDateStr(date)
    setSelectedDate(dateStr)
    setForm(prev => ({
      ...prev,
      start_time: dateStr,
      end_time: dateStr,
      start_time_value: '09:00',
      end_time_value: '10:00',
      is_all_day: true,
    }))
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

  return (
    <div className="page-container">
      <div className="max-w-5xl mx-auto">
        {/* 头部 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-6">
          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            <h1 className="page-title mb-0">日历日程</h1>
            <div className="flex items-center gap-1 md:gap-2 bg-[var(--bg-secondary)] rounded-button border border-[var(--border-color)]">
              <button onClick={prevMonth} className="p-2 md:p-2 hover:bg-[var(--bg-tertiary)] rounded-l-button">
                <ChevronLeft size={16} />
              </button>

              {/* 年份选择 */}
              <div className="relative">
                <button
                  onClick={() => { setShowYearPicker(!showYearPicker); setShowMonthPicker(false) }}
                  className="text-xs md:text-sm font-medium px-2 md:px-2 py-1.5 min-w-[50px] text-center hover:text-primary-600"
                >
                  {year}年
                </button>
                <AnimatePresence>
                  {showYearPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-36 md:w-40 max-w-[calc(100vw-1rem)] max-h-60 overflow-auto bg-[var(--bg-secondary)] rounded-card shadow-soft-lg border border-[var(--border-color)] z-30 py-2"
                    >
                      {Array.from({ length: 21 }, (_, i) => year - 10 + i).map(y => (
                        <button key={y}
                          onClick={() => { setCurrentDate(new Date(y, month, 1)); setShowYearPicker(false) }}
                          className={`w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg-tertiary)] transition-colors ${y === year ? 'text-primary-600 font-medium bg-primary-600/5' : 'text-[var(--text-primary)]'}`}>
                          {y}年
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 月份选择 */}
              <div className="relative">
                <button
                  onClick={() => { setShowMonthPicker(!showMonthPicker); setShowYearPicker(false) }}
                  className="text-xs md:text-sm font-medium px-2 md:px-2 py-1.5 min-w-[40px] text-center hover:text-primary-600"
                >
                  {month + 1}月
                </button>
                <AnimatePresence>
                  {showMonthPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 md:w-48 max-w-[calc(100vw-1rem)] max-h-60 overflow-auto bg-[var(--bg-secondary)] rounded-card shadow-soft-lg border border-[var(--border-color)] z-30 py-3 px-2"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {monthNames.map((m, idx) => (
                          <button key={idx}
                            onClick={() => { setCurrentDate(new Date(year, idx, 1)); setShowMonthPicker(false) }}
                            className={`w-full px-2 py-2 text-sm rounded-button hover:bg-[var(--bg-tertiary)] transition-colors text-center ${
                              idx === month ? 'text-primary-600 font-medium bg-primary-600/5' : 'text-[var(--text-primary)]'
                            }`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button onClick={nextMonth} className="p-2 md:p-2 hover:bg-[var(--bg-tertiary)] rounded-r-button">
                <ChevronRight size={16} />
              </button>
            </div>
            <button onClick={() => setCurrentDate(new Date())} className="text-xs md:text-sm text-primary-600 hover:underline">今天</button>
            {/* 视图切换 */}
            <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] rounded-button p-0.5 border border-[var(--border-color)]">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 md:px-3 py-1.5 md:py-1 text-xs rounded-md transition-colors ${viewMode === 'month' ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}
              >
                月
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 md:px-3 py-1.5 md:py-1 text-xs rounded-md transition-colors ${viewMode === 'day' ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}
              >
                日
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <button onClick={() => setShowShiftModal(true)} className="btn-secondary text-xs md:text-sm flex items-center gap-2">
              <CalendarIcon size={14} /> 排班
            </button>
            <button onClick={() => { resetForm(); setShowModal(true) }} className="btn-primary text-xs md:text-sm flex items-center gap-2">
              <Plus size={14} /> <span className="md:hidden">新建</span><span className="hidden md:inline">新建日程</span>
            </button>
          </div>
        </div>

        {/* 日历网格 */}
        {viewMode === 'month' && (
        <>
        {/* 手机端紧凑月历：避免完整月格在窄屏被挤压 */}
        <div className="card overflow-hidden md:hidden">
          <div className="grid grid-cols-7 border-b border-[var(--border-color)]">
            {weekDays.map(day => (
              <div key={day} className="py-2 text-center text-[11px] font-medium text-[var(--text-secondary)]">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-[var(--border-color)]">
            {Array.from({ length: startPadding }).map((_, idx) => (
              <div key={`mobile-pad-${idx}`} className="h-11 bg-[var(--bg-secondary)]" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const todayFlag = isToday(day)
              const dayShift = shiftsMap.get(dateKey)
              const hasEvents = getSchedulesForDay(day).length > 0
              return (
                <button
                  key={`mobile-day-${day}`}
                  onClick={() => handleGridClick(day)}
                  className={`h-11 bg-[var(--bg-secondary)] flex flex-col items-center justify-center gap-0.5 active:bg-[var(--bg-tertiary)] ${
                    selectedDate === dateKey ? 'bg-primary-600/10' : ''
                  }`}
                >
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-medium ${
                    todayFlag ? 'bg-primary-600 text-white' : 'text-[var(--text-primary)]'
                  }`}>
                    {day}
                  </span>
                  <div className="h-2 flex items-center justify-center gap-0.5">
                    {dayShift && (
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        dayShift.type === 'work' ? 'bg-blue-500' :
                        dayShift.type === 'rest' ? 'bg-green-500' :
                        'bg-orange-500'
                      }`} />
                    )}
                    {hasEvents && <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card overflow-hidden hidden md:block">
          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-px bg-[var(--border-color)]">
            {weekDays.map(day => (
              <div key={day} className="bg-[var(--bg-secondary)] py-1 md:py-2 text-center text-xs md:text-sm font-medium text-[var(--text-secondary)]">{day}</div>
            ))}
          </div>

          {/* 每周独立渲染 */}
          {Array.from({ length: numWeeks }).map((_, weekIdx) => {
            const weekStart = weekIdx * 7 - startPadding

            // 本周内的跨天日程条
            const weekMultiDayBars = multiDaySchedules.flatMap((s, sIdx) => {
              const segs = multiDayLayout.segments[sIdx]
              const row = multiDayLayout.rowAssignment[s.id] ?? 0
              return segs
                .filter(seg => seg.weekIdx === weekIdx)
                .map(seg => ({ schedule: s, seg, row, sIdx }))
            })

            return (
              <div key={weekIdx}>
                {/* 第1行：日期数字行 - 固定高度 */}
                <div className="grid grid-cols-7 gap-px bg-[var(--border-color)]">
                  {Array.from({ length: 7 }).map((_, colIdx) => {
                    const day = weekStart + colIdx + 1
                    const isPadding = day <= 0 || day > daysInMonth
                    const todayFlag = !isPadding && isToday(day)

                    if (isPadding) {
                      return <div key={`pad-date-${weekIdx}-${colIdx}`} className="bg-[var(--bg-secondary)] h-9 md:h-8" />
                    }

                    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const allDaySchedules = getSchedulesForDay(day)
                    const hasEvents = allDaySchedules.length > 0
                    // 查找该天的排班信息
                    const dayShift = shiftsMap.get(dateKey)

                    return (
                      <div
                        key={`date-${day}`}
                        onClick={() => handleGridClick(day)}
                        className={`bg-[var(--bg-secondary)] h-9 md:h-8 flex items-center justify-between px-1 md:px-2 cursor-pointer transition-all hover:bg-[var(--bg-tertiary)]/30 ${
                          todayFlag ? 'ring-2 ring-inset ring-primary-600' : ''
                        } ${selectedDate === dateKey ? 'bg-primary-50/50' : ''}`}
                      >
                        <div className="flex items-center">
                          <span className={`text-xs md:text-sm font-medium ${todayFlag ? 'text-primary-600' : 'text-[var(--text-primary)]'}`}>{day}</span>
                          {dayShift && (
                            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ml-0.5 ${
                              dayShift.type === 'work' ? 'bg-blue-100 text-blue-600' :
                              dayShift.type === 'rest' ? 'bg-green-100 text-green-600' :
                              'bg-orange-100 text-orange-600'
                            }`}>
                              {dayShift.type === 'work' ? '班' : dayShift.type === 'rest' ? '休' : '公'}
                            </span>
                          )}
                        </div>
                        {hasEvents && <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />}
                      </div>
                    )
                  })}
                </div>

                {/* 第2行：跨天日程条区域 - relative 定位 */}
                {weekMultiDayBars.length > 0 && (
                <div className="relative bg-[var(--bg-secondary)]" style={{ height: `${multiDayLayout.maxRows * 20 + 2}px` }}>
                  {weekMultiDayBars.map(({ schedule, seg, row, sIdx }) => {
                    const colorIdx = scheduleColorMap[schedule.id] ?? 0
                    const color = scheduleColors[colorIdx]
                    const startStr = schedule.start_time.slice(0, 10)
                    const endStr = schedule.end_time && schedule.end_time.length >= 10 ? schedule.end_time.slice(0, 10) : startStr
                    const allSegs = multiDayLayout.segments[sIdx]
                    const isFirstSeg = allSegs[0] === seg
                    const isLastSeg = allSegs[allSegs.length - 1] === seg
                    return (
                      <div
                        key={`${schedule.id}-${seg.weekIdx}`}
                        className={`absolute h-5 text-[9px] md:text-xs font-medium truncate px-1.5 md:px-2 flex items-center cursor-pointer hover:brightness-95 transition-all ${isFirstSeg ? 'rounded-l-md' : ''} ${isLastSeg ? 'rounded-r-none' : ''}`}
                        style={{
                          left: `${seg.startCol * (100 / 7)}%`,
                          width: `${seg.span * (100 / 7)}%`,
                          top: `${row * 20 + 1}px`,
                          backgroundColor: color.hex,
                          color: '#fff',
                          opacity: 0.82
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingSchedule(schedule)
                          fillFormFromSchedule(schedule)
                          setShowModal(true)
                        }}
                        title={`${schedule.title} (${startStr} - ${endStr})`}
                      >
                        {schedule.title}
                      </div>
                    )
                  })}
                </div>
                )}

                {/* 第3行：单天日程区域 */}
                <div className="grid grid-cols-7 gap-px bg-[var(--border-color)]">
                  {Array.from({ length: 7 }).map((_, colIdx) => {
                    const day = weekStart + colIdx + 1
                    const isPadding = day <= 0 || day > daysInMonth

                    if (isPadding) {
                      return <div key={`pad-sched-${weekIdx}-${colIdx}`} className="bg-[var(--bg-secondary)] min-h-[48px] md:min-h-[64px]" />
                    }

                    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const allDaySchedules = getSchedulesForDay(day)
                    const daySchedules = allDaySchedules.filter(s => {
                      const startStr = s.start_time.slice(0, 10)
                      const endStr = s.end_time && s.end_time.length >= 10 ? s.end_time.slice(0, 10) : startStr
                      return startStr === endStr
                    })

                    return (
                      <div
                        key={`sched-${day}`}
                        onClick={() => handleGridClick(day)}
                        className={`bg-[var(--bg-secondary)] min-h-[48px] md:min-h-[64px] p-1 md:p-2 cursor-pointer transition-all hover:bg-[var(--bg-tertiary)]/30 ${
                          selectedDate === dateKey ? 'bg-primary-50/50' : ''
                        }`}
                      >
                        {daySchedules.length > 0 && (
                        <div className="space-y-1">
                          {daySchedules.slice(0, 4).map(s => {
                            const colorIdx = scheduleColorMap[s.id] ?? 0
                            const color = scheduleColors[colorIdx]
                            const startH = Number(s.start_time.slice(11, 13)) || 0
                            const startM = Number(s.start_time.slice(14, 16)) || 0
                            const timeStr = (startH === 0 && startM === 0) ? '' : `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
                            return (
                              <div
                                key={s.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingSchedule(s)
                                  fillFormFromSchedule(s)
                                  setShowModal(true)
                                }}
                                className={`relative text-[9px] md:text-xs px-1 md:px-1.5 py-0 md:py-0.5 rounded-l-md rounded-r-none truncate cursor-pointer font-medium ${color.light} ${color.text}`}
                                style={{ borderLeft: `2px solid ${color.hex}` }}
                                title={`${s.title} ${timeStr}`}
                              >
                                {timeStr}{timeStr ? ' ' : ''}{s.title}
                              </div>
                            )
                          })}
                          {daySchedules.length > 4 && (
                            <div className="text-[9px] md:text-xs text-[var(--text-tertiary)] pl-1">+{daySchedules.length - 4}</div>
                          )}
                        </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* 日程列表 */}
        <div className="mt-3 md:mt-4">
          <h2 className="section-title">
            {selectedDate ? `${selectedDate} 的日程` : '本月日程'}
          </h2>
          <div className="space-y-2 md:space-y-3">
            <AnimatePresence>
              {(selectedDate
                ? monthSchedules.filter(s => {
                    const startStr = s.start_time.slice(0, 10)
                    const endStr = s.end_time && s.end_time.length >= 10 ? s.end_time.slice(0, 10) : startStr
                    return selectedDate >= startStr && selectedDate <= endStr
                  })
                : monthSchedules
              ).map(schedule => {
                const colorIdx = scheduleColorMap[schedule.id] ?? 0
                const color = scheduleColors[colorIdx]
                const startStr = schedule.start_time.slice(0, 10)
                const endStr = schedule.end_time && schedule.end_time.length >= 10 ? schedule.end_time.slice(0, 10) : startStr
                const isMultiDay = startStr !== endStr
                return (
                  <motion.div key={schedule.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="card-hover" style={{ borderLeft: `3px solid ${color.hex}` }}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 md:gap-3">
                        <div className="w-14 md:w-20 text-center flex-shrink-0">
                          <p className="text-base md:text-lg font-bold" style={{ color: color.hex }}>
                            {Number(startStr.split('-')[2])}
                          </p>
                          {(() => {
                            const timePart = schedule.start_time.slice(11, 16)
                            return timePart !== '00:00' && <p className="text-xs text-[var(--text-tertiary)]">{timePart}</p>
                          })()}
                          {isMultiDay && (
                            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                              {startStr} 至 {endStr}
                            </p>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-medium text-[var(--text-primary)] break-words">{schedule.title}</h3>
                          {schedule.content && <p className="text-xs text-[var(--text-secondary)] mt-0.5 break-words">{schedule.content}</p>}
                          {schedule.plan_id && (
                            <div className="flex items-center gap-1 mt-1 min-w-0">
                              <Target size={12} className="text-primary-600 flex-shrink-0" />
                              <span className="text-xs text-primary-600 truncate">关联规划: {plans.find(p => p.id === schedule.plan_id)?.title || '未知'}</span>
                            </div>
                          )}
                          {schedule.is_reminder && (
                            <span className="tag-pill text-xs mt-1 inline-flex">
                              {schedule.reminder_type === 'popup' ? '弹窗提醒' : schedule.reminder_type === 'system' ? '系统通知' : '双重提醒'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => {
                          setEditingSchedule(schedule)
                          fillFormFromSchedule(schedule)
                          setShowModal(true)
                        }} className="p-2.5 rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"><Edit size={15} /></button>
                        <button onClick={() => setConfirmDelete(schedule.id)}
                          className="p-2.5 rounded-button hover:bg-red-50 text-[var(--text-tertiary)] hover:text-danger"><Trash size={15} /></button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {(selectedDate
              ? monthSchedules.filter(s => {
                  const startStr = s.start_time.slice(0, 10)
                  const endStr = s.end_time && s.end_time.length >= 10 ? s.end_time.slice(0, 10) : startStr
                  return selectedDate >= startStr && selectedDate <= endStr
                })
              : monthSchedules
            ).length === 0 && (
              <div className="empty-state">
                <CalendarIcon size={48} className="text-[var(--text-tertiary)] mb-3" />
                <p className="text-[var(--text-secondary)]">暂无日程</p>
              </div>
            )}
          </div>
        </div></>
        )}

        {/* 日视图 */}
        {viewMode === 'day' && (
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            {/* 左侧：时间线 */}
            <div className="flex-[2] card p-3 md:p-4 min-w-0 flex flex-col">
              {/* 日视图头部 */}
              <div className="flex items-center justify-between gap-2 md:gap-3 mb-3 md:mb-6">
                <div className="flex items-center gap-1.5 md:gap-3">
                  <button
                    onClick={() => setSelectedDayDate(new Date(selectedDayDate.getTime() - 86400000))}
                    className="p-1.5 md:p-1.5 hover:bg-[var(--bg-secondary)] rounded-md"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm md:text-lg font-semibold text-[var(--text-primary)]">
                    {selectedDayDate.getFullYear()}年{selectedDayDate.getMonth() + 1}月{selectedDayDate.getDate()}日
                  </span>
                  <button
                    onClick={() => setSelectedDayDate(new Date(selectedDayDate.getTime() + 86400000))}
                    className="p-1.5 md:p-1.5 hover:bg-[var(--bg-secondary)] rounded-md"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <button
                  onClick={() => setSelectedDayDate(new Date())}
                  className="text-xs md:text-sm text-primary-600 hover:underline"
                >
                  今天
                </button>
              </div>

              {/* 24小时时间线 - 绝对定位布局，每小时48px，默认显示工作时间范围 */}
              {(() => {
                const HOUR_HEIGHT = 48
                const TOTAL_HEIGHT = 24 * HOUR_HEIGHT
                const now = new Date()
                const isToday = selectedDayDate.getFullYear() === now.getFullYear() && selectedDayDate.getMonth() === now.getMonth() && selectedDayDate.getDate() === now.getDate()
                // 默认滚动到8:00的位置
                const defaultScroll = 8 * HOUR_HEIGHT
                return (
                <div
                  className="flex-1 overflow-y-auto border-t border-[var(--border-color)] relative max-h-[60vh] md:max-h-[560px]"
                  ref={(el) => {
                    if (el && !el.dataset.scrolled) {
                      el.scrollTop = isToday ? Math.max(0, now.getHours() * HOUR_HEIGHT - 100) : defaultScroll
                      el.dataset.scrolled = '1'
                    }
                  }}
                >
                <div
                  className="relative"
                  style={{ height: TOTAL_HEIGHT }}
                  onClick={(e) => {
                    const target = e.currentTarget
                    const rect = target.getBoundingClientRect()
                    const container = target.parentElement
                    const scrollTop = container ? container.scrollTop : 0
                    const y = e.clientY - rect.top + scrollTop
                    const clickedMinutes = Math.floor(y / HOUR_HEIGHT * 60)
                    const hour = Math.floor(clickedMinutes / 60)
                    if (hour < 0 || hour > 23) return
                    const date = new Date(selectedDayDate)
                    const dateStr = toLocalDateStr(date)
                    const startH = String(hour).padStart(2, '0') + ':00'
                    const endH = String(Math.min(hour + 1, 23)).padStart(2, '0') + ':00'
                    setSelectedDate(dateStr)
                    setForm(prev => ({
                      ...prev,
                      start_time: dateStr,
                      end_time: dateStr,
                      start_time_value: startH,
                      end_time_value: endH,
                      is_all_day: false,
                    }))
                    setShowModal(true)
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const data = e.dataTransfer.getData('application/json')
                    if (!data) return
                    try {
                      const parsed = JSON.parse(data)
                      const target = e.currentTarget
                      const rect = target.getBoundingClientRect()
                      const container = target.parentElement
                      const scrollTop = container ? container.scrollTop : 0
                      const y = e.clientY - rect.top + scrollTop
                      const dropMinutes = Math.max(0, Math.min(1439, Math.floor(y / HOUR_HEIGHT * 60)))
                      const dropHour = Math.floor(dropMinutes / 60)
                      const dropMin = dropMinutes % 60
                      const date = new Date(selectedDayDate)
                      const dateStr = toLocalDateStr(date)
                      const pad = (n: number) => String(n).padStart(2, '0')
                      const startTime = `${pad(dropHour)}:${pad(dropMin)}`
                      const endHour = Math.min(dropHour + 1, 23)
                      const endTime = `${pad(endHour)}:${pad(dropMin)}`
                      setSelectedDate(dateStr)
                      if (parsed.type === 'task') {
                        setForm(prev => ({
                          ...prev,
                          title: parsed.item.title,
                          content: parsed.item.description || '',
                          start_time: dateStr,
                          end_time: dateStr,
                          start_time_value: startTime,
                          end_time_value: endTime,
                          is_all_day: false,
                        }))
                      } else if (parsed.type === 'schedule') {
                        const s = parsed.item
                        const sStartMin = (parseInt(s.start_time.slice(11, 13)) || 0) * 60 + (parseInt(s.start_time.slice(14, 16)) || 0)
                        const sEndMin = s.end_time ? (parseInt(s.end_time.slice(11, 13)) || 0) * 60 + (parseInt(s.end_time.slice(14, 16)) || 0) : sStartMin + 60
                        const duration = sEndMin - sStartMin
                        const endDropMin = Math.min(dropMinutes + Math.max(duration, 60), 1439)
                        const endH = Math.floor(endDropMin / 60)
                        const endM = endDropMin % 60
                        setForm(prev => ({
                          ...prev,
                          title: s.title,
                          content: s.content || '',
                          start_time: dateStr,
                          end_time: dateStr,
                          start_time_value: startTime,
                          end_time_value: `${pad(endH)}:${pad(endM)}`,
                          is_all_day: s.is_all_day || false,
                        }))
                      }
                      setShowModal(true)
                    } catch {
                      // ignore invalid drop data
                    }
                  }}
                >
                  {/* 左侧时间标签 + 每小时网格背景 */}
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div key={hour} className="flex border-b border-[var(--border-color)]" style={{ height: HOUR_HEIGHT }}>
                      <div className="w-14 flex-shrink-0 py-1 px-1 md:px-2 text-xs md:text-xs text-[var(--text-tertiary)] text-right border-r border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
                        {String(hour).padStart(2, '0')}:00
                      </div>
                      <div className="flex-1 relative" />
                    </div>
                  ))}

                  {/* 绝对定位的日程条 */}
                  {(() => {
                    const pad = (n: number) => String(n).padStart(2, '0')
                    const dayStr = `${selectedDayDate.getFullYear()}-${pad(selectedDayDate.getMonth() + 1)}-${pad(selectedDayDate.getDate())}`
                    const daySchedules = monthSchedules.filter(s => {
                      const startStr = s.start_time.slice(0, 10)
                      const endStr = s.end_time && s.end_time.length >= 10 ? s.end_time.slice(0, 10) : startStr
                      const inDayRange = dayStr >= startStr && dayStr <= endStr
                      if (!inDayRange) return false
                      const isAllDay = s.is_all_day || (s.start_time.slice(11, 16) === '00:00' && (!s.end_time || s.end_time.slice(11, 16) === '00:00'))
                      return !isAllDay
                    })

                    type LayoutSchedule = Schedule & {
                      startMinutes: number
                      endMinutes: number
                      duration: number
                      col: number
                      totalCols: number
                    }

                    function computeScheduleLayout(schedules: Schedule[]): LayoutSchedule[] {
                      const computed = schedules.map(s => {
                        const startH = parseInt(s.start_time.slice(11, 13)) || 0
                        const startM = parseInt(s.start_time.slice(14, 16)) || 0
                        const endH = s.end_time ? (parseInt(s.end_time.slice(11, 13)) || 0) : startH
                        const endM = s.end_time ? (parseInt(s.end_time.slice(14, 16)) || 0) : startM
                        const startMinutes = startH * 60 + startM
                        const endMinutes = endH * 60 + endM
                        const duration = Math.max(endMinutes - startMinutes, 15)
                        return { ...s, startMinutes, endMinutes, duration, col: 0, totalCols: 1 }
                      })
                      computed.sort((a, b) => a.startMinutes - b.startMinutes)
                      const columns: LayoutSchedule[] = []
                      for (const item of computed) {
                        let placed = false
                        for (let i = 0; i < columns.length; i++) {
                          if (columns[i].endMinutes <= item.startMinutes) {
                            item.col = i
                            columns[i] = item
                            placed = true
                            break
                          }
                        }
                        if (!placed) {
                          item.col = columns.length
                          columns.push(item)
                        }
                      }
                      for (const item of computed) {
                        let maxCol = item.col
                        for (const other of computed) {
                          if (other.id === item.id) continue
                          if (other.startMinutes < item.endMinutes && other.endMinutes > item.startMinutes) {
                            maxCol = Math.max(maxCol, other.col)
                          }
                        }
                        item.totalCols = maxCol + 1
                      }
                      return computed
                    }

                    const layout = computeScheduleLayout(daySchedules)

                    return layout.map(s => {
                      const colorIdx = scheduleColorMap[s.id] ?? 0
                      const color = scheduleColors[colorIdx]
                      const top = s.startMinutes / 60 * HOUR_HEIGHT
                      const height = s.duration / 60 * HOUR_HEIGHT
                      const left = `calc(56px + ${s.col} * (100% - 56px) / ${s.totalCols})`
                      const width = `calc((100% - 56px) / ${s.totalCols})`
                      const startStr = `${pad(Math.floor(s.startMinutes / 60))}:${pad(s.startMinutes % 60)}`
                      const endStr = `${pad(Math.floor(s.endMinutes / 60))}:${pad(s.endMinutes % 60)}`
                      return (
                        <div
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingSchedule(s)
                            fillFormFromSchedule(s)
                            setShowModal(true)
                          }}
                          className={`absolute rounded-md cursor-pointer hover:brightness-95 overflow-hidden px-2 py-1 text-xs font-medium ${color.light} ${color.text}`}
                          style={{
                            top,
                            height,
                            left,
                            width,
                            borderLeft: `3px solid ${color.hex}`,
                            minHeight: 20,
                          }}
                          title={`${s.title} (${startStr} - ${endStr})`}
                        >
                          <div className="truncate leading-tight">{s.title}</div>
                          <div className="text-xs text-[var(--text-tertiary)] leading-tight mt-0.5">
                            {startStr} - {endStr}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
                )
                })()}
            </div>

            {/* 右侧：全天日程 + 任务待办 */}
            <div className="flex-1 flex flex-col gap-3 md:gap-4 md:min-w-[260px] md:max-w-[320px]">
              {/* 全天日程 */}
              <div className="card p-3 md:p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2 md:mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-600" />
                  全天日程
                </h3>
                {(() => {
                  const pad = (n: number) => String(n).padStart(2, '0')
                  const dayStr = `${selectedDayDate.getFullYear()}-${pad(selectedDayDate.getMonth() + 1)}-${pad(selectedDayDate.getDate())}`
                  const allDaySchedules = monthSchedules.filter(s => {
                    const startStr = s.start_time.slice(0, 10)
                    const endStr = s.end_time && s.end_time.length >= 10 ? s.end_time.slice(0, 10) : startStr
                    const inDayRange = dayStr >= startStr && dayStr <= endStr
                    if (!inDayRange) return false
                    const isAllDay = s.is_all_day || (s.start_time.slice(11, 16) === '00:00' && (!s.end_time || s.end_time.slice(11, 16) === '00:00'))
                    return isAllDay
                  })
                  if (allDaySchedules.length === 0) {
                    return <p className="text-xs text-[var(--text-tertiary)] text-center py-3">无全天日程</p>
                  }
                  return (
                    <div className="space-y-2">
                      {allDaySchedules.map(s => {
                        const colorIdx = scheduleColorMap[s.id] ?? 0
                        const color = scheduleColors[colorIdx]
                        return (
                          <div
                            key={s.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/json', JSON.stringify({ type: 'schedule', item: s }))
                            }}
                            onClick={() => {
                              setEditingSchedule(s)
                              fillFormFromSchedule(s)
                              setShowModal(true)
                            }}
                            className="flex items-center gap-2 p-2 md:p-2.5 rounded-md cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
                            style={{ borderLeft: `3px solid ${color.hex}` }}
                          >
                            <span className="text-sm text-[var(--text-primary)] truncate flex-1">{s.title}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* 任务待办 */}
              <div className="card p-3 md:p-4 flex-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2 md:mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                  任务待办
                </h3>
                <div className="space-y-1.5">
                  {tasks.filter(t => !t.is_completed && !t.deleted_at).length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)] text-center py-3">暂无待办</p>
                  ) : (
                    tasks.filter(t => !t.is_completed && !t.deleted_at).map(task => (
                      <div key={task.id}>
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'task', item: task }))
                          }}
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors group"
                          onClick={() => {
                            const date = new Date(selectedDayDate)
                            const dateStr = toLocalDateStr(date)
                            setSelectedDate(dateStr)
                            setForm(prev => ({
                              ...prev,
                              title: task.title,
                              content: task.description || '',
                              start_time: dateStr,
                              end_time: dateStr,
                              start_time_value: '09:00',
                              end_time_value: '10:00',
                              is_all_day: false,
                            }))
                            setShowModal(true)
                          }}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { is_completed: true })
                              if (user) {
                                const updated = { ...task, is_completed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
                                syncUpsert('tasks', user.id, updated, taskToDb).then(r => {
                                  if (!r.success) console.error('[Calendar] Failed to sync task completion:', r.error)
                                })
                              }
                            }}
                            className="w-4 h-4 rounded border border-[var(--border-color)] flex-shrink-0 hover:border-primary-600 flex items-center justify-center"
                          />
                          <span className="text-sm text-[var(--text-primary)] truncate flex-1">{task.title}</span>
                        </div>
                        {task.subtasks && task.subtasks.length > 0 && (
                          <div className="ml-6 mt-0.5 space-y-0.5">
                            {task.subtasks.map(sub => (
                              <div
                                key={sub.id}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('application/json', JSON.stringify({
                                    type: 'task',
                                    item: {
                                      ...task,
                                      title: `${task.title} - ${sub.title}`,
                                      description: task.description,
                                    }
                                  }))
                                }}
                                className="flex items-center gap-2 p-2.5 rounded-md hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors group"
                                onClick={() => {
                                  const date = new Date(selectedDayDate)
                                  const dateStr = toLocalDateStr(date)
                                  setSelectedDate(dateStr)
                                  setForm(prev => ({
                                    ...prev,
                                    title: `${task.title} - ${sub.title}`,
                                    content: task.description || '',
                                    start_time: dateStr,
                                    end_time: dateStr,
                                    start_time_value: '09:00',
                                    end_time_value: '10:00',
                                    is_all_day: false,
                                  }))
                                  setShowModal(true)
                                }}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const updatedSubtasks = task.subtasks.map(s =>
                                      s.id === sub.id ? { ...s, is_completed: !s.is_completed } : s
                                    )
                                    updateTask(task.id, { subtasks: updatedSubtasks })
                                    if (user) {
                                      const updated = { ...task, subtasks: updatedSubtasks, updated_at: new Date().toISOString() }
                                      syncUpsert('tasks', user.id, updated, taskToDb).then(r => {
                                        if (!r.success) console.error('[Calendar] Failed to sync subtask toggle:', r.error)
                                      })
                                    }
                                  }}
                                  className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${sub.is_completed ? 'bg-primary-600 border-primary-600' : 'border-[var(--border-color)] hover:border-primary-600'}`}
                                >
                                  {sub.is_completed && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                </button>
                                <span className={`text-xs truncate flex-1 ${sub.is_completed ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-secondary)]'}`}>{sub.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm() }}
        title={editingSchedule ? '编辑日程' : '新建日程'}
        footer={<>
          <button onClick={() => { setShowModal(false); resetForm() }} className="btn-secondary">取消</button>
          <button onClick={handleSave} className="btn-primary">{editingSchedule ? '保存' : '创建'}</button>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">标题</label>
            <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="日程标题" className="input-dark" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">详情</label>
            <textarea value={form.content} onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))} placeholder="详情（可选）" rows={2} className="input-dark resize-none" />
          </div>
          {/* 全天事件开关：受 scheduleAllDay 开关控制 */}
          {flags.scheduleAllDay !== false && (
            <div className="flex items-center gap-2 mb-1">
              <input
                type="checkbox"
                id="is_all_day"
                checked={form.is_all_day}
                onChange={e => setForm(prev => ({ ...prev, is_all_day: e.target.checked }))}
                className="w-4 h-4 rounded text-primary-600"
              />
              <label htmlFor="is_all_day" className="text-sm text-[var(--text-secondary)]">全天日程</label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">开始日期</label>
              <input type="date" value={form.start_time} onChange={e => setForm(prev => ({ ...prev, start_time: e.target.value }))} className="input-dark" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">结束日期</label>
              <input type="date" value={form.end_time} onChange={e => setForm(prev => ({ ...prev, end_time: e.target.value }))} className="input-dark" />
            </div>
          </div>
          {!form.is_all_day && (
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">开始时间</label>
                <input type="time" value={form.start_time_value} onChange={e => setForm(prev => ({ ...prev, start_time_value: e.target.value }))} className="input-dark" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">结束时间</label>
                <input type="time" value={form.end_time_value} onChange={e => setForm(prev => ({ ...prev, end_time_value: e.target.value }))} className="input-dark" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">关联规划</label>
            <select value={form.plan_id || ''} onChange={e => setForm(prev => ({ ...prev, plan_id: e.target.value || null }))} className="input-dark">
              <option value="">不关联</option>
              {plans.filter(p => !p.deleted_at).map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          {/* 提醒设置 */}
          <ReminderSettings
            enabled={form.is_reminder}
            mode={form.reminder_mode}
            customTime={form.reminder_time}
            minutes={form.reminder_minutes}
            itemType="schedule"
            startTime={form.start_time + 'T' + (form.is_all_day ? '00:00' : form.start_time_value)}
            endTime={(form.end_time || form.start_time) + 'T' + (form.is_all_day ? '00:00' : form.end_time_value)}
            onChange={val => setForm(prev => ({
              ...prev,
              is_reminder: val.enabled,
              reminder_mode: val.mode,
              reminder_time: val.customTime,
              reminder_minutes: val.minutes,
              reminder_type: val.enabled ? 'popup' : null,
            }))}
          />
          {/* 标签选择 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">标签</label>
            {/* 已选标签 */}
            {form.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {form.tags.map(tag => {
                  const color = getTagColor(tag)
                  return (
                    <span
                      key={tag}
                      className="tag-pill flex items-center gap-1 text-xs"
                      style={{ background: `${color}15`, color, borderColor: `${color}30` }}
                    >
                      {tag}
                      <button onClick={() => setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}>
                        <X size={12} />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            {/* 预设标签快捷选择 */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {storeTags.map(tag => {
                const selected = form.tags.includes(tag.name)
                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      if (selected) {
                        setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag.name) }))
                      } else {
                        setForm(prev => ({ ...prev, tags: [...prev.tags, tag.name] }))
                      }
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                      selected ? 'text-white' : 'border'
                    }`}
                    style={
                      selected
                        ? { background: tag.color }
                        : { background: `${tag.color}10`, color: tag.color, borderColor: `${tag.color}30` }
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: selected ? 'white' : tag.color }} />
                    {tag.name}
                  </button>
                )
              })}
            </div>
            {/* 自定义标签输入 */}
            <input
              type="text"
              value={form.tagInput}
              onChange={e => setForm(prev => ({ ...prev, tagInput: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter' && form.tagInput.trim()) {
                  e.preventDefault()
                  const newTag = form.tagInput.trim()
                  if (!form.tags.includes(newTag)) {
                    setForm(prev => ({ ...prev, tags: [...prev.tags, newTag], tagInput: '' }))
                    handleAddCustomTag(newTag)
                  } else {
                    setForm(prev => ({ ...prev, tagInput: '' }))
                  }
                }
              }}
              placeholder="输入自定义标签回车添加"
              className="input-dark text-sm py-1.5 px-3 w-full"
            />
          </div>
        </div>
      </Modal>

      {/* 删除确认 */}
      {confirmDelete && (
        <ConfirmDialog isOpen={true} onClose={() => setConfirmDelete(null)}
          onConfirm={() => { const s = schedules.find(sch => sch.id === confirmDelete); if (s) handleDelete(s) }}
          title="确认删除" message="删除后日程将进入回收站。" type="danger" />
      )}

      {/* 排班设置弹窗 */}
      {showShiftModal && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowShiftModal(false)}>
          <div className="bg-[var(--bg-primary)] rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-lg md:mx-4 p-4 md:p-6 max-h-[90vh] md:max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* 移动端底部弹窗拖拽指示条 */}
            <div className="md:hidden flex justify-center mb-2">
              <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
            </div>
            <div className="flex items-center justify-between gap-2 md:gap-3 mb-3 md:mb-6">
              <h3 className="text-base md:text-lg font-semibold">排班设置</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setShiftDate(new Date(sYear, sMonth - 1, 1))} disabled={sYear === year && sMonth <= month} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-30">&lt;</button>
                <span className="text-sm font-semibold min-w-[80px] text-center">{sYear}年{sMonth + 1}月</span>
                <button onClick={() => setShiftDate(new Date(sYear, sMonth + 1, 1))} disabled={sYear === year && sMonth >= month + 3} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-30">&gt;</button>
              </div>
            </div>

            {/* 快捷操作按钮 */}
            <div className="flex flex-wrap gap-2 md:gap-2 mb-3 md:mb-4">
              <button onClick={fillAllWork} className="btn-secondary text-xs">全部设为上班</button>
              <button onClick={fillAllRest} className="btn-secondary text-xs">按周末休息</button>
              <button onClick={clearAll} className="btn-secondary text-xs">清空排班</button>
            </div>

            {/* 日历网格 - 每天一个格子，可点击切换排班类型 */}
            <div className="grid grid-cols-7 gap-1">
              {/* 星期标题 */}
              {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                <div key={d} className="text-center text-xs text-[var(--text-tertiary)] py-1">{d}</div>
              ))}
              {/* 星期对齐空格 */}
              {Array.from({ length: sStartPadding }).map((_, i) => (
                <div key={`spad-${i}`} className="min-h-[40px] md:aspect-square" />
              ))}
              {/* 日期格子 */}
              {Array.from({ length: sDaysInMonth }).map((_, i) => {
                const day = i + 1
                const shiftType = pendingShifts.get(day) || null
                return (
                  <button key={day} onClick={() => toggleDayShift(day)}
                    className={`min-h-[40px] md:aspect-square rounded-lg text-xs font-medium flex flex-col items-center justify-center gap-0.5 transition-all
                      ${shiftType === 'work' ? 'bg-blue-500 text-white' :
                        shiftType === 'rest' ? 'bg-green-500 text-white' :
                        shiftType === 'public_rest' ? 'bg-orange-500 text-white' :
                        'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`}>
                    <span className="text-xs">{day}</span>
                    {shiftType && (
                      <span className="text-[9px]">
                        {shiftType === 'work' ? '班' : shiftType === 'rest' ? '休' : '公'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 切换说明 */}
            <p className="text-xs text-[var(--text-tertiary)] mt-3">
              点击日期切换排班类型：无 → 上班(蓝) → 休息(绿) → 公休(橙) → 无
            </p>

            <div className="flex justify-end gap-2 mt-3 md:mt-4">
              <button onClick={() => setShowShiftModal(false)} className="btn-secondary text-xs md:text-sm">取消</button>
              <button onClick={saveShifts} className="btn-primary text-xs md:text-sm">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage

