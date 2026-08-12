import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHabitStore, useAppStore, usePoinStore } from '@/store'
import { syncDelete, syncUpsert, habitToDb } from '@/lib/sync'
import { earnPoin, deductPoin, canCheckinNegativeHabit, refundPoin } from '@/lib/poin'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '@/components/Modal/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ReminderSettings from '@/components/ReminderSettings'
import { useDragReorder } from '@/hooks/useDragReorder'
import { useDevice } from '@/hooks/useDevice'
import {
  Plus, TrendingUp, Check, Trash, Edit, BarChart2,
  Download, X, Move, Coins, ImageIcon
} from '@/utils/icons'
import type { Habit } from '@/types'
import { generateUUID } from '@/lib/utils'

const HabitPage: React.FC = () => {
  /* Desktop-only */

  const navigate = useNavigate()
  const { habits, addHabit, updateHabit, deleteHabit, checkin, uncheckin, reorderHabits } = useHabitStore()
  const { user, settings, addNotification } = useAppStore()
  // 获取各板块功能开关
  const flags = settings.featureFlags || {}
  // 移动端布局检测：< 1024px 启用移动端布局
  const { useMobileLayout } = useDevice()
  const [showModal, setShowModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showChart, setShowChart] = useState<string | null>(null)
  const [checkinNote, setCheckinNote] = useState('')
  const [checkinImages, setCheckinImages] = useState<string[]>([])
  const [checkinHabitId, setCheckinHabitId] = useState<string | null>(null)
  const [viewingImages, setViewingImages] = useState<string[] | null>(null)
  const [checkinDate, setCheckinDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const chartRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    name: '', type: 'positive' as Habit['type'], reward_poin: 1, deduct_poin: 1,
    reminder_enabled: false, reminder_mode: 'custom' as 'custom' | 'at_start' | 'before_start' | 'at_end' | 'before_end',
    reminder_time: '', reminder_minutes: 15
  })

  // 按 sort_order 排序后的有效习惯（同时用于拖拽排序与渲染）
  const activeHabits = habits
    .filter(h => !h.deleted_at)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))

  // 习惯拖拽排序
  const { dragIndex, draggedOver, handleDragStart, handleDragOver, handleDrop, handleDragEnd } = useDragReorder(activeHabits, reorderHabits)

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const resetForm = () => {
    setForm({ name: '', type: 'positive', reward_poin: 1, deduct_poin: 1, reminder_enabled: false, reminder_mode: 'custom', reminder_time: '', reminder_minutes: 15 })
    setEditingHabit(null)
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    // 提醒数据
    const reminderData = form.reminder_enabled ? {
      reminder_enabled: true,
      reminder_mode: form.reminder_mode,
      reminder_time: form.reminder_mode === 'custom' && form.reminder_time
        ? form.reminder_time : null,
      reminder_minutes: form.reminder_minutes,
      reminder_triggered: false,
    } : { reminder_enabled: false, reminder_time: null, reminder_mode: 'custom', reminder_triggered: false }

    if (editingHabit) {
      updateHabit(editingHabit.id, { name: form.name, type: form.type, reward_poin: form.reward_poin, deduct_poin: form.deduct_poin, ...reminderData })
      if (user) {
        const updated = { ...editingHabit, name: form.name, type: form.type, reward_poin: form.reward_poin, deduct_poin: form.deduct_poin, ...reminderData, updated_at: new Date().toISOString() }
        syncUpsert('habits', user.id, updated, habitToDb).then(r => {
          if (!r.success) console.error('[Habit] Failed to sync update habit:', r.error)
        })
      }
    } else {
      const newHabit = {
        id: generateUUID(),
        user_id: user?.id || 'current-user',
        name: form.name,
        type: form.type,
        reward_poin: form.reward_poin,
        deduct_poin: form.deduct_poin,
        ...reminderData,
        checkins: [],
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      addHabit(newHabit)
      if (user) {
        syncUpsert('habits', user.id, newHabit, habitToDb).then(r => {
          if (!r.success) console.error('[Habit] Failed to sync add habit:', r.error)
        })
      }
    }
    setShowModal(false)
    resetForm()
  }

  // Poin 奖惩：打卡后自动结算
  const handlePoinAfterCheckin = async (habitId: string) => {
    const poinConfig = usePoinStore.getState().config
    if (!poinConfig.enable || !user) return
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return

    try {
      if (habit.type === 'positive') {
        const reward = habit.reward_poin ?? 0
        if (reward > 0) {
          await earnPoin(user.id, reward, 'habit', habit.id, `正向习惯打卡：${habit.name}`)
          addNotification({ message: `获得 ${reward} Poin`, type: 'success' })
        }
      } else {
        const deduct = habit.deduct_poin ?? 0
        if (deduct > 0) {
          // 检查是否可以打卡（透支规则）
          const check = canCheckinNegativeHabit(usePoinStore.getState().balance, deduct)
          if (!check.canCheckin) {
            addNotification({ message: check.reason || 'Poin 不足，无法打卡', type: 'warning' })
            return
          }
          const result = await deductPoin(user.id, deduct, 'habit', habit.id, `消极习惯打卡：${habit.name}`)
          if (result.usedExemption) {
            addNotification({ message: '已使用豁免券，免除扣除', type: 'info' })
          } else {
            addNotification({ message: `扣除 ${deduct} Poin`, type: 'warning' })
          }
        }
      }
    } catch (e: any) {
      if (e.message === 'POIN_INSUFFICIENT') {
        addNotification({ message: 'Poin 余额不足且未开启透支', type: 'warning' })
      } else {
        console.error('[Habit] Poin settlement error:', e)
      }
    }
  }

  // Poin 撤回：撤销打卡后自动回退 Poin
  const handlePoinAfterUncheckin = async (habitId: string) => {
    const poinConfig = usePoinStore.getState().config
    if (!poinConfig.enable || !user) return
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return

    try {
      await refundPoin(user.id, 'habit', habit.id, `撤回打卡：${habit.name}`)
      const { addNotification } = useAppStore.getState()
      if (habit.type === 'positive') {
        const reward = habit.reward_poin ?? 0
        if (reward > 0) addNotification({ message: `退回 ${reward} Poin`, type: 'warning' })
      } else {
        const deduct = habit.deduct_poin ?? 0
        if (deduct > 0) addNotification({ message: `返还 ${deduct} Poin`, type: 'success' })
      }
    } catch (e: any) {
      console.error('[Habit] Poin refund error:', e)
    }
  }

  const handleCheckin = () => {
    if (!checkinHabitId || !checkinDate) return
    checkin(checkinHabitId, checkinDate, checkinNote, checkinImages)
    if (user) {
      const habit = habits.find(h => h.id === checkinHabitId)
      if (habit) {
        const updated = { ...habit, checkins: [...habit.checkins, { date: checkinDate, note: checkinNote, images: checkinImages }], updated_at: new Date().toISOString() }
        syncUpsert('habits', user.id, updated, habitToDb).then(r => {
          if (!r.success) console.error('[Habit] Failed to sync checkin:', r.error)
        })
      }
      // Poin 奖惩结算
      handlePoinAfterCheckin(checkinHabitId)
    }
    setCheckinHabitId(null)
    setCheckinNote('')
    setCheckinImages([])
    const d = new Date()
    setCheckinDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const openCheckin = (habitId: string, date?: string) => {
    const d = date ? new Date(date + 'T00:00:00') : new Date()
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // 关闭打卡备注时：跳过备注输入弹窗，直接记录
    if (flags.habitCheckinNote === false) {
      // 消极习惯在 Poin 未开启透支且余额不足时阻止打卡
      const poinConfig = usePoinStore.getState().config
      const habit = habits.find(h => h.id === habitId)
      if (poinConfig.enable && habit?.type === 'negative') {
        const deduct = habit.deduct_poin ?? 0
        const check = canCheckinNegativeHabit(usePoinStore.getState().balance, deduct)
        if (!check.canCheckin) {
          addNotification({ message: check.reason || 'Poin 不足，无法打卡', type: 'warning' })
          return
        }
      }
      checkin(habitId, ds, '')
      if (user) {
        const habit = habits.find(h => h.id === habitId)
        if (habit) {
          const updated = { ...habit, checkins: [...habit.checkins, { date: ds, note: '' }], updated_at: new Date().toISOString() }
          syncUpsert('habits', user.id, updated, habitToDb).then(r => {
            if (!r.success) console.error('[Habit] Failed to sync checkin:', r.error)
          })
        }
        // Poin 奖惩结算
        handlePoinAfterCheckin(habitId)
      }
      return
    }
    setCheckinHabitId(habitId)
    setCheckinDate(ds)
    const habit = habits.find(h => h.id === habitId)
    const existing = habit?.checkins.find(c => c.date === ds)
    setCheckinNote(existing?.note || '')
    setCheckinImages(existing?.images || [])
  }

  // ===== 数据统计计算 =====
  const getStats = (habit: Habit) => {
    const checkinMap = new Map(habit.checkins.map(c => [c.date, c]))
    const dates = habit.checkins.map(c => c.date).sort()

    // 最长连续天数
    let maxStreak = 0
    let currentStreak = 0
    let prevDate: Date | null = null
    for (const dateStr of dates) {
      const d = new Date(dateStr + 'T00:00:00')
      if (prevDate) {
        const diff = (d.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000)
        if (diff === 1) currentStreak++
        else currentStreak = 1
      } else {
        currentStreak = 1
      }
      prevDate = d
      maxStreak = Math.max(maxStreak, currentStreak)
    }

    // 当前连续天数
    let nowStreak = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (checkinMap.has(ds)) nowStreak++
      else if (i > 0) break
    }

    // 距离上次（天数）
    let daysSinceLast = -1
    if (dates.length > 0) {
      const last = new Date(dates[dates.length - 1] + 'T00:00:00')
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      daysSinceLast = Math.floor((now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000))
    }

    // 平均间隔
    let avgInterval = 0
    if (dates.length >= 2) {
      const first = new Date(dates[0] + 'T00:00:00').getTime()
      const last = new Date(dates[dates.length - 1] + 'T00:00:00').getTime()
      const daysSpan = (last - first) / (24 * 60 * 60 * 1000)
      avgInterval = Math.round((daysSpan / (dates.length - 1)) * 10) / 10
    }

    // 本周/本月/本年统计
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)

    const weekCount = dates.filter(d => new Date(d + 'T00:00:00') >= weekStart).length
    const monthCount = dates.filter(d => new Date(d + 'T00:00:00') >= monthStart).length
    const yearCount = dates.filter(d => new Date(d + 'T00:00:00') >= yearStart).length

    // 近 N 天完成率（仅积极习惯有意义）
    const getRate = (days: number) => {
      let count = 0
      for (let i = 0; i < days; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (checkinMap.has(ds)) count++
      }
      return Math.round((count / days) * 100)
    }

    // 星期分布
    const weekDays = [0, 0, 0, 0, 0, 0, 0]
    for (const c of habit.checkins) {
      const day = new Date(c.date + 'T00:00:00').getDay()
      weekDays[day]++
    }
    const weekDayMax = Math.max(...weekDays, 1)

    // 近12个月趋势
    const monthlyTrend: { label: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const count = dates.filter(dateStr => {
        const dd = new Date(dateStr + 'T00:00:00')
        return dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth()
      }).length
      monthlyTrend.push({ label, count })
    }
    const monthMax = Math.max(...monthlyTrend.map(m => m.count), 1)

    // 近90天每日状态（用于热力图）
    const last90Days = Array.from({ length: 90 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (89 - i))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })

    return {
      maxStreak, nowStreak, daysSinceLast, avgInterval,
      weekCount, monthCount, yearCount,
      rate7: getRate(7), rate30: getRate(30), rate90: getRate(90),
      weekDays, weekDayMax, monthlyTrend, monthMax,
      last90Days, checkinMap
    }
  }

  const exportChart = async () => {
    if (!chartRef.current) return
    // 克隆节点用于导出，将"查看图片"替换为"附图，请到客户端查看"
    const clone = chartRef.current.cloneNode(true) as HTMLElement
    clone.querySelectorAll('button').forEach(btn => {
      if (btn.textContent?.includes('查看图片')) {
        btn.textContent = '附图，请到客户端查看'
      }
    })
    // 临时挂载到 DOM 以便 html2canvas 渲染
    clone.style.position = 'absolute'
    clone.style.left = '-9999px'
    clone.style.top = '0'
    clone.style.width = chartRef.current.offsetWidth + 'px'
    document.body.appendChild(clone)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(clone)
      const link = document.createElement('a')
      link.download = `习惯记录总结_${today}.png`
      link.href = canvas.toDataURL()
      link.click()
    } finally {
      document.body.removeChild(clone)
    }
  }

  return (
    <div className="page-container">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 lg:gap-3 mb-3 lg:mb-6">
          <div>
            <h1 className="page-title mb-2">习惯记录</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-600/10 text-primary-600">
                {activeHabits.length} 个习惯
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                今日已打卡 {activeHabits.filter(h => h.checkins.find(c => c.date === today)).length} 个
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
            <button onClick={() => navigate('/habit/stats')} className="text-xs lg:text-sm text-[#6B4C9A] hover:text-[#5a3f85] flex items-center gap-1 px-2 py-1.5 lg:px-0 lg:py-0 min-h-[44px] lg:min-h-0">
              <BarChart2 size={14} />
              <span>统计</span>
            </button>
            <button onClick={() => { resetForm(); setShowModal(true) }} className="btn-primary text-xs lg:text-sm flex items-center gap-1.5">
              <Plus size={14} /> 新建
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3 lg:gap-4">
          <AnimatePresence>
            {activeHabits.map((habit, index) => {
              const todayCheckin = habit.checkins.find(c => c.date === today)
              const streak = (() => {
                let s = 0
                for (let i = 0; i < 365; i++) {
                  const d = new Date()
                  d.setDate(d.getDate() - i)
                  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  if (habit.checkins.find(c => c.date === ds)) s++
                  else if (i > 0) break
                }
                return s
              })()

              // 距离上次
              let daysSinceLast = -1
              const sorted = habit.checkins.map(c => c.date).sort()
              if (sorted.length > 0) {
                const last = new Date(sorted[sorted.length - 1] + 'T00:00:00')
                const now = new Date()
                now.setHours(0, 0, 0, 0)
                daysSinceLast = Math.floor((now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000))
              }

              return (
                <motion.div key={habit.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  draggable={!useMobileLayout}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  className={`card-hover relative group ${dragIndex === index ? 'opacity-40' : ''} ${draggedOver === index ? 'ring-2 ring-primary-500' : ''}`}>
                  {/* 拖拽手柄（仅桌面端 hover 显示，移动端隐藏） */}
                  <div className="absolute top-1 left-1 z-10 hidden lg:block opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-[var(--text-tertiary)]">
                    <Move size={14} />
                  </div>
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-[var(--text-primary)] break-words">{habit.name}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          habit.type === 'positive' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                        }`}>
                          {habit.type === 'positive' ? '积极' : '消极'}
                        </span>
                        {/* Poin 奖惩标注 */}
                        {usePoinStore.getState().config.enable && (
                          habit.type === 'positive'
                            ? (habit.reward_poin ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                                <Coins size={10} /> +{habit.reward_poin}
                              </span>
                            )
                            : (habit.deduct_poin ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                                <Coins size={10} /> -{habit.deduct_poin}
                              </span>
                            )
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {habit.type === 'positive'
                          ? `连续 ${streak} 天 · 总计 ${habit.checkins.length} 次`
                          : daysSinceLast >= 0
                            ? `距离上次 ${daysSinceLast} 天 · 总计 ${habit.checkins.length} 次`
                            : `总计 ${habit.checkins.length} 次`
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setShowChart(habit.id)}
                        className="p-2.5 lg:p-2.5 rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center">
                        <BarChart2 size={15} />
                      </button>
                      <button onClick={() => {
                        setEditingHabit(habit)
                        setForm({
                          name: habit.name, type: habit.type,
                          reward_poin: habit.reward_poin ?? 1, deduct_poin: habit.deduct_poin ?? 1,
                          reminder_enabled: habit.reminder_enabled ?? false,
                          reminder_mode: habit.reminder_mode ?? 'custom',
                          reminder_time: habit.reminder_time || '',
                          reminder_minutes: habit.reminder_minutes ?? 15
                        })
                        setShowModal(true)
                      }} className="p-2.5 lg:p-2.5 rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => setConfirmDelete(habit.id)}
                        className="p-2.5 lg:p-2.5 rounded-button hover:bg-red-50 text-[var(--text-tertiary)] hover:text-danger min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center">
                        <Trash size={15} />
                      </button>
                    </div>
                  </div>

                  {/* 最近7天记录状态 - 可点击补录/取消 */}
                  <div className="flex items-center gap-0.5 md:gap-1.5 mb-3">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = new Date()
                      d.setDate(d.getDate() - (6 - i))
                      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      const checked = habit.checkins.find(c => c.date === ds)
                      const isToday = i === 6
                      return (
                        <div key={i} className="flex-1 text-center relative min-w-0">
                          <button
                            onClick={() => {
                        if (checked) {
                          uncheckin(habit.id, ds)
                          if (user) {
                            const h = habits.find(x => x.id === habit.id)
                            if (h) {
                              const upd = { ...h, checkins: h.checkins.filter(c => c.date !== ds), updated_at: new Date().toISOString() }
                              syncUpsert('habits', user.id, upd, habitToDb).then(r => {
                                if (!r.success) console.error('[Habit] Failed to sync uncheckin:', r.error)
                              })
                            }
                            handlePoinAfterUncheckin(habit.id)
                          }
                        } else {
                          openCheckin(habit.id, ds)
                        }
                      }}
                            className={`w-10 h-10 md:w-8 md:h-8 mx-auto rounded-button flex items-center justify-center text-xs font-medium transition-all hover:scale-105 ${
                              checked
                                ? habit.type === 'positive' ? 'bg-success text-white' : 'bg-warning text-white'
                                : isToday
                                  ? 'border-2 border-dashed border-primary-600 text-primary-600'
                                  : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)]'
                            }`}
                            title={checked ? '点击取消记录' : '点击补录'}
                          >
                            {checked ? <Check size={14} /> : d.getDate()}
                          </button>
                          <span className="text-xs text-[var(--text-tertiary)] mt-0.5 block">
                            {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                          </span>
                          {checked && (
                            <button
                              onClick={() => {
                                uncheckin(habit.id, ds)
                                if (user) {
                                  const h = habits.find(x => x.id === habit.id)
                                  if (h) {
                                    const upd = { ...h, checkins: h.checkins.filter(c => c.date !== ds), updated_at: new Date().toISOString() }
                                    syncUpsert('habits', user.id, upd, habitToDb).then(r => {
                                      if (!r.success) console.error('[Habit] Failed to sync uncheckin:', r.error)
                                    })
                                  }
                                  handlePoinAfterUncheckin(habit.id)
                                }
                              }}
                              className="absolute -top-1 -right-1 w-5 h-5 md:w-3.5 md:h-3.5 bg-danger rounded-full text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity min-w-[20px] min-h-[20px] md:min-w-0 md:min-h-0"
                              title="取消记录"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* 今日备注预览 */}
                  {todayCheckin && todayCheckin.note && (
                    <div className="bg-[var(--bg-secondary)] rounded-button p-2 mb-2">
                      <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-all leading-relaxed">{todayCheckin.note}</p>
                    </div>
                  )}

                  {!todayCheckin ? (
                    <button onClick={() => openCheckin(habit.id)}
                      className="w-full btn-primary py-2 min-h-[44px] text-sm flex items-center justify-center gap-2">
                      <Check size={16} /> 今日记录
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => openCheckin(habit.id)}
                        className="flex-1 py-2 min-h-[44px] text-sm text-center text-success bg-success/10 rounded-button hover:bg-success/20 transition-colors flex items-center justify-center">
                        今日已记录
                      </button>
                      <button onClick={() => {
                        uncheckin(habit.id, today)
                        if (user) {
                          const h = habits.find(x => x.id === habit.id)
                          if (h) {
                            const upd = { ...h, checkins: h.checkins.filter(c => c.date !== today), updated_at: new Date().toISOString() }
                            syncUpsert('habits', user.id, upd, habitToDb).then(r => {
                              if (!r.success) console.error('[Habit] Failed to sync uncheckin:', r.error)
                            })
                          }
                          handlePoinAfterUncheckin(habit.id)
                        }
                      }}
                        className="px-3 py-2 min-h-[44px] text-sm text-danger bg-danger/10 rounded-button hover:bg-danger/20 transition-colors flex items-center justify-center"
                        title="取消今日记录">
                        取消
                      </button>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {activeHabits.length === 0 && (
          <div className="empty-state">
            <TrendingUp size={32} className="text-[var(--text-tertiary)] mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">还没有记录项，点击右上角新建</p>
          </div>
        )}

      </div>

      {/* 新建/编辑弹窗 */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm() }}
        title={editingHabit ? '编辑记录项' : '新建记录项'}
        footer={<>
          <button onClick={() => { setShowModal(false); resetForm() }} className="btn-secondary flex-1 md:flex-none">取消</button>
          <button onClick={handleSave} className="btn-primary flex-1 md:flex-none">{editingHabit ? '保存' : '创建'}</button>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">名称</label>
            <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：每天阅读30分钟 / 抽烟" className="input-dark" />
          </div>
          {/* 类型选择器：受 habitNegative 开关控制（关闭时强制为积极） */}
          {flags.habitNegative !== false && (
            <div>
              <label className="block text-sm font-medium mb-1.5">类型</label>
              <div className="flex gap-3">
                <button onClick={() => setForm(prev => ({ ...prev, type: 'positive' }))}
                  className={`flex-1 py-2.5 min-h-[44px] rounded-button text-sm font-medium border-2 transition-all ${
                    form.type === 'positive' ? 'border-success bg-success/10 text-success' : 'border-[var(--border-color)] text-[var(--text-secondary)]'
                  }`}>
                  积极（想要坚持）
                </button>
                <button onClick={() => setForm(prev => ({ ...prev, type: 'negative' }))}
                  className={`flex-1 py-2.5 min-h-[44px] rounded-button text-sm font-medium border-2 transition-all ${
                    form.type === 'negative' ? 'border-warning bg-warning/10 text-warning' : 'border-[var(--border-color)] text-[var(--text-secondary)]'
                  }`}>
                  消极（想要减少）
                </button>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
                {form.type === 'positive'
                  ? '积极记录：关注连续天数和完成率，帮助你建立好习惯'
                  : '消极记录：关注间隔天数，帮助你减少坏习惯的发生频率'}
              </p>
            </div>
          )}
          {/* Poin 奖惩设置：仅在 Poin 系统开启时显示 */}
          {usePoinStore.getState().config.enable && (
            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <Coins size={14} className="text-primary-600" />
                {form.type === 'positive' ? '打卡获得 Poin' : '打卡扣除 Poin'}
              </label>
              <input
                type="number"
                min={0}
                value={(form.type === 'positive' ? form.reward_poin : form.deduct_poin) || ''}
                onChange={e => {
                  const val = Math.max(0, Number(e.target.value) || 0)
                  setForm(prev => ({
                    ...prev,
                    [form.type === 'positive' ? 'reward_poin' : 'deduct_poin']: val
                  }))
                }}
                className="input-dark"
              />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                {form.type === 'positive'
                  ? '每次打卡该积极习惯时自动获得指定数量的 Poin'
                  : '每次打卡该消极习惯时自动扣除指定数量的 Poin（可被豁免券抵消）'}
              </p>
            </div>
          )}

          {/* 提醒设置 */}
          <ReminderSettings
            enabled={form.reminder_enabled}
            mode={form.reminder_mode}
            customTime={form.reminder_time}
            minutes={form.reminder_minutes}
            itemType="habit"
            onChange={val => setForm(prev => ({
              ...prev,
              reminder_enabled: val.enabled,
              reminder_mode: val.mode,
              reminder_time: val.customTime,
              reminder_minutes: val.minutes,
            }))}
          />
        </div>
      </Modal>

      {/* 记录弹窗 - 支持选择日期 */}
      <Modal isOpen={!!checkinHabitId}
        onClose={() => { setCheckinHabitId(null); setCheckinNote(''); setCheckinImages([]); const d = new Date(); setCheckinDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`) }}
        title="记录"
        footer={<>
          <button onClick={() => { setCheckinHabitId(null); setCheckinNote(''); setCheckinImages([]); const d = new Date(); setCheckinDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`) }} className="btn-secondary flex-1 md:flex-none">取消</button>
          <button onClick={handleCheckin} className="btn-primary flex-1 md:flex-none">确认记录</button>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">日期</label>
            <input type="date" value={checkinDate} max={today}
              onChange={e => {
                setCheckinDate(e.target.value)
                const habit = habits.find(h => h.id === checkinHabitId)
                const existing = habit?.checkins.find(c => c.date === e.target.value)
                setCheckinNote(existing?.note || '')
                setCheckinImages(existing?.images || [])
              }}
              className="input-dark" />
            <p className="text-xs text-[var(--text-tertiary)] mt-1">可以选择过去的日期进行补录</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">备注（可选）</label>
            <textarea value={checkinNote} onChange={e => setCheckinNote(e.target.value)}
              placeholder="今天的感受或记录..." rows={3} className="input-dark resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">图片（可选，最多3张）</label>
            <div className="flex flex-wrap gap-2">
              {checkinImages.map((img, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border-color)]">
                  <img src={img} alt={`图片${i+1}`} className="w-full h-full object-cover" />
                  <button onClick={() => setCheckinImages(checkinImages.filter((_, idx) => idx !== i))}
                    className="absolute top-0 right-0 w-7 h-7 bg-danger text-white rounded-bl-lg flex items-center justify-center hover:bg-danger/80 min-w-[28px] min-h-[28px]">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {checkinImages.length < 3 && (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-[var(--border-color)] flex items-center justify-center cursor-pointer hover:border-primary-600 transition-colors">
                  <ImageIcon size={20} className="text-[var(--text-tertiary)]" />
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 5 * 1024 * 1024) { alert('图片大小不能超过5MB'); return }
                    const reader = new FileReader()
                    reader.onload = () => { setCheckinImages([...checkinImages, reader.result as string]) }
                    reader.readAsDataURL(file)
                    e.target.value = ''
                  }} />
                </label>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* 图表弹窗 - 增强数据可视化 */}
      <Modal isOpen={!!showChart} onClose={() => setShowChart(null)} title="记录数据分析" size="lg"
        footer={<>
          <button onClick={() => setShowChart(null)} className="btn-secondary flex-1 md:flex-none">关闭</button>
          <button onClick={exportChart} className="btn-primary flex items-center justify-center gap-2 flex-1 md:flex-none"><Download size={16} /> 导出图片</button>
        </>}>
        {showChart && (() => {
          const habit = activeHabits.find(h => h.id === showChart)
          if (!habit) return null
          const stats = getStats(habit)
          const isPositive = habit.type === 'positive'

          return (
            <div ref={chartRef} className="space-y-4 md:space-y-6">
              {/* 核心指标卡片 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
                {isPositive ? (
                  <>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-primary-600">{stats.nowStreak}</div>
                      <div className="text-xs text-[var(--text-secondary)]">当前连续</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-primary-600">{stats.maxStreak}</div>
                      <div className="text-xs text-[var(--text-secondary)]">最长连续</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-accent">{stats.avgInterval || '-'}</div>
                      <div className="text-xs text-[var(--text-secondary)]">平均间隔(天)</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-success">{habit.checkins.length}</div>
                      <div className="text-xs text-[var(--text-secondary)]">累计记录</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-primary-600">{stats.daysSinceLast >= 0 ? stats.daysSinceLast : '-'}</div>
                      <div className="text-xs text-[var(--text-secondary)]">距离上次(天)</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-accent">{stats.avgInterval || '-'}</div>
                      <div className="text-xs text-[var(--text-secondary)]">平均间隔(天)</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-warning">{stats.maxStreak}</div>
                      <div className="text-xs text-[var(--text-secondary)]">最长连续(天)</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-card p-3 text-center">
                      <div className="text-xl font-bold text-success">{habit.checkins.length}</div>
                      <div className="text-xs text-[var(--text-secondary)]">累计记录</div>
                    </div>
                  </>
                )}
              </div>

              {/* 周期频率统计 */}
              <div className="bg-[var(--bg-secondary)] rounded-card p-3 md:p-4">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2 md:mb-3">记录频率</h4>
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                  <div className="text-center">
                    <div className="text-lg md:text-2xl font-bold text-[var(--text-primary)]">{stats.weekCount}</div>
                    <div className="text-xs text-[var(--text-secondary)]">本周</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg md:text-2xl font-bold text-[var(--text-primary)]">{stats.monthCount}</div>
                    <div className="text-xs text-[var(--text-secondary)]">本月</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg md:text-2xl font-bold text-[var(--text-primary)]">{stats.yearCount}</div>
                    <div className="text-xs text-[var(--text-secondary)]">本年</div>
                  </div>
                </div>
              </div>

              {/* 近N天完成率（仅积极习惯） */}
              {isPositive && (
                <div className="bg-[var(--bg-secondary)] rounded-card p-3 md:p-4">
                  <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">近期完成率</h4>
                  <div className="space-y-3">
                    {[
                      { label: '近7天', rate: stats.rate7 },
                      { label: '近30天', rate: stats.rate30 },
                      { label: '近90天', rate: stats.rate90 }
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[var(--text-secondary)]">{item.label}</span>
                          <span className="font-medium text-[var(--text-primary)]">{item.rate}%</span>
                        </div>
                        <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${item.rate}%`, backgroundColor: item.rate >= 80 ? '#22c55e' : item.rate >= 50 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 消极习惯：间隔趋势 */}
              {!isPositive && stats.avgInterval > 0 && (
                <div className="bg-[var(--bg-secondary)] rounded-card p-3 md:p-4">
                  <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">间隔分析</h4>
                  <p className="text-sm text-[var(--text-secondary)]">
                    平均每隔 <span className="font-bold text-[var(--text-primary)]">{stats.avgInterval}</span> 天记录一次。
                    {stats.daysSinceLast >= 0 && (
                      <>
                        {' '}目前已维持 <span className="font-bold text-success">{stats.daysSinceLast}</span> 天未记录。
                        {stats.daysSinceLast > stats.avgInterval
                          ? ' 已经超过平均间隔，继续保持！'
                          : ' 还在平均间隔范围内，继续努力！'}
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* 星期分布条形图 */}
              <div className="bg-[var(--bg-secondary)] rounded-card p-3 md:p-4">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">星期分布</h4>
                <div className="flex items-end gap-1 md:gap-2 h-32">
                  {stats.weekDays.map((count, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-[var(--text-secondary)]">{count}</div>
                      <div className="w-full bg-[var(--bg-primary)] rounded-t-sm relative" style={{ height: '100px' }}>
                        <div className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-all duration-500 ${isPositive ? 'bg-primary-600' : 'bg-warning'}`}
                          style={{ height: `${(count / stats.weekDayMax) * 100}px` }} />
                      </div>
                      <span className="text-xs text-[var(--text-tertiary)]">{['日', '一', '二', '三', '四', '五', '六'][i]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 月度趋势 */}
              <div className="bg-[var(--bg-secondary)] rounded-card p-3 md:p-4">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">月度趋势（近12个月）</h4>
                <div className="flex items-end gap-1 h-28">
                  {stats.monthlyTrend.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-[var(--bg-primary)] rounded-t-sm relative" style={{ height: '80px' }}>
                        <div className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-all duration-500 ${isPositive ? 'bg-accent' : 'bg-warning'}`}
                          style={{ height: `${(m.count / stats.monthMax) * 80}px` }} title={`${m.label}: ${m.count}次`} />
                      </div>
                      <span className="text-[9px] text-[var(--text-tertiary)] whitespace-nowrap">{m.label.slice(5)}月</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 记录历史 */}
              <div className="bg-[var(--bg-secondary)] rounded-card p-3 md:p-4">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">记录历史</h4>
                <div className="space-y-1 max-h-96 overflow-auto">
                  {habit.checkins.slice().reverse().map(c => (
                    <div key={c.date} className="flex items-start justify-between text-sm py-1.5 px-2 rounded hover:bg-[var(--bg-primary)]">
                      <div className="flex-1 min-w-0">
                        <span className="text-[var(--text-secondary)]">{c.date}</span>
                        {c.note && (
                          <p className="text-xs text-[var(--text-tertiary)] whitespace-pre-wrap break-all leading-relaxed mt-0.5">{c.note}</p>
                        )}
                        {c.images && c.images.length > 0 && (
                          <button onClick={() => setViewingImages(c.images!)}
                            className="text-xs text-[#3B82F6] underline hover:text-[#2563EB] mt-0.5 min-h-[36px] flex items-center">
                            查看图片
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <button onClick={() => {
                          uncheckin(habit.id, c.date)
                          if (user) {
                            const h = habits.find(x => x.id === habit.id)
                            if (h) {
                              const upd = { ...h, checkins: h.checkins.filter(cc => cc.date !== c.date), updated_at: new Date().toISOString() }
                              syncUpsert('habits', user.id, upd, habitToDb).then(r => {
                                if (!r.success) console.error('[Habit] Failed to sync uncheckin:', r.error)
                              })
                            }
                            handlePoinAfterUncheckin(habit.id)
                          }
                        }}
                          className="p-2 md:p-0.5 text-danger hover:bg-danger/10 rounded min-w-[36px] min-h-[36px] flex items-center justify-center" title="删除这条记录">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 半年归档提醒 */}
              {habit.checkins.length > 180 && (
                <div className="bg-warning/10 text-warning text-xs p-3 rounded-button mt-4">
                  您已有 {habit.checkins.length} 条记录，建议归档半年前的记录以保持应用流畅。超过 365 天的记录将无法继续记录。
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* 图片查看器 */}
      <Modal isOpen={!!viewingImages} onClose={() => setViewingImages(null)} title="查看图片" size="lg">
        <div className="space-y-4">
          {viewingImages?.map((img, i) => (
            <div key={i} className="rounded-lg overflow-hidden">
              <img src={img} alt={`图片${i+1}`} className="w-full" />
            </div>
          ))}
        </div>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog isOpen={true} onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const habit = habits.find(h => h.id === confirmDelete)
            if (habit && user) {
              // 本地软删除（保持 store 一致性）
              deleteHabit(habit.id)
              // 云端硬删除（确保换账号/重新登录不会拉回）
              syncDelete('habits', habit.id, user.id).then(r => {
                if (!r.success) console.error('[Habit] Failed to hard delete from cloud:', r.error)
              })
            }
            setConfirmDelete(null)
          }}
          title="确认删除" message="删除后该记录项及所有历史将被彻底删除，无法恢复。" type="danger" />
      )}
    </div>
  )
}

export default HabitPage

