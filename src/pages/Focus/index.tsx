import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/store'
import { useTodoStore } from '@/store'
import { useFocusStore } from '@/store/focusStore'
import {
  Play, Pause, RotateCcw, Square, Check, Volume2, VolumeX,
  SkipForward, SkipBack, Settings, X, Headphones, Upload,
  Repeat, Shuffle, ListMusic, BarChart2, Clock, ChevronRight, Zap, Target,
  Expand, Bell
} from '@/utils/icons'
import { generateUUID } from '@/lib/utils'

/* ================================================================
   Types & Constants
   ================================================================ */

interface SoundEffect {
  id: string
  name: string
  src: string
  isBuiltin: boolean
}

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

const BUILTIN_SOUNDS: SoundEffect[] = [
  { id: 'builtin-1', name: '水滴滴落', src: './audio/water-drops.wav', isBuiltin: true },
  { id: 'builtin-2', name: '大雨', src: './audio/heavy-rain.wav', isBuiltin: true },
  { id: 'builtin-3', name: '雷阵雨', src: './audio/thunder-rain.wav', isBuiltin: true },
  { id: 'builtin-4', name: '翻书声', src: './audio/page-turn.wav', isBuiltin: true },
  { id: 'builtin-5', name: '篝火燃烧', src: './audio/campfire.wav', isBuiltin: true },
  { id: 'builtin-6', name: '海浪声', src: './audio/ocean-waves.wav', isBuiltin: true },
]

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ================================================================
   Flip Clock - Simple & Reliable (light theme)
   ================================================================ */

const digitSpanStyle: React.CSSProperties = {
  fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--text-primary)',
  userSelect: 'none',
}

/* ================================================================
   FlipDigit Component (simplified - always shows current digit)
   ================================================================ */

const FlipDigit: React.FC<{ digit: string; prevDigit: string }> = ({ digit }) => {
  return (
    <div
      className="w-9 h-12 sm:w-10 sm:h-14 md:w-[80px] md:h-[110px] rounded-lg md:rounded-xl flex items-center justify-center relative overflow-hidden"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* Center dividing line */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        height: 1,
        background: 'rgba(0,0,0,0.06)',
        zIndex: 2,
      }} />
      <span className="text-2xl sm:text-3xl md:text-6xl" style={digitSpanStyle}>{digit}</span>
    </div>
  )
}

/* ================================================================
   FlipClock Component
   ================================================================ */

const FlipClock: React.FC = () => {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
  const dayStr = weekDays[now.getDay()]

  const digits = (hours + minutes + seconds).split('')
  const separator = (
    <div className="flex flex-col" style={{ gap: 8, padding: '0 4px' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6B4C9A', boxShadow: '0 0 6px rgba(107,76,154,0.3)', display: 'block' }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6B4C9A', boxShadow: '0 0 6px rgba(107,76,154,0.3)', display: 'block' }} />
    </div>
  )

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-0.5 sm:gap-1.5">
        <FlipDigit digit={digits[0]} prevDigit="" />
        <FlipDigit digit={digits[1]} prevDigit="" />
        {separator}
        <FlipDigit digit={digits[2]} prevDigit="" />
        <FlipDigit digit={digits[3]} prevDigit="" />
        {separator}
        <FlipDigit digit={digits[4]} prevDigit="" />
        <FlipDigit digit={digits[5]} prevDigit="" />
      </div>
      <div className="mt-2 md:mt-4 text-xs md:text-sm" style={{ color: 'var(--text-tertiary)' }}>
        {dateStr} {dayStr}
      </div>
    </div>
  )
}

/* ================================================================
   Mode Entry Cards Config
   ================================================================ *//* ================================================================
   Mode Entry Cards Config
   ================================================================ */

const modeEntries = [
  {
    key: 'countUp' as const,
    title: '正计时',
    desc: '自由计时，记录你的专注时长',
    icon: Zap,
    gradient: 'linear-gradient(135deg, rgba(107,76,154,0.15) 0%, rgba(107,76,154,0.03) 100%)',
    iconBg: 'rgba(107, 76, 154, 0.15)',
  },
  {
    key: 'countDown' as const,
    title: '倒计时',
    desc: '设定目标时间，高效完成每一段专注',
    icon: Clock,
    gradient: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.03) 100%)',
    iconBg: 'rgba(59, 130, 246, 0.15)',
  },
  {
    key: 'pomodoro' as const,
    title: '番茄钟',
    desc: '专注与休息交替，保持最佳状态',
    icon: Target,
    gradient: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.03) 100%)',
    iconBg: 'rgba(239, 68, 68, 0.15)',
  },
]

/* ================================================================
   Timer completion sound
   ================================================================ */
function playTimerCompleteSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime
    // 双音叮咚：第一个高音 880Hz，第二个更高音 1175Hz
    ;[880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      const start = now + i * 0.3
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5)
      osc.start(start)
      osc.stop(start + 0.5)
    })
  } catch (e) {
    // 静默失败
  }
}

/* ================================================================
   FocusPage Component
   ================================================================ */

