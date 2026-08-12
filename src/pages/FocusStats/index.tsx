import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Zap, Clock, Target } from '@/utils/icons'

interface FocusSession {
  id: string
  mode: 'countUp' | 'countDown' | 'pomodoro'
  theme: string
  taskId: string | null
  startTime: string
  endTime: string | null
  duration: number
  completedTasks: string[]
  isRest: boolean
}

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    if (m > 0) return `${h}h${m}m`
    return `${h}h`
  }
  if (m > 0) {
    if (s > 0) return `${m}m${s}s`
    return `${m}m`
  }
  return `${s}s`
}

const formatDateTime = (iso: string): string => {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

const modeConfig = {
  countUp: {
    label: '正计时',
    color: '#6B4C9A',
    bgColor: 'rgba(107, 76, 154, 0.1)',
    borderColor: 'rgba(107, 76, 154, 0.3)',
  },
  countDown: {
    label: '倒计时',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  pomodoro: {
    label: '番茄钟',
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
}

const FocusStatsPage: React.FC = () => {
  const navigate = useNavigate()

  const focusSessions: FocusSession[] = useMemo(() => {
    const saved = localStorage.getItem('focus_sessions')
    return saved ? JSON.parse(saved) : []
  }, [])

  // 仅统计专注会话（排除休息）
  const focusOnly = useMemo(() => focusSessions.filter(s => !s.isRest), [focusSessions])

  // ---------- 按模式分组统计 ----------
  const modeStats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const stats = {
      countUp:  { count: 0, totalDuration: 0, todayDuration: 0, todayCount: 0 },
      countDown: { count: 0, totalDuration: 0, todayDuration: 0, todayCount: 0 },
      pomodoro: { count: 0, totalDuration: 0, todayDuration: 0, todayCount: 0 },
    }

    focusOnly.forEach(s => {
      const cfg = stats[s.mode]
      cfg.count++
      cfg.totalDuration += s.duration

      const start = new Date(s.startTime)
      if (start >= today) {
        cfg.todayDuration += s.duration
        cfg.todayCount++
      }
    })

    return stats
  }, [focusOnly])

  // ---------- 最近7天每日专注总时长（所有模式合计） ----------
  const weeklyData = useMemo(() => {
    const days: { date: string; label: string; duration: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const nextDay = new Date(d)
      nextDay.setDate(nextDay.getDate() + 1)

      const daySeconds = focusOnly
        .filter(s => {
          const sessionDate = new Date(s.startTime)
          return sessionDate >= d && sessionDate < nextDay
        })
        .reduce((sum, s) => sum + s.duration, 0)

      days.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        duration: daySeconds,
      })
    }
    return days
  }, [focusOnly])

  const maxWeeklyDuration = Math.max(...weeklyData.map(d => d.duration), 1)

  // ---------- 最近记录列表（所有模式混合，最多20条） ----------
  const recentSessions = useMemo(() => {
    return [...focusOnly]
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 20)
  }, [focusOnly])

  // 柱状图悬停状态
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  return (
    <div className="page-container">
      <div className="max-w-4xl mx-auto">
        {/* 返回按钮 */}
        <button
          onClick={() => navigate('/focus')}
          className="flex items-center gap-1 text-sm mb-4 transition-colors"
          style={{ color: '#6B4C9A', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ChevronLeft size={16} />
          <span>返回专注</span>
        </button>

        <h1 className="page-title mb-6">数据总览</h1>

        {focusOnly.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>
            <p className="text-lg mb-2">暂无专注数据</p>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>开始你的第一次专注吧</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ========== 顶部：三列总览卡片 ========== */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 正计时 */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(107, 76, 154, 0.12)' }}
                  >
                    <Zap size={18} style={{ color: '#6B4C9A' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>正计时</div>
                    <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {modeStats.countUp.count}
                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>次</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        总计 {formatDuration(modeStats.countUp.totalDuration)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        今日 {formatDuration(modeStats.countUp.todayDuration)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 倒计时 */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(59, 130, 246, 0.12)' }}
                  >
                    <Clock size={18} style={{ color: '#3B82F6' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>倒计时</div>
                    <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {modeStats.countDown.count}
                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>次</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        总计 {formatDuration(modeStats.countDown.totalDuration)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        今日 {formatDuration(modeStats.countDown.todayDuration)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 番茄钟 */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(239, 68, 68, 0.12)' }}
                  >
                    <Target size={18} style={{ color: '#EF4444' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>番茄钟</div>
                    <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {modeStats.pomodoro.count}
                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>个</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        专注 {formatDuration(modeStats.pomodoro.totalDuration)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        今日 {modeStats.pomodoro.todayCount} 个
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ========== 下方：最近7天每日专注总时长柱状图 ========== */}
            <div
              className="rounded-xl p-4"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                最近7天专注时长
              </h3>
              <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
                {weeklyData.map((day, idx) => {
                  const heightPercent = maxWeeklyDuration > 0
                    ? (day.duration / maxWeeklyDuration) * 100
                    : 0
                  const isHovered = hoveredBar === idx

                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center justify-end h-full"
                      onMouseEnter={() => setHoveredBar(idx)}
                      onMouseLeave={() => setHoveredBar(null)}
                      style={{ cursor: 'default' }}
                    >
                      {/* 悬停提示 */}
                      {isHovered && day.duration > 0 && (
                        <div
                          className="text-xs font-medium mb-1 px-2 py-0.5 rounded-md whitespace-nowrap"
                          style={{
                            background: '#6B4C9A',
                            color: '#fff',
                          }}
                        >
                          {formatDuration(day.duration)}
                        </div>
                      )}
                      {/* 柱子 */}
                      <div
                        className="w-full rounded-t-md transition-all duration-300"
                        style={{
                          height: `${Math.max(heightPercent, day.duration > 0 ? 4 : 2)}%`,
                          minHeight: 2,
                          background: day.duration > 0
                            ? (isHovered ? '#8B6CB8' : '#6B4C9A')
                            : 'var(--border-color)',
                          opacity: day.duration > 0 ? 1 : 0.4,
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              {/* 日期标签 */}
              <div className="flex justify-between gap-2 mt-2">
                {weeklyData.map((day, idx) => (
                  <div
                    key={idx}
                    className="flex-1 text-center text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {day.label}
                  </div>
                ))}
              </div>
            </div>

            {/* ========== 下方第二区域：最近记录列表 ========== */}
            <div
              className="rounded-xl p-4"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                最近记录
              </h3>

              {recentSessions.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-tertiary)' }}>暂无记录</p>
              ) : (
                <div className="space-y-2">
                  {recentSessions.map((session) => {
                    const cfg = modeConfig[session.mode]
                    return (
                      <div
                        key={session.id}
                        className="flex items-center gap-3 p-3 rounded-lg transition-colors"
                        style={{ background: 'var(--bg-primary)' }}
                      >
                        {/* 模式标签 */}
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            color: cfg.color,
                            background: cfg.bgColor,
                            border: `1px solid ${cfg.borderColor}`,
                          }}
                        >
                          {cfg.label}
                        </span>

                        {/* 时长 */}
                        <span
                          className="text-sm font-medium flex-shrink-0"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {formatDuration(session.duration)}
                        </span>

                        {/* 主题 */}
                        <span
                          className="text-xs flex-1 truncate"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {session.theme}
                        </span>

                        {/* 日期时间 */}
                        <span
                          className="text-xs flex-shrink-0"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {formatDateTime(session.startTime)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FocusStatsPage
