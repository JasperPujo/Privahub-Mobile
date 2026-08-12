import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, useTodoStore, useScheduleStore, usePlanStore, useNoteStore, useTrackerStore, useShiftStore } from '@/store'
import {
  CheckSquare, Calendar, Target, Activity,
  ArrowRight, Clock, X, Settings, ChevronDown, Zap
} from '@/utils/icons'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.02 }
  }
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 24, mass: 0.8 }
  }
}

const Home: React.FC = () => {
  /* Desktop-only */
  const navigate = useNavigate()
  const { settings, updateSettings } = useAppStore()
  const { tasks } = useTodoStore()
  const { schedules } = useScheduleStore()
  const { plans } = usePlanStore()
  const { notes, walls } = useNoteStore()
  const { categories: trackerCategories, entries: trackerEntries } = useTrackerStore()
  const [now, setNow] = useState(new Date())
  const [noteDisplayIdx, setNoteDisplayIdx] = useState(0)
  const [showNoteSettings, setShowNoteSettings] = useState(false)
  const [wallDropdownOpen, setWallDropdownOpen] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const pendingTasks = tasks.filter(t => {
    if (t.is_completed || t.deleted_at) return false
    return true
  }).slice(0, 3)
  const todaySchedules = schedules.filter(s => {
    if (s.deleted_at) return false
    const start = new Date(s.start_time)
    const today = new Date()
    return start.toDateString() === today.toDateString()
  }).slice(0, 3)

  const unscheduledPlans = plans.filter(p => !p.is_scheduled && !p.deleted_at).slice(0, 3)

  // 随心贴轮播配置
  const selectedWallIds: string[] = settings.homeNoteWallIds || []
  const noteRotationInterval = settings.noteRotationInterval || 8
  const activeWalls = walls.filter(w => !w.deleted_at)
  const activeNotes = notes.filter(n => {
    if (n.deleted_at) return false
    if (selectedWallIds.length === 0) return false
    if (!selectedWallIds.includes(n.wall_id)) return false
    // 确保笔记所属的墙仍然存在且未被删除
    const wall = walls.find(w => w.id === n.wall_id)
    if (!wall || wall.deleted_at) return false
    return true
  })
  const noteWallMap = new Map(activeWalls.map(w => [w.id, w.name]))

  useEffect(() => {
    if (activeNotes.length <= 1) return
    const timer = setInterval(() => {
      setNoteDisplayIdx(prev => (prev + 1) % activeNotes.length)
    }, noteRotationInterval * 1000)
    return () => clearInterval(timer)
  }, [activeNotes.length, noteRotationInterval])

  // 今日专注时长
  const todayFocusStr = new Date().toISOString().split('T')[0]
  let todayFocusMinutes = 0
  try {
    const savedSessions = localStorage.getItem('focus_sessions')
    if (savedSessions) {
      const sessions: Array<{ duration: number; created_at: string }> = JSON.parse(savedSessions)
      const todaySessions = sessions.filter(s => s.created_at && s.created_at.startsWith(todayFocusStr))
      todayFocusMinutes = Math.round(todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0) / 60)
    }
  } catch {}

  const activeCategoryIds = new Set(trackerCategories.filter(c => !c.deleted_at).map(c => c.id))

  // 最近2条实时记录（排除分类已删除的）
  const recentTrackerEntries = trackerEntries
    .filter(e => !e.deleted_at && activeCategoryIds.has(e.category_id))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 2)
  const categoryMap = new Map(trackerCategories.filter(c => !c.deleted_at).map(c => [c.id, c]))
  const todayStrShort = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

  // ===== 排班倒计时：计算下一个休息日 =====
  const { shifts } = useShiftStore()
  let nextRestInfo: { daysLeft: number; restDateStr: string; weekDayStr: string; totalRestDays: number } | null = null

  const todayDate = new Date()
  const todayYear = todayDate.getFullYear()
  const todayMonth = todayDate.getMonth() + 1
  const todayDay = todayDate.getDate()

  // 筛选有效的排班数据并按日期排序
  const activeShifts = shifts.filter(s => !s.deleted_at).sort((a, b) => {
    const da = new Date(a.year, a.month - 1, a.day)
    const db = new Date(b.year, b.month - 1, b.day)
    return da.getTime() - db.getTime()
  })

  // 找今天之后（含今天）的第一个休息日（rest 或 public_rest）
  let firstRestDate: Date | null = null
  for (const s of activeShifts) {
    if (s.type !== 'rest' && s.type !== 'public_rest') continue
    const sd = new Date(s.year, s.month - 1, s.day)
    if (sd >= new Date(todayYear, todayMonth - 1, todayDay)) {
      firstRestDate = sd
      break
    }
  }

  if (firstRestDate) {
    const daysLeft = Math.ceil((firstRestDate.getTime() - new Date(todayYear, todayMonth - 1, todayDay).getTime()) / (24 * 60 * 60 * 1000))
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

    // 计算连续休息天数：从第一个休息日开始，连续的 rest/public_rest 天数
    let totalRestDays = 0
    const checkDate = new Date(firstRestDate)
    while (true) {
      const cy = checkDate.getFullYear()
      const cm = checkDate.getMonth() + 1
      const cd = checkDate.getDate()
      const found = activeShifts.find(s => s.year === cy && s.month === cm && s.day === cd && (s.type === 'rest' || s.type === 'public_rest'))
      if (found) {
        totalRestDays++
        checkDate.setDate(checkDate.getDate() + 1)
        if (totalRestDays > 30) break // 防止死循环
      } else {
        break
      }
    }

    nextRestInfo = {
      daysLeft,
      restDateStr: `${firstRestDate.getMonth() + 1}月${firstRestDate.getDate()}日`,
      weekDayStr: weekDays[firstRestDate.getDay()],
      totalRestDays,
    }
  }

  return (
    <div className="page-container">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="max-w-6xl mx-auto space-y-3 md:space-y-4"
      >
        {/* 日期时间 */}
        <motion.div variants={item} className="mb-1 md:mb-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] tabular-nums">
              {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
          <p className="text-sm md:text-sm text-[var(--text-secondary)] mt-0.5">
            {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </motion.div>

        {/* 排班倒计时提示条 - 仅在有排班数据时显示 */}
        {nextRestInfo && (
          <motion.div variants={item} className="card shadow-card p-3 md:p-5">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-button bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Calendar size={14} className="text-white md:hidden" />
                <Calendar size={20} className="text-white hidden md:block" />
              </div>
              <div className="min-w-0">
                <p className="text-sm md:text-sm font-medium text-[var(--text-primary)]">
                  距离休息日还有 <span className="text-primary-600 font-bold">{nextRestInfo.daysLeft}</span> 天
                </p>
                <p className="text-xs md:text-xs text-[var(--text-tertiary)] truncate">
                  {nextRestInfo.restDateStr}（{nextRestInfo.weekDayStr}），可休 {nextRestInfo.totalRestDays} 天
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* 三栏：待办 + 日程 + 随心贴 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {/* 待办任务预览 */}
          <motion.div variants={item} className="card shadow-card p-3 md:p-5 flex flex-col min-h-[108px]">
            <div className="flex items-center justify-between mb-1.5 md:mb-4">
              <h2 className="text-sm md:text-xl font-semibold text-[var(--text-primary)]">待办任务</h2>
              <button onClick={() => navigate('/todo')} className="text-xs text-primary-600 hover:underline">
                全部
              </button>
            </div>
            {pendingTasks.length > 0 ? (
              <div className="space-y-1 md:space-y-2.5 flex-1">
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2.5 md:p-4 rounded-lg md:rounded-xl shadow-sm border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                  >
                    <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full flex-shrink-0 ${
                      task.priority === 'high' ? 'bg-danger' :
                      task.priority === 'medium' ? 'bg-warning' : 'bg-success'
                    }`} />
                    <span className="flex-1 text-sm md:text-sm font-medium text-[var(--text-primary)] truncate">{task.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 flex-1 flex flex-col items-center justify-center">
                <CheckSquare size={20} className="text-[var(--text-tertiary)] mb-1 md:hidden" />
                <CheckSquare size={28} className="text-[var(--text-tertiary)] mb-2 hidden md:block" />
                <p className="text-xs md:text-sm">暂无待办</p>
              </div>
            )}
          </motion.div>

          {/* 今日日程 */}
          <motion.div variants={item} className="card shadow-card p-3 md:p-5 flex flex-col min-h-[108px]">
            <div className="flex items-center justify-between mb-1.5 md:mb-4">
              <h2 className="text-sm md:text-xl font-semibold text-[var(--text-primary)]">今日日程</h2>
              <button onClick={() => navigate('/calendar')} className="text-xs text-primary-600 hover:underline">
                全部
              </button>
            </div>
            {todaySchedules.length > 0 ? (
              <div className="space-y-1 md:space-y-2.5 flex-1">
                {todaySchedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex items-center gap-2 p-2.5 md:p-4 rounded-lg md:rounded-xl shadow-sm border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                  >
                    <Clock size={12} className="text-[var(--text-tertiary)] flex-shrink-0 md:hidden" />
                    <Clock size={16} className="text-[var(--text-tertiary)] flex-shrink-0 hidden md:block" />
                    <span className="text-[10px] md:text-xs text-[var(--text-secondary)] w-10 md:w-14 flex-shrink-0">
                      {(schedule as any).is_all_day ? '全天' : new Date(schedule.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex-1 text-sm md:text-sm text-[var(--text-primary)] truncate">{schedule.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 flex-1 flex flex-col items-center justify-center">
                <Calendar size={20} className="text-[var(--text-tertiary)] mb-1 md:hidden" />
                <Calendar size={28} className="text-[var(--text-tertiary)] mb-2 hidden md:block" />
                <p className="text-xs md:text-sm">暂无日程</p>
              </div>
            )}
          </motion.div>

          {/* 随心贴轮播 */}
          <motion.div variants={item} className="col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="card-hover text-left group relative overflow-hidden h-full min-h-[108px] p-3 md:p-5 flex flex-col">
              <div className="flex items-center justify-between mb-1.5 md:mb-3">
                <h2 className="text-sm md:text-xl font-semibold text-[var(--text-primary)]">随心贴</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowNoteSettings(true)}
                    className="p-0.5 md:p-1 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-primary-600 transition-colors"
                    title="轮播设置"
                  >
                    <Settings size={12} className="md:hidden" />
                    <Settings size={14} className="hidden md:block" />
                  </button>
                  <button onClick={() => navigate('/notes')} className="p-0.5 md:p-1 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-primary-600 transition-colors">
                    <ArrowRight size={14} className="md:hidden" />
                    <ArrowRight size={16} className="hidden md:block" />
                  </button>
                </div>
              </div>
              {activeNotes.length > 0 ? (
                <div className="flex-1 flex flex-col">
                  <motion.div
                    key={activeNotes[noteDisplayIdx]?.id || 'empty'}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex-1 flex flex-col justify-center"
                  >
                    <p className="text-xs md:text-sm font-medium text-[var(--text-primary)] whitespace-pre-wrap break-all leading-relaxed line-clamp-2 md:line-clamp-none">
                      {(() => {
                        const c = activeNotes[noteDisplayIdx].content
                        const noteContent = typeof c === 'string' ? c : c?.text || ''
                        return noteContent || '空白贴纸'
                      })()}
                    </p>
                  </motion.div>
                  <div className="flex items-center justify-between mt-1.5 md:mt-3 pt-1.5 md:pt-3 border-t border-[var(--border-color)]">
                    <span className="text-[10px] md:text-xs text-[var(--text-tertiary)] truncate">
                      {noteWallMap.get(activeNotes[noteDisplayIdx].wall_id) || '未分类'}
                    </span>
                    <span className="text-[10px] md:text-xs text-[var(--text-tertiary)] flex-shrink-0 ml-2">
                      {new Date(activeNotes[noteDisplayIdx].created_at).toLocaleDateString('zh-CN')}
                      {activeNotes.length > 1 && ` · ${noteDisplayIdx + 1}/${activeNotes.length}`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <p className="text-xs md:text-sm text-[var(--text-tertiary)]">暂无随心贴</p>
                  <button onClick={() => navigate('/notes')} className="text-xs text-primary-600 mt-1 md:mt-2 hover:underline">
                    去创建 →
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* 下方信息卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* 未落地规划 */}
          <button onClick={() => navigate('/plan')} className="card-hover text-left group p-3 md:p-5">
            <div className="flex items-center justify-between mb-1 md:mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-button bg-warning flex items-center justify-center">
                <Target size={12} className="text-white md:hidden" />
                <Target size={16} className="text-white hidden md:block" />
              </div>
              <ArrowRight size={12} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors md:hidden" />
              <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors hidden md:block" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">{unscheduledPlans.length}</p>
            <p className="text-xs md:text-sm text-[var(--text-secondary)]">未落地规划</p>
          </button>

          {/* 今日专注时长 */}
          <button onClick={() => navigate('/focus')} className="card-hover text-left group p-3 md:p-5">
            <div className="flex items-center justify-between mb-1 md:mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-button bg-success flex items-center justify-center">
                <Zap size={12} className="text-white md:hidden" />
                <Zap size={16} className="text-white hidden md:block" />
              </div>
              <ArrowRight size={12} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors md:hidden" />
              <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors hidden md:block" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">{todayFocusMinutes}分</p>
            <p className="text-xs md:text-sm text-[var(--text-secondary)]">今日专注</p>
          </button>

          {/* 已完成任务 */}
          <button onClick={() => navigate('/todo')} className="card-hover text-left group p-3 md:p-5">
            <div className="flex items-center justify-between mb-1 md:mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-button bg-accent flex items-center justify-center">
                <Zap size={12} className="text-white md:hidden" />
                <Zap size={16} className="text-white hidden md:block" />
              </div>
              <ArrowRight size={12} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors md:hidden" />
              <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors hidden md:block" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">
              {tasks.filter(t => t.is_completed && !t.deleted_at && new Date(t.updated_at || t.created_at).toDateString() === new Date().toDateString()).length}
            </p>
            <p className="text-xs md:text-sm text-[var(--text-secondary)]">今日已完成</p>
          </button>

          {/* 实时记录卡片 */}
          <button onClick={() => navigate('/tracker')} className="card-hover text-left group p-3 md:p-5 min-h-[60px] md:min-h-[100px] flex flex-col">
            <div className="flex items-center justify-between mb-1 md:mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-button bg-primary-600 flex items-center justify-center">
                <Activity size={12} className="text-white md:hidden" />
                <Activity size={16} className="text-white hidden md:block" />
              </div>
              <ArrowRight size={12} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors md:hidden" />
              <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-primary-600 transition-colors hidden md:block" />
            </div>
            <div className="flex-1 flex flex-col justify-center">
              {recentTrackerEntries.length > 0 ? (
                <div className="space-y-0.5 md:space-y-2">
                  {recentTrackerEntries.slice(0, 1).map(entry => {
                    const cat = categoryMap.get(entry.category_id)
                    const entryDate = new Date(entry.timestamp)
                    const isToday = entryDate.toDateString() === new Date().toDateString()
                    const dateDisplay = isToday ? '' : `${entryDate.getMonth() + 1}/${entryDate.getDate()} `
                    const timeStr = entryDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={entry.id} className="flex items-center gap-1 md:gap-2">
                        <span className="text-[9px] md:text-xs text-[var(--text-tertiary)] flex-shrink-0">{dateDisplay}{timeStr}</span>
                        <span className="text-[10px] md:text-xs text-primary-600 font-medium truncate">{cat?.name || '未分类'}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs md:text-sm text-gray-400">暂无数据</p>
              )}
            </div>
            <p className="text-xs md:text-sm text-[var(--text-secondary)]">实时记录</p>
          </button>
          </div>
      </motion.div>

      {/* 随心贴轮播设置弹窗 */}
      <AnimatePresence>
        {showNoteSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowNoteSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-[var(--bg-primary)] rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">随心贴轮播设置</h3>
                <button onClick={() => setShowNoteSettings(false)} className="p-1 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
                  <X size={18} />
                </button>
              </div>

              {/* 轮播间隔 */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">轮播间隔（秒）</label>
                <input
                  type="number"
                  min={3}
                  max={300}
                  value={settings.noteRotationInterval || 8}
                  onChange={e => updateSettings({ noteRotationInterval: Math.max(3, Math.min(300, parseInt(e.target.value) || 8)) })}
                  className="input w-24"
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-1">范围 3 ~ 300 秒</p>
              </div>

              {/* 主题墙选择 - 下拉多选 */}
              <div className="mb-2">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">选择轮换的主题墙</label>
                {activeWalls.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">暂无主题墙，请先在随心贴中创建</p>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setWallDropdownOpen(!wallDropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-primary-600/50 transition-colors text-sm text-left"
                    >
                      <span className={selectedWallIds.length === 0 ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}>
                        {selectedWallIds.length === 0 ? '未选择' : selectedWallIds.length === activeWalls.length ? '全部主题墙' : `已选 ${selectedWallIds.length} 个主题墙`}
                      </span>
                      <ChevronDown size={14} className={`text-[var(--text-tertiary)] transition-transform ${wallDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {wallDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setWallDropdownOpen(false)} />
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          <label className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors border-b border-[var(--border-color)]">
                            <input
                              type="checkbox"
                              checked={selectedWallIds.length === activeWalls.length}
                              onChange={e => {
                                updateSettings({ homeNoteWallIds: e.target.checked ? activeWalls.map(w => w.id) : [] })
                              }}
                              className="w-4 h-4 rounded border-[var(--border-color)] text-primary-600 focus:ring-primary-600"
                            />
                            <span className="text-sm text-[var(--text-primary)]">全部主题墙</span>
                          </label>
                          {activeWalls.map(wall => (
                            <label key={wall.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={selectedWallIds.includes(wall.id)}
                                onChange={e => {
                                  const next = e.target.checked
                                    ? [...selectedWallIds, wall.id]
                                    : selectedWallIds.filter(id => id !== wall.id)
                                  updateSettings({ homeNoteWallIds: next })
                                }}
                                className="w-4 h-4 rounded border-[var(--border-color)] text-primary-600 focus:ring-primary-600"
                              />
                              <span className="text-sm text-[var(--text-primary)]">{wall.name}</span>
                              <span className="text-xs text-[var(--text-tertiary)] ml-auto">
                                {notes.filter(n => n.wall_id === wall.id && !n.deleted_at).length} 张
                              </span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <p className="text-xs text-[var(--text-tertiary)] mt-1">不选则不显示轮播卡片</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Home