const FocusPage: React.FC = () => {
  /* Desktop-only */

  const navigate = useNavigate()
  const { user } = useAppStore()
  const { tasks } = useTodoStore()
  const addNotification = useAppStore((state) => state.addNotification)

  // ---- Page state: 'home' or 'timer' ----
  // 根据全局 store 状态初始化：如果有正在进行的专注计时，直接进入计时页面
  const [page, setPage] = useState<'home' | 'timer'>(() => {
    const s = useFocusStore.getState()
    return s.isActive && s.elapsed > 0 ? 'timer' : 'home'
  })

  // ---- 计时状态（使用全局 store，切换页面不丢失）----
  const { 
    mode, setMode, 
    isRunning, setRunning: setIsRunning, 
    elapsed, setElapsed, 
    targetDuration, setTargetDuration, 
    isRest, setIsRest, 
    pomodoroCount, setPomodoroCount, 
    focusTheme, setFocusTheme, 
    linkedTaskId, setLinkedTaskId,
    completedTaskIds,
    isActive,
    miniBarVisible,
    setMiniBarVisible,
    startSession,
    endSession: clearFocusSession,
    resetTimer: resetFocusTimer,
  } = useFocusStore()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // 防止番茄钟/倒计时完成逻辑重复触发
  const completionHandledRef = useRef(false)

  // ---- 主题选择面板 ----
  const [showTopicPanel, setShowTopicPanel] = useState(false)
  const [customTopicInput, setCustomTopicInput] = useState('')
  const topicPanelRef = useRef<HTMLDivElement>(null)

  // ---- 移动端 / 横屏检测（用于底部弹窗与布局适配，<768px 视为移动端）----
  const [isMobile, setIsMobile] = useState(false)
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mobileMq = window.matchMedia('(max-width: 767px)')
    const orientMq = window.matchMedia('(orientation: landscape)')
    const update = () => {
      const m = mobileMq.matches
      setIsMobile(m)
      setIsLandscapeMobile(m && orientMq.matches)
    }
    update()
    mobileMq.addEventListener('change', update)
    orientMq.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      mobileMq.removeEventListener('change', update)
      orientMq.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  // 点击外部关闭主题选择面板（移动端使用遮罩点击关闭，跳过该逻辑）
  useEffect(() => {
    if (!showTopicPanel || isMobile) return
    const handleClickOutside = (e: MouseEvent) => {
      if (topicPanelRef.current && !topicPanelRef.current.contains(e.target as Node)) {
        setShowTopicPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTopicPanel, isMobile])

  // 页面初始化时已根据 store 状态判断 page，无需额外 useEffect

  // ---- 系统时间（计时页面显示） ----
  const [systemTime, setSystemTime] = useState('')
  useEffect(() => {
    const update = () => {
      const now = new Date()
      const h = String(now.getHours()).padStart(2, '0')
      const m = String(now.getMinutes()).padStart(2, '0')
      const s = String(now.getSeconds()).padStart(2, '0')
      setSystemTime(`${h}:${m}:${s}`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  // ---- 无边框全屏切换（Electron 原生 setFullScreen） ----
  const [isFullscreen, setIsFullscreen] = useState(false)
  const exitFullscreen = useCallback(async () => {
    if (isFullscreen && window.electronAPI?.toggleFullscreen) {
      const next = await window.electronAPI.toggleFullscreen()
      setIsFullscreen(next)
      const aside = document.querySelector('aside') as HTMLElement | null
      const header = document.querySelector('header') as HTMLElement | null
      const titleBar = document.querySelector('.fixed.top-0') as HTMLElement | null
      const mainWrap = document.querySelector('.h-full.w-screen') as HTMLElement | null
      aside && (aside.style.display = '')
      header && (header.style.display = '')
      titleBar && (titleBar.style.display = '')
      mainWrap && (mainWrap.style.paddingTop = '')
    }
  }, [isFullscreen])

  // Esc 键退出全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, exitFullscreen])

  const toggleFullscreen = useCallback(async () => {
    if (window.electronAPI?.toggleFullscreen) {
      const next = await window.electronAPI.toggleFullscreen()
      setIsFullscreen(next)
      // 纯 DOM 操作隐藏侧边栏、顶栏、ElectronTitleBar
      const aside = document.querySelector('aside') as HTMLElement | null
      const header = document.querySelector('header') as HTMLElement | null
      const titleBar = document.querySelector('.fixed.top-0') as HTMLElement | null
      const mainWrap = document.querySelector('.h-full.w-screen') as HTMLElement | null
      if (next) {
        aside && (aside.style.display = 'none')
        header && (header.style.display = 'none')
        titleBar && (titleBar.style.display = 'none')
        mainWrap && (mainWrap.style.paddingTop = '0')
      } else {
        aside && (aside.style.display = '')
        header && (header.style.display = '')
        titleBar && (titleBar.style.display = '')
        mainWrap && (mainWrap.style.paddingTop = '')
      }
    }
  }, [])

  // 结算弹窗
  const [showSummary, setShowSummary] = useState(false)
  const [summaryData, setSummaryData] = useState<FocusSession | null>(null)

  // 计时结束提醒弹窗
  const [showFocusComplete, setShowFocusComplete] = useState(false)
  const [focusCompleteMsg, setFocusCompleteMsg] = useState('')

  // 专注记录历史（持久化到 localStorage）
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>(() => {
    const saved = localStorage.getItem('focus_sessions')
    return saved ? JSON.parse(saved) : []
  })

  const saveSession = useCallback((session: FocusSession) => {
    setFocusSessions(prev => {
      const updated = [session, ...prev]
      localStorage.setItem('focus_sessions', JSON.stringify(updated))
      return updated
    })
  }, [])

  // ---- 白噪音 ----
  const [soundList, setSoundList] = useState<SoundEffect[]>(() => {
    const saved = localStorage.getItem('focus_custom_sounds')
    const customSounds = saved ? JSON.parse(saved) : []
    return [...BUILTIN_SOUNDS, ...customSounds]
  })
  const [soundIndex, setSoundIndex] = useState(() => {
    const saved = localStorage.getItem('focus_sound_index')
    return saved ? parseInt(saved) : 0
  })
  const [soundPlaying, setSoundPlaying] = useState(false)
  const [soundVolume, setSoundVolume] = useState(() => {
    const saved = localStorage.getItem('focus_sound_volume')
    return saved ? parseInt(saved) : 50
  })
  const [playMode, setPlayMode] = useState<'single' | 'list' | 'shuffle'>(() => {
    return (localStorage.getItem('focus_play_mode') as 'single' | 'list' | 'shuffle') || 'single'
  })
  const [showSoundUpload, setShowSoundUpload] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSoundPanel, setShowSoundPanel] = useState(false)

  // ---- 白噪音悬浮窗拖拽 ----
  const [noisePos, setNoisePos] = useState<{ x: number; y: number } | null>(null)
  const [noiseDragged, setNoiseDragged] = useState(false)
  const noiseDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; btnWidth: number; btnHeight: number } | null>(null)

  // 拖拽移动核心逻辑（鼠标 / 触摸共用）
  const handleNoiseDragMove = useCallback((clientX: number, clientY: number) => {
    if (!noiseDragRef.current) return
    const dx = clientX - noiseDragRef.current.startX
    const dy = clientY - noiseDragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setNoiseDragged(true)
      const btnW = noiseDragRef.current.btnWidth
      const btnH = noiseDragRef.current.btnHeight
      const newX = noiseDragRef.current.startPosX + dx
      const newY = noiseDragRef.current.startPosY + dy
      const clampedX = Math.max(0, Math.min(window.innerWidth - btnW, newX))
      const clampedY = Math.max(0, Math.min(window.innerHeight - btnH, newY))
      setNoisePos({ x: clampedX, y: clampedY })
    }
  }, [])

  // 鼠标拖拽
  const handleNoiseMouseDown = useCallback((e: React.MouseEvent) => {
    const btn = e.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    setNoiseDragged(false)
    noiseDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: rect.left,
      startPosY: rect.top,
      btnWidth: rect.width,
      btnHeight: rect.height,
    }
    const onMouseMove = (ev: MouseEvent) => handleNoiseDragMove(ev.clientX, ev.clientY)
    const onMouseUp = () => {
      noiseDragRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [handleNoiseDragMove])

  // 触摸拖拽
  const handleNoiseTouchStart = useCallback((e: React.TouchEvent) => {
    const btn = e.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    const touch = e.touches[0]
    setNoiseDragged(false)
    noiseDragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startPosX: rect.left,
      startPosY: rect.top,
      btnWidth: rect.width,
      btnHeight: rect.height,
    }
    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0]
      handleNoiseDragMove(t.clientX, t.clientY)
    }
    const onTouchEnd = () => {
      noiseDragRef.current = null
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
    document.addEventListener('touchmove', onTouchMove)
    document.addEventListener('touchend', onTouchEnd)
  }, [handleNoiseDragMove])

  // 点击切换面板（仅在未拖拽时生效）
  const handleNoiseClick = useCallback(() => {
    if (noiseDragged) {
      setNoiseDragged(false)
      return
    }
    setShowSoundPanel(prev => !prev)
  }, [noiseDragged])

  // 设置
  const [pomodoroFocusMin, setPomodoroFocusMin] = useState(25)
  const [pomodoroRestMin, setPomodoroRestMin] = useState(5)
  const [countdownOptions] = useState([15, 25, 45, 60, 90])
  // 专注提醒设置（持久化到 localStorage）
  const [focusSoundOnComplete, setFocusSoundOnComplete] = useState(() => localStorage.getItem('focus_sound_on_complete') !== 'false')
  const [focusPopupOnComplete, setFocusPopupOnComplete] = useState(() => localStorage.getItem('focus_popup_on_complete') !== 'false')

  // 保存白噪音设置到 localStorage
  useEffect(() => {
    localStorage.setItem('focus_sound_index', String(soundIndex))
    localStorage.setItem('focus_sound_volume', String(soundVolume))
    localStorage.setItem('focus_play_mode', playMode)
  }, [soundIndex, soundVolume, playMode])

  // 保存提醒设置到 localStorage
  useEffect(() => {
    localStorage.setItem('focus_sound_on_complete', String(focusSoundOnComplete))
    localStorage.setItem('focus_popup_on_complete', String(focusPopupOnComplete))
  }, [focusSoundOnComplete, focusPopupOnComplete])

  // 自动播放下一首
  const playNext = useCallback(() => {
    if (playMode === 'single') {
      return
    } else if (playMode === 'list') {
      setSoundIndex((i) => (i + 1) % soundList.length)
    } else if (playMode === 'shuffle') {
      setSoundIndex((i) => {
        let next = Math.floor(Math.random() * soundList.length)
        while (next === i && soundList.length > 1) {
          next = Math.floor(Math.random() * soundList.length)
        }
        return next
      })
    }
  }, [playMode, soundList.length])

  // 开始计时（计时器由全局 useGlobalFocusTimer 管理，这里只切换状态）
  const startTimer = useCallback(() => {
    if (isRunning) return
    setIsRunning(true)
  }, [isRunning, setIsRunning])

  // 暂停
  const pauseTimer = useCallback(() => {
    setIsRunning(false)
  }, [setIsRunning])

  // 重置
  const resetTimer = useCallback(() => {
    pauseTimer()
    setElapsed(0)
  }, [pauseTimer, setElapsed])

  // 提前结束 / 结算
  const endSession = useCallback(() => {
    pauseTimer()
    const session: FocusSession = {
      id: generateUUID(),
      mode,
      theme: focusTheme,
      taskId: linkedTaskId,
      startTime: new Date(Date.now() - elapsed * 1000).toISOString(),
      endTime: new Date().toISOString(),
      duration: elapsed,
      completedTasks: completedTaskIds,
      isRest,
    }
    if (elapsed > 0) {
      saveSession(session)
    }
    setSummaryData(session)
    setShowSummary(true)
    clearFocusSession()
  }, [pauseTimer, mode, focusTheme, linkedTaskId, elapsed, completedTaskIds, isRest, saveSession, clearFocusSession])

  // 番茄钟自动循环：专注结束 -> 休息 -> 下一轮
  const handlePomodoroComplete = useCallback(() => {
    pauseTimer()
    if (!isRest) {
      setIsRest(true)
      setElapsed(0)
      setTargetDuration(pomodoroRestMin * 60)
      addNotification({ message: `专注完成！休息 ${pomodoroRestMin} 分钟`, type: 'success' })
    } else {
      setIsRest(false)
      setElapsed(0)
      setTargetDuration(pomodoroFocusMin * 60)
      setPomodoroCount((c) => c + 1)
      addNotification({ message: '休息结束，开始下一轮专注', type: 'success' })
    }
  }, [pauseTimer, isRest, pomodoroRestMin, pomodoroFocusMin, addNotification])

  // 监听番茄钟/倒计时结束
  useEffect(() => {
    // elapsed 归零表示新阶段/新会话，重置完成标记
    if (elapsed === 0) {
      completionHandledRef.current = false
    }

    // 番茄钟完成（添加 ref 防护防止重复触发）
    if (mode === 'pomodoro' && isRunning && elapsed >= targetDuration && targetDuration > 0 && !completionHandledRef.current) {
      completionHandledRef.current = true
      if (elapsed > 0) {
        const session: FocusSession = {
          id: generateUUID(),
          mode,
          theme: focusTheme,
          taskId: linkedTaskId,
          startTime: new Date(Date.now() - elapsed * 1000).toISOString(),
          endTime: new Date().toISOString(),
          duration: elapsed,
          completedTasks: completedTaskIds,
          isRest,
        }
        saveSession(session)
      }
      // 弹窗提醒：番茄钟专注阶段/休息阶段结束
      if (!isRest) {
        setFocusCompleteMsg(`专注阶段完成！休息 ${pomodoroRestMin} 分钟吧`)
      } else {
        setFocusCompleteMsg('休息结束！可以开始下一轮专注了')
      }
      if (focusPopupOnComplete) setShowFocusComplete(true)
      if (focusSoundOnComplete) playTimerCompleteSound()
      handlePomodoroComplete()
    }
    // 倒计时完成（添加 ref 防护防止重复触发）
    if (mode === 'countDown' && isRunning && elapsed >= targetDuration && targetDuration > 0 && !completionHandledRef.current) {
      completionHandledRef.current = true
      pauseTimer()
      addNotification({ message: '倒计时结束', type: 'success' })
      const session: FocusSession = {
        id: generateUUID(),
        mode,
        theme: focusTheme,
        taskId: linkedTaskId,
        startTime: new Date(Date.now() - elapsed * 1000).toISOString(),
        endTime: new Date().toISOString(),
        duration: elapsed,
        completedTasks: completedTaskIds,
        isRest,
      }
      if (elapsed > 0) {
        saveSession(session)
      }
      // 弹窗提醒：倒计时结束
      setFocusCompleteMsg('倒计时已结束！本次专注完成')
      if (focusPopupOnComplete) setShowFocusComplete(true)
      if (focusSoundOnComplete) playTimerCompleteSound()
      setSummaryData(session)
      setShowSummary(true)
    }
  }, [mode, isRunning, elapsed, targetDuration, isRest, handlePomodoroComplete, pauseTimer, addNotification, focusTheme, linkedTaskId, completedTaskIds, saveSession, pomodoroRestMin])

  // 清理音频（计时器由全局 hook 管理，不需要在这里清理）
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  // 模式切换时重置（只在 home 页面时）
  useEffect(() => {
    if (page === 'home') {
      pauseTimer()
      setElapsed(0)
      setIsRest(false)
      if (mode === 'pomodoro') {
        setTargetDuration(pomodoroFocusMin * 60)
      } else if (mode === 'countDown') {
        setTargetDuration(25 * 60)
      }
    }
  }, [mode, pomodoroFocusMin, page])

  // 当前显示时间：倒计时/番茄钟显示剩余时间，正计时显示已用时间
  const displayTime = (mode === 'countDown' || mode === 'pomodoro')
    ? Math.max(targetDuration - elapsed, 0)
    : elapsed

  // 进度条
  const progress = targetDuration > 0 ? (elapsed / targetDuration) * 100 : 0

  // 关联任务
  const linkedTask = tasks.find((t) => t.id === linkedTaskId)
  const incompleteTasks = tasks.filter((t) => {
    if (t.is_completed || t.deleted_at) return false
    return true
  }).slice(0, 10)



  // ---- 白噪音控制 ----
  const toggleSound = () => {
    const currentSound = soundList[soundIndex]
    if (!currentSound?.src) {
      addNotification({ message: '该音效暂无音频文件', type: 'warning' })
      return
    }

    if (soundPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setSoundPlaying(false)
    } else {
      const audio = new Audio(currentSound.src)
      audio.volume = soundVolume / 100
      audio.loop = true
      audio.play().then(() => {
        setSoundPlaying(true)
      }).catch(() => {
        addNotification({ message: '音频播放失败', type: 'error' })
        setSoundPlaying(false)
        audioRef.current = null
      })
      audioRef.current = audio
    }
  }
  const handleSoundSelect = (index: number) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setSoundIndex(index)
    const sound = soundList[index]
    if (sound?.src) {
      const audio = new Audio(sound.src)
      audio.volume = soundVolume / 100
      audio.loop = true
      audio.play().then(() => {
        setSoundPlaying(true)
      }).catch(() => {
        addNotification({ message: '音频播放失败', type: 'error' })
        setSoundPlaying(false)
        audioRef.current = null
      })
      audioRef.current = audio
    }
  }
  const nextSound = () => {
    let newIndex: number
    if (playMode === 'shuffle') {
      newIndex = Math.floor(Math.random() * soundList.length)
      while (newIndex === soundIndex && soundList.length > 1) {
        newIndex = Math.floor(Math.random() * soundList.length)
      }
    } else {
      newIndex = (soundIndex + 1) % soundList.length
    }
    handleSoundSelect(newIndex)
  }
  const prevSound = () => {
    const newIndex = (soundIndex - 1 + soundList.length) % soundList.length
    handleSoundSelect(newIndex)
  }

  // 自定义音效上传
  const handleSoundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp3'].includes(file.type)) {
      addNotification({ message: '仅支持 mp3/wav/flac 格式', type: 'error' })
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const newSound: SoundEffect = {
        id: 'custom-' + Date.now(),
        name: file.name.replace(/\.[^/.]+$/, ''),
        src: dataUrl,
        isBuiltin: false,
      }
      const updated = [...soundList, newSound]
      setSoundList(updated)
      const customSounds = updated.filter((s) => !s.isBuiltin)
      localStorage.setItem('focus_custom_sounds', JSON.stringify(customSounds))
      setSoundIndex(updated.length - 1)
      addNotification({ message: `已添加音效：${newSound.name}`, type: 'success' })
    }
    reader.readAsDataURL(file)
  }

  // 删除自定义音效
  const deleteCustomSound = (id: string) => {
    const updated = soundList.filter((s) => s.id !== id)
    setSoundList(updated)
    const customSounds = updated.filter((s) => !s.isBuiltin)
    localStorage.setItem('focus_custom_sounds', JSON.stringify(customSounds))
    if (soundIndex >= updated.length) setSoundIndex(0)
    addNotification({ message: '音效已删除', type: 'success' })
  }

  // ---- 进入计时模式 ----
  const enterMode = (m: 'countUp' | 'countDown' | 'pomodoro') => {
    const duration = m === 'pomodoro' ? pomodoroFocusMin * 60 : m === 'countDown' ? 25 * 60 : 0
    startSession(m, duration, focusTheme, linkedTaskId)
    if (m === 'pomodoro') {
      setTargetDuration(pomodoroFocusMin * 60)
    } else if (m === 'countDown') {
      setTargetDuration(25 * 60)
    }
    setPage('timer')
  }

  // ---- 返回首页 ----
  // 不暂停计时器：切换到首页时专注继续运行，通过 mini 悬浮窗显示
  const goHome = () => {
    setPage('home')
  }

  // 设置弹窗内容根据模式变化
  const renderSettingsContent = () => {
    const reminderSection = (
      <div className="space-y-2 pt-3 border-t border-[var(--border-color)]">
        <p className="text-sm font-medium text-[var(--text-secondary)]">计时结束提醒</p>
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <Volume2 size={14} className="text-[var(--text-tertiary)]" />
            <span className="text-sm text-[var(--text-secondary)]">完成时播放提示音</span>
          </div>
          <button
            onClick={() => setFocusSoundOnComplete(!focusSoundOnComplete)}
            className={`relative w-11 h-6 rounded-full transition-colors ${focusSoundOnComplete ? 'bg-[#6B4C9A]' : 'bg-[var(--border-color)]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${focusSoundOnComplete ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-[var(--text-tertiary)]" />
            <span className="text-sm text-[var(--text-secondary)]">完成时弹出提醒</span>
          </div>
          <button
            onClick={() => setFocusPopupOnComplete(!focusPopupOnComplete)}
            className={`relative w-11 h-6 rounded-full transition-colors ${focusPopupOnComplete ? 'bg-[#6B4C9A]' : 'bg-[var(--border-color)]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${focusPopupOnComplete ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
    )

    if (mode === 'pomodoro') {
      return (
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[var(--text-secondary)] block mb-1">番茄钟专注时长（分钟）</label>
            <input
              type="number" value={pomodoroFocusMin}
              onChange={(e) => setPomodoroFocusMin(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm"
              min={1} max={120}
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-secondary)] block mb-1">番茄钟休息时长（分钟）</label>
            <input
              type="number" value={pomodoroRestMin}
              onChange={(e) => setPomodoroRestMin(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm"
              min={1} max={60}
            />
          </div>
          {reminderSection}
        </div>
      )
    }
    if (mode === 'countDown') {
      return (
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[var(--text-secondary)] block mb-1">默认倒计时时长（分钟）</label>
            <input
              type="number" value={Math.floor(targetDuration / 60)}
              onChange={(e) => setTargetDuration(Number(e.target.value) * 60)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm"
              min={1} max={300}
            />
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            也可在主页直接选择 15/25/45/60/90 分钟快捷选项
          </p>
          {reminderSection}
        </div>
      )
    }
    return (
      <div className="space-y-4">
        <div className="text-center py-4">
          <p className="text-sm text-[var(--text-secondary)]">正计时模式无需额外设置</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">点击开始后即可自由计时</p>
        </div>
        {reminderSection}
      </div>
    )
  }

  // ---- 主题选择面板内容（移动端底部弹窗与桌面下拉浮窗共用）----
  const renderTopicPanelBody = () => (
    <>
      {/* 自定义主题输入 */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="输入自定义主题..."
            value={customTopicInput}
            onChange={(e) => setCustomTopicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customTopicInput.trim()) {
                setFocusTheme(customTopicInput.trim())
                setLinkedTaskId(null)
                setCustomTopicInput('')
                setShowTopicPanel(false)
              }
            }}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            autoFocus
          />
          <button
            onClick={() => {
              if (customTopicInput.trim()) {
                setFocusTheme(customTopicInput.trim())
                setLinkedTaskId(null)
                setCustomTopicInput('')
                setShowTopicPanel(false)
              }
            }}
            disabled={!customTopicInput.trim()}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              borderRadius: 6,
              border: 'none',
              background: customTopicInput.trim() ? '#6B4C9A' : 'var(--border-color)',
              color: customTopicInput.trim() ? '#fff' : 'var(--text-tertiary)',
              cursor: customTopicInput.trim() ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
            }}
          >
            确认
          </button>
        </div>
      </div>

      {/* 关联任务选择列表（移动端可滚动） */}
      <div style={{ padding: '8px 0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '4px 12px 6px', fontSize: 11, color: 'var(--text-tertiary)' }}>
          选择关联任务
        </div>
        {incompleteTasks.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
            暂无待办任务
          </div>
        )}
        {incompleteTasks.map((task) => (
          <div
            key={task.id}
            onClick={() => {
              setLinkedTaskId(task.id)
              setFocusTheme(task.title)
              setCustomTopicInput('')
              setShowTopicPanel(false)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              minHeight: 44,
              cursor: 'pointer',
              borderLeft: linkedTaskId === task.id ? '3px solid #6B4C9A' : '3px solid transparent',
              background: linkedTaskId === task.id ? 'rgba(107,76,154,0.06)' : 'transparent',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (linkedTaskId !== task.id) {
                e.currentTarget.style.background = 'var(--bg-secondary)'
              }
            }}
            onMouseLeave={(e) => {
              if (linkedTaskId !== task.id) {
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                background: task.priority === 'high' ? '#ef4444' : task.priority === 'low' ? '#3b82f6' : '#f59e0b',
              }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {task.title}
            </span>
            {linkedTaskId === task.id && (
              <span style={{ color: '#6B4C9A', fontSize: 14 }}>✓</span>
            )}
          </div>
        ))}
      </div>
    </>
  )

  // ---- 白噪音面板内容（移动端底部弹窗与桌面浮窗共用）----
  const renderSoundPanelBody = () => (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Headphones size={16} style={{ color: '#6B4C9A' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>白噪音</span>
        </div>
        <button
          onClick={() => setShowSoundPanel(false)}
          style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:opacity-80 transition-opacity"
        >
          <X size={18} />
        </button>
      </div>

      {/* Sound select */}
      <div className="mb-3">
        <select
          value={soundIndex}
          onChange={(e) => handleSoundSelect(Number(e.target.value))}
          className="w-full px-3 py-2.5 text-sm rounded-lg border"
          style={{
            borderColor: 'var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        >
          {soundList.map((sound, idx) => (
            <option key={sound.id} value={idx} style={{ background: '#fff', color: 'var(--text-primary)' }}>
              {sound.name}
            </option>
          ))}
        </select>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <button
          onClick={prevSound}
          style={{ color: 'var(--text-tertiary)' }}
          className="hover:opacity-80 transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <SkipBack size={18} />
        </button>
        <button
          onClick={toggleSound}
          className="w-12 h-12 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-colors"
          style={{
            background: '#6B4C9A',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {soundPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          onClick={nextSound}
          style={{ color: 'var(--text-tertiary)' }}
          className="hover:opacity-80 transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <SkipForward size={18} />
        </button>
      </div>

      {/* Play mode */}
      <div className="flex items-center gap-1 mb-3">
        {([
          { key: 'single' as const, icon: Repeat, label: '单曲' },
          { key: 'list' as const, icon: ListMusic, label: '列表' },
          { key: 'shuffle' as const, icon: Shuffle, label: '随机' },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => setPlayMode(m.key)}
            title={m.label}
            className="flex-1 py-2 rounded-md text-xs flex items-center justify-center gap-1 transition-colors whitespace-nowrap min-h-[40px]"
            style={{
              background: playMode === m.key ? 'rgba(107,76,154,0.12)' : 'transparent',
              color: playMode === m.key ? '#6B4C9A' : 'var(--text-tertiary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <m.icon size={12} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <VolumeX size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <div className="flex-1 relative h-5 flex items-center">
          <div className="absolute left-0 right-0 h-1.5 rounded-full" style={{ background: 'var(--border-color)' }} />
          <div
            className="absolute left-0 h-1.5 rounded-full"
            style={{ width: `${soundVolume}%`, background: '#6B4C9A' }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={soundVolume}
            onChange={(e) => {
              const newVolume = Number(e.target.value)
              setSoundVolume(newVolume)
              if (audioRef.current) {
                audioRef.current.volume = newVolume / 100
              }
            }}
            className="absolute left-0 right-0 w-full h-8 md:h-5 opacity-0 cursor-pointer z-10"
          />
          <div
            className="absolute w-3.5 h-3.5 rounded-full shadow border-2"
            style={{
              left: `calc(${soundVolume}% - 7px)`,
              background: '#6B4C9A',
              borderColor: '#fff',
            }}
          />
        </div>
        <Volume2 size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span className="text-xs w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{soundVolume}%</span>
      </div>

      {/* Upload custom sound */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setShowSoundUpload(true)}
          className="flex items-center gap-1.5 text-xs hover:underline min-h-[44px]"
          style={{ color: '#6B4C9A', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Upload size={12} />
          上传自定义音效
        </button>
      </div>
    </div>
  )

  // ---- Render: White Noise Floating Panel (shared between home & timer) ----
  const renderSoundPanel = () => {
    // 判断面板展开方向：按钮在左半屏时向右展开，右半屏时向左展开
    const openRight = noisePos ? noisePos.x + 22 < window.innerWidth / 2 : false
    const panelBottom = isMobile ? 52 : 64

    return (
    <div
      className="fixed z-40 right-3 bottom-[76px] md:right-6 md:bottom-6 touch-none"
      style={
        noisePos
          ? { left: noisePos.x, top: noisePos.y, right: 'auto', bottom: 'auto' }
          : {}
      }
    >
      {/* Toggle Button - draggable */}
      <button
        onClick={handleNoiseClick}
        onMouseDown={handleNoiseMouseDown}
        onTouchStart={handleNoiseTouchStart}
        title="白噪音（可拖动）"
        className="w-11 h-11 md:w-[52px] md:h-[52px] rounded-full flex items-center justify-center cursor-pointer transition-all touch-none select-none"
        style={{
          background: '#6B4C9A',
          border: 'none',
          color: '#fff',
          boxShadow: '0 2px 12px rgba(107,76,154,0.3)',
          position: 'relative',
        }}
      >
        <Headphones size={20} />
        {soundPlaying && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#4ade80',
              border: '2px solid #fff',
            }}
          />
        )}
      </button>

      {/* Expandable Panel：移动端从底部滑出，桌面端为浮窗 */}
      <AnimatePresence>
        {showSoundPanel && (
          isMobile ? (
            <motion.div
              key="sound-mobile"
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSoundPanel(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.25 }}
                className="modal-content max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="overflow-y-auto flex-1 min-h-0">
                  {renderSoundPanelBody()}
                </div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="sound-desktop"
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute w-[280px] md:w-[320px]"
              style={{
                bottom: panelBottom,
                ...(openRight ? { left: 0 } : { right: 0 }),
                background: '#fff',
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              }}
            >
              {renderSoundPanelBody()}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
    )
  }

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full min-h-0">
      {/* ==================== HOME VIEW ==================== */}
      {page === 'home' && (
        <div className={`flex-1 flex flex-col items-center relative px-4 py-6 min-h-0 overflow-y-auto md:overflow-visible ${isLandscapeMobile ? 'justify-start' : 'justify-center'}`}>
          {/* Flip Clock */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <FlipClock />
          </motion.div>

          {/* Mode Entry Cards */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 md:flex md:flex-row items-stretch gap-3 md:gap-4 mt-6 md:mt-10 w-full max-w-sm md:max-w-2xl mx-auto"
            style={{ position: 'relative', zIndex: 1 }}
          >
            {modeEntries.map((entry) => {
              const IconComp = entry.icon
              return (
                <div
                  key={entry.key}
                  className="flex flex-col items-center text-center p-3 md:p-5 w-full cursor-pointer"
                  onClick={() => enterMode(entry.key)}
                  style={{
                    background: entry.gradient,
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    transition: 'all 0.3s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(107,76,154,0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)'
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
                  }}
                >
                  <div
                    className="w-9 h-9 md:w-12 md:h-12 rounded-lg flex items-center justify-center mb-2 md:mb-3 flex-shrink-0"
                    style={{ background: entry.iconBg }}
                  >
                    <IconComp size={18} className="md:hidden" style={{ color: 'var(--text-primary)' }} />
                    <IconComp size={20} className="hidden md:block" style={{ color: 'var(--text-primary)' }} />
                  </div>
                  <div className="w-full">
                    <h3 className="text-sm md:text-base font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
                      {entry.title}
                    </h3>
                    <p className="text-xs md:text-xs md:leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                      {entry.desc}
                    </p>
                  </div>
                  <ChevronRight size={18} className="flex-shrink-0 ml-2 md:hidden" style={{ color: '#6B4C9A' }} />
                </div>
              )
            })}
          </motion.div>

          {/* 底部按钮行 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 md:mt-10 flex items-center gap-4 md:gap-4"
            style={{ position: 'relative', zIndex: 1 }}
          >
            <button
              onClick={() => navigate('/focus/stats')}
              className="flex items-center gap-2 text-sm transition-colors min-h-[44px] md:min-h-0"
              style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >
              <BarChart2 size={16} />
              <span>数据统计</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
              style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              <Expand size={16} />
            </button>
          </motion.div>
        </div>
      )}

      {/* ==================== TIMER VIEW ==================== */}
      {page === 'timer' && (
        <div className={`h-full flex flex-col ${isLandscapeMobile ? 'justify-start overflow-y-auto' : 'justify-center'}`}>
          <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0 px-4">
            {/* Top bar */}
            <div className={`flex flex-col md:flex-row md:items-center justify-between gap-2 ${isLandscapeMobile ? 'py-1' : 'py-2 md:py-4'}`}>
              <button
                onClick={goHome}
                className="flex items-center gap-1.5 text-sm transition-colors min-h-[44px] md:min-h-0"
                style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
              >
                <span style={{fontSize: '16px'}}>&#8592;</span>
                <span>返回</span>
              </button>

              <div className="flex justify-center md:flex-1">
                <div className="flex items-center gap-1 p-1" style={{ background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  {([
                    { key: 'countUp' as const, label: '正计时' },
                    { key: 'countDown' as const, label: '倒计时' },
                    { key: 'pomodoro' as const, label: '番茄钟' },
                  ]).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      className="px-3 py-2 md:px-2 md:py-1 text-xs md:text-sm font-medium rounded-md transition-all min-h-[36px]"
                      style={{
                        background: mode === m.key ? '#6B4C9A' : 'transparent',
                        color: mode === m.key ? '#fff' : 'var(--text-tertiary)',
                        boxShadow: mode === m.key ? '0 2px 8px rgba(107,76,154,0.3)' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isFullscreen && (
                <button
                  onClick={() => navigate('/focus/stats')}
                  className="text-sm flex items-center gap-1 transition-colors min-h-[44px] md:min-h-0"
                  style={{ color: '#6B4C9A', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <BarChart2 size={16} />
                  <span>统计</span>
                </button>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                    style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    title={isFullscreen ? '退出全屏' : '全屏'}
                  >
                    <Expand size={16} />
                  </button>
                </div>
                {!isFullscreen && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                  style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  title="设置"
                >
                  <Settings size={18} />
                </button>
                )}
                {!isFullscreen && (
                <button
                  onClick={() => setMiniBarVisible(!miniBarVisible)}
                  className="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                  style={{ color: miniBarVisible ? '#6B4C9A' : 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  title={miniBarVisible ? '隐藏悬浮窗' : '显示悬浮窗'}
                >
                  <Expand size={16} />
                </button>
                )}
              </div>
            </div>

            {/* Main content area */}
            <div className={`flex-1 flex flex-col md:flex-row ${isLandscapeMobile ? 'gap-3' : 'gap-6'} min-h-0`}>
              {/* Left: Timer core */}
              <div className={isFullscreen ? "flex-1 flex flex-col items-center justify-center" : "flex-1 md:flex-[2] flex flex-col items-center justify-center"}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode + isRest}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="text-center w-full"
                  >
                    {/* Timer digits */}
                    <div
                      className={`font-bold tracking-tight font-mono ${
                        isFullscreen
                          ? 'text-7xl sm:text-8xl md:text-9xl mb-4'
                          : isLandscapeMobile
                            ? 'text-5xl mb-2'
                            : 'text-6xl sm:text-7xl md:text-8xl md:text-9xl mb-4'
                      }`}
                      style={{ color: isRest ? '#2dd4bf' : '#6B4C9A' }}
                    >
                      {formatTime(displayTime)}
                    </div>

                    {/* 系统时间 */}
                    <div className="text-xs font-mono mb-1" style={{ color: 'var(--text-tertiary)' }}>
                      {systemTime}
                    </div>

                    {/* Pomodoro count */}
                    {mode === 'pomodoro' && !isRest && (
                      <div className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>
                        第 {pomodoroCount + 1} 个番茄 · 已完成 {pomodoroCount} 个
                      </div>
                    )}
                    {isRest && (
                      <div className="text-sm mb-3 font-medium" style={{ color: '#2dd4bf' }}>
                        休息时间
                      </div>
                    )}

                    {/* Theme / task line with selection panel */}
                    <div className="mb-8" style={{ position: 'relative' }} ref={topicPanelRef}>
                      <button
                        onClick={() => {
                          if (isRunning) return
                          setShowTopicPanel(!showTopicPanel)
                        }}
                        className="text-base transition-colors"
                        style={{
                          color: linkedTaskId || focusTheme !== '无主题专注' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          background: 'none',
                          border: 'none',
                          cursor: isRunning ? 'default' : 'pointer',
                          padding: '4px 12px',
                          borderRadius: 8,
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isRunning) {
                            e.currentTarget.style.background = 'var(--bg-secondary)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        {linkedTask ? linkedTask.title : focusTheme}
                      </button>

                      {/* 主题选择弹出面板：移动端从底部滑出，桌面端为下拉浮窗 */}
                      <AnimatePresence>
                        {showTopicPanel && !isRunning && (
                          isMobile ? (
                            <motion.div
                              key="topic-mobile"
                              className="modal-overlay"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setShowTopicPanel(false)}
                            >
                              <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ duration: 0.25 }}
                                className="modal-content max-w-md"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] flex-shrink-0">
                                  <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>选择主题 / 任务</span>
                                  <button
                                    onClick={() => setShowTopicPanel(false)}
                                    className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                                    style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                                {renderTopicPanelBody()}
                              </motion.div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="topic-desktop"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              transition={{ duration: 0.15 }}
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginTop: 8,
                                width: 280,
                                maxHeight: 320,
                                background: '#fff',
                                border: '1px solid var(--border-color)',
                                borderRadius: 12,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                zIndex: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {renderTopicPanelBody()}
                            </motion.div>
                          )
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Progress bar */}
                    {(mode === 'countDown' || mode === 'pomodoro') && targetDuration > 0 && (
                      <div
                        className="w-full max-w-md mx-auto h-2 rounded-full mb-8 overflow-hidden"
                        style={{ background: 'var(--border-color)' }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: isRest ? '#2dd4bf' : '#6B4C9A' }}
                          animate={{ width: `${Math.min(progress, 100)}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    )}

                    {/* Quick duration options (countdown) */}
                    {mode === 'countDown' && !isRunning && elapsed === 0 && (
                      <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
                        {countdownOptions.map((min) => (
                          <button
                            key={min}
                            onClick={() => setTargetDuration(min * 60)}
                            className="px-3 py-1.5 text-xs rounded-md transition-colors"
                            style={{
                              background: targetDuration === min * 60 ? '#6B4C9A' : 'var(--bg-secondary)',
                              color: targetDuration === min * 60 ? '#fff' : 'var(--text-tertiary)',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer',
                            }}
                          >
                            {min} 分钟
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            const input = prompt('输入分钟数：', '25')
                            if (input) setTargetDuration(parseInt(input) * 60)
                          }}
                          className="px-3 py-1.5 text-xs rounded-md transition-colors"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                        >
                          自定义
                        </button>
                      </div>
                    )}

                    {/* Pomodoro rest hint */}
                    {mode === 'pomodoro' && isRest && !isRunning && elapsed === 0 && (
                      <div className="mb-6">
                        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                          专注 {pomodoroFocusMin} 分钟完成！开始 {pomodoroRestMin} 分钟休息
                        </p>
                      </div>
                    )}

                    {/* Control buttons */}
                    <div className="flex items-center justify-center gap-3 md:gap-4">
                      <button
                        onClick={resetTimer}
                        className="p-3.5 md:p-3 rounded-full transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                        style={{
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                        }}
                        title="重置"
                      >
                        <RotateCcw size={isFullscreen ? 28 : 20} />
                      </button>

                      <button
                        onClick={isRunning ? pauseTimer : startTimer}
                        className="p-5 rounded-full transition-all shadow-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                        style={{
                          background: isRunning ? '#f59e0b' : '#6B4C9A',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {isRunning ? <Pause size={isFullscreen ? 32 : 28} /> : <Play size={isFullscreen ? 32 : 28} className="ml-1" />}
                      </button>

                      <button
                        onClick={endSession}
                        className="p-3.5 md:p-3 rounded-full transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                        style={{
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                        }}
                        title="结束"
                      >
                        <Square size={isFullscreen ? 28 : 20} />
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Right: Linked task info panel */}
              <div className="hidden md:flex flex-1 flex-col gap-4 min-w-[280px] max-w-[360px]">
                <div
                  className="flex-1 flex flex-col min-h-0 p-4"
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 16,
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3
                      className="text-sm font-semibold"
                      style={{
                        color: linkedTaskId ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        cursor: linkedTaskId && !isRunning ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (linkedTaskId && !isRunning) {
                          setShowTopicPanel(true)
                        }
                      }}
                    >
                      关联任务
                    </h3>
                  </div>

                  <div className="flex-1 flex items-start justify-center">
                    {linkedTask ? (
                      <div
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 10,
                          background: 'rgba(107,76,154,0.06)',
                          borderLeft: '3px solid #6B4C9A',
                          cursor: !isRunning ? 'pointer' : 'default',
                          transition: 'background 0.15s ease',
                        }}
                        onClick={() => {
                          if (!isRunning) setShowTopicPanel(true)
                        }}
                        onMouseEnter={(e) => {
                          if (!isRunning) e.currentTarget.style.background = 'rgba(107,76,154,0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(107,76,154,0.06)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              flexShrink: 0,
                              background: linkedTask.priority === 'high' ? '#ef4444' : linkedTask.priority === 'low' ? '#3b82f6' : '#f59e0b',
                            }}
                          />
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {linkedTask.title}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 16 }}>
                          优先级：{linkedTask.priority === 'high' ? '高' : linkedTask.priority === 'low' ? '低' : '中'}
                          {linkedTask.due_date && (
                            <span style={{ marginLeft: 8 }}>
                              截止：{new Date(linkedTask.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex flex-col items-center justify-center"
                        style={{
                          padding: '32px 16px',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        <span style={{ fontSize: 12 }}>暂无关联任务</span>
                        {!isRunning && (
                          <button
                            onClick={() => setShowTopicPanel(true)}
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              color: '#6B4C9A',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            点击选择
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== WHITE NOISE FLOATING PANEL (shared) ==================== */}
      {renderSoundPanel()}

      {/* ==================== 计时结束提醒弹窗 ==================== */}
      <AnimatePresence>
        {showFocusComplete && (
          <motion.div
            className="modal-overlay z-[100]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowFocusComplete(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.95 }}
              transition={{ duration: isMobile ? 0.25 : 0.15 }}
              className="modal-content max-w-sm w-full text-center"
              style={{ background: 'var(--bg-primary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 overflow-y-auto">
                <div className="w-12 h-12 rounded-full bg-[#6B4C9A] flex items-center justify-center mx-auto mb-3">
                  <Bell size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>计时结束</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{focusCompleteMsg}</p>
                <button
                  onClick={() => setShowFocusComplete(false)}
                  className="px-6 py-2.5 rounded-lg text-white font-medium min-h-[44px]"
                  style={{ background: '#6B4C9A' }}
                >
                  确定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== 结算弹窗 ==================== */}
      <AnimatePresence>
        {showSummary && summaryData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowSummary(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.9 }}
              transition={{ duration: isMobile ? 0.25 : 0.2 }}
              className="modal-content max-w-md w-full"
              style={{ background: '#fff', border: '1px solid var(--border-color)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 overflow-y-auto">
              <h3 className="text-lg font-bold text-center mb-4" style={{ color: 'var(--text-primary)' }}>
                {isRest ? '休息结束' : '专注完成'}
              </h3>

              <div className="space-y-3 mb-5">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-tertiary)' }}>时长</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatTime(summaryData.duration)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-tertiary)' }}>模式</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {summaryData.mode === 'countUp' ? '正计时' : summaryData.mode === 'countDown' ? '倒计时' : '番茄钟'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-tertiary)' }}>主题</span>
                  <span className="font-medium truncate max-w-[180px]" style={{ color: 'var(--text-primary)' }}>{summaryData.theme}</span>
                </div>
                {linkedTask && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-tertiary)' }}>关联任务</span>
                    <span className="font-medium truncate max-w-[180px]" style={{ color: 'var(--text-primary)' }}>{linkedTask.title}</span>
                  </div>
                )}
              </div>

              {completedTaskIds.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>本次完成的任务</p>
                  <div className="space-y-1">
                    {completedTaskIds.map((id) => {
                      const t = tasks.find((task) => task.id === id)
                      return t ? (
                        <div key={id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                          <Check size={12} style={{ color: '#4ade80' }} />
                          <span className="truncate">{t.title}</span>
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {mode === 'pomodoro' && !isRest && (
                  <button
                    onClick={() => {
                      setShowSummary(false)
                      setIsRest(true)
                      setElapsed(0)
                      setTargetDuration(pomodoroRestMin * 60)
                      setIsRunning(false)
                    }}
                    className="flex-1 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center"
                    style={{ background: 'rgba(45,212,191,0.1)', color: '#2dd4bf', borderRadius: 8, border: '1px solid rgba(45,212,191,0.2)', cursor: 'pointer' }}
                  >
                    开始休息
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowSummary(false)
                    setElapsed(0)
                    setIsRunning(false)
                    if (isRest) {
                      setIsRest(false)
                      setTargetDuration(pomodoroFocusMin * 60)
                      setPomodoroCount((c) => c + 1)
                    }
                  }}
                  className="flex-1 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 8, border: '1px solid var(--border-color)', cursor: 'pointer' }}
                >
                  {isRest ? '开始专注' : '再来一轮'}
                </button>
                <button
                  onClick={() => setShowSummary(false)}
                  className="flex-1 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center"
                  style={{ background: '#6B4C9A', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                >
                  保存并退出
                </button>
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== 设置弹窗 ==================== */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.95 }}
              transition={{ duration: isMobile ? 0.25 : 0.15 }}
              className="modal-content max-w-sm w-full"
              style={{ background: '#fff', border: '1px solid var(--border-color)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                  {mode === 'pomodoro' ? '番茄钟设置' : mode === 'countDown' ? '倒计时设置' : '正计时'}
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                  style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {renderSettingsContent()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== 自定义音效上传弹窗 ==================== */}
      <AnimatePresence>
        {showSoundUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowSoundUpload(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isMobile ? '100%' : 0, scale: isMobile ? 1 : 0.95 }}
              transition={{ duration: isMobile ? 0.25 : 0.15 }}
              className="modal-content max-w-md w-full"
              style={{ background: '#fff', border: '1px solid var(--border-color)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>我的音效</h3>
                <button
                  onClick={() => setShowSoundUpload(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                  style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Upload button */}
              <label
                className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors mb-4"
                style={{ borderColor: 'var(--border-color)', background: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(107,76,154,0.5)'
                  e.currentTarget.style.background = 'rgba(107,76,154,0.03)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <Upload size={18} style={{ color: '#6B4C9A' }} />
                <span className="text-sm" style={{ color: '#6B4C9A' }}>上传音效（mp3/wav/flac）</span>
                <input type="file" accept="audio/mp3,audio/wav,audio/flac,audio/mpeg" className="hidden" onChange={handleSoundUpload} />
              </label>

              {/* Custom sound list */}
              <div className="space-y-2">
                {soundList.filter((s) => !s.isBuiltin).length === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-tertiary)' }}>暂无自定义音效</p>
                )}
                {soundList.filter((s) => !s.isBuiltin).map((sound) => (
                  <div
                    key={sound.id}
                    className="flex items-center justify-between p-2 rounded-md"
                    style={{ background: 'var(--bg-secondary)' }}
                  >
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{sound.name}</span>
                    <button
                      onClick={() => deleteCustomSound(sound.id)}
                      className="p-1 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default FocusPage


