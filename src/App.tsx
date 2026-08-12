import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAppStore } from '@/store'
import { AnimatePresence, motion } from 'framer-motion'
import Layout from '@/components/Layout'
import ElectronTitleBar from '@/components/ElectronTitleBar'
import LockScreen from '@/components/LockScreen'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Todo from '@/pages/Todo'
import Calendar from '@/pages/Calendar'
import Plan from '@/pages/Plan'
import Habit from '@/pages/Habit'
import Tracker from '@/pages/Tracker'
import Notes from '@/pages/Notes'
import RecycleBin from '@/pages/RecycleBin'
import Settings from '@/pages/Settings'
import About from '@/pages/About'
import Focus from '@/pages/Focus'
import FocusMiniBar from '@/components/FocusMiniBar'
import HabitStats from '@/pages/HabitStats'
import TrackerStats from '@/pages/TrackerStats'
import FocusStats from '@/pages/FocusStats'
import PoinShop from '@/pages/PoinShop'
import Notification from '@/components/Notification'
import { supabase } from '@/lib/supabase'
import { migrateOldIds } from '@/lib/migrate-ids'
import { useGlobalFocusTimer } from '@/hooks/useGlobalFocusTimer'
import { registerDesktopSession, subscribeToDesktopSessionChanges, clearDesktopSession } from '@/lib/deviceAuth'

const pageVariants = {
  initial: { opacity: 0, y: 8, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.99 }
}

const pageTransition = {
  type: 'tween',
  ease: [0.25, 0.1, 0.25, 1],
  duration: 0.2
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
        className="w-full h-full"
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/todo" element={<Todo />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/habit" element={<Habit />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/recycle" element={<RecycleBin />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/habit/stats" element={<HabitStats />} />
          <Route path="/tracker/stats" element={<TrackerStats />} />
          <Route path="/focus/stats" element={<FocusStats />} />
          <Route path="/poinshop" element={<PoinShop />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {
  const { isLoggedIn, lockScreen, theme, setUser, user } = useAppStore()
  const [checkingSession, setCheckingSession] = useState(true)
  const [kickedByDevice, setKickedByDevice] = useState(false)
  const isElectron = !!(window as any).electronAPI

  // 全局专注计时器：独立于 Focus 页面组件运行，切换页面不会中断
  useGlobalFocusTimer()

  // 单设备登录限制：仅桌面端 Electron 环境启用，PWA 移动端允许多端同时在线
  useEffect(() => {
    if (!isLoggedIn || !user) return
    if (!isElectron) return // PWA / Web 环境跳过单设备限制

    // 登录后注册当前设备
    registerDesktopSession(user.id)

    // 订阅设备会话变更
    const unsubscribe = subscribeToDesktopSessionChanges(user.id, () => {
      setKickedByDevice(true)
    })

    return () => {
      unsubscribe()
    }
  }, [isLoggedIn, user, isElectron])

  const themeClass = theme === 'dark' ? 'dark' : ''

  // 自动登录：检查 Supabase session
  useEffect(() => {
    const initSession = async () => {
      // 迁移旧版非标准 ID 到标准 UUID
      migrateOldIds()

      // 版本检测：如果应用版本更新或重新安装，清除密码（保留邮箱），不自动登录
      const savedBuildId = localStorage.getItem('privahub_build_id')
      const isNewBuild = __APP_BUILD_ID__ !== savedBuildId
      if (isNewBuild || !savedBuildId) {
        localStorage.removeItem('privahub_saved_password')
        localStorage.removeItem('privahub_remember_password')
        localStorage.removeItem('privahub_auto_login')
        localStorage.setItem('privahub_build_id', __APP_BUILD_ID__)
        // 强制登出 Supabase session，防止重装后残留旧 session 自动登录
        try {
          await supabase.auth.signOut()
        } catch {
          // 忽略 signOut 错误
        }
        // 清除旧的登录状态，确保跳到登录页
        setUser(null)
        setCheckingSession(false)
        return
      }

      // 自动登录：如果用户之前勾选了自动登录且存有密码，自动用存储的凭证登录
      const savedAutoLogin = localStorage.getItem('privahub_auto_login')
      const savedPassword = localStorage.getItem('privahub_saved_password')
      const savedEmail = localStorage.getItem('privahub_last_email')

      if (savedAutoLogin === 'true' && savedPassword && savedEmail) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: savedEmail,
            password: savedPassword,
          })
          if (!error && data.user) {
            const { data: userData } = await supabase
              .from('users')
              .select('*')
              .eq('id', data.user.id)
              .single()
            const cachedAvatar = localStorage.getItem('user_avatar_' + data.user.id)
            const { clearAllDataStores } = await import('@/store')
            clearAllDataStores()
            setUser({
              id: data.user.id,
              email: data.user.email || savedEmail,
              username: (userData as any)?.username || (userData as any)?.name || savedEmail.split('@')[0],
              avatar: (userData as any)?.avatar || cachedAvatar || null,
              created_at: (userData as any)?.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            // 合并远端 settings
            if ((userData as any)?.settings && typeof (userData as any).settings === 'object') {
              const { useAppStore } = await import('@/store')
              const currentSettings = useAppStore.getState().settings
              useAppStore.getState().updateSettings({ ...currentSettings, ...(userData as any).settings })
            }
            // 恢复 Poin 配置和余额（clearAllDataStores 会重置为默认值，需从云端重新拉取）
            try {
              const { fetchPoinConfig, fetchBalance } = await import('@/lib/poin')
              const { usePoinStore } = await import('@/store')
              const poinCfg = await fetchPoinConfig(data.user.id)
              usePoinStore.getState().setConfig(poinCfg)
              if (poinCfg.enable) {
                const bal = await fetchBalance(data.user.id)
                usePoinStore.getState().setBalance(bal)
              }
            } catch (e) {
              console.warn('[App] Failed to restore Poin config on auto-login:', e)
            }
            // 注册桌面设备会话（仅 Electron 环境需要单设备限制）
            if (isElectron) {
              try {
                await registerDesktopSession(data.user.id)
              } catch (e) {
                console.warn('[App] Failed to register device session:', e)
              }
            }
            // 自动登录成功后静默同步数据
            try {
              const { fullSync, taskToDb, taskFromDb, scheduleToDb, scheduleFromDb, planToDb, planFromDb, habitToDb, habitFromDb, noteToDb, noteFromDb, noteWallToDb, noteWallFromDb, trackerCategoryToDb, trackerEntryToDb } = await import('@/lib/sync')
              const { useTodoStore, useScheduleStore, usePlanStore, useHabitStore, useNoteStore, useTrackerStore } = await import('@/store')
              await fullSync(data.user.id, {
                tasks: {
                  table: 'tasks',
                  getData: () => [...useTodoStore.getState().tasks, ...useTodoStore.getState().archivedTasks],
                  setData: (data: any) => {
                    const active = data.filter((t: any) => !t.is_archived)
                    const archived = data.filter((t: any) => t.is_archived)
                      .sort((a: any, b: any) => (b.archived_at || '').localeCompare(a.archived_at || ''))
                    useTodoStore.getState().setTasks(active)
                    useTodoStore.getState().setArchivedTasks(archived)
                  },
                  toDbRow: taskToDb,
                  fromDbRow: taskFromDb,
                },
                schedules: { table: 'schedules', getData: () => useScheduleStore.getState().schedules, setData: (data) => useScheduleStore.getState().setSchedules(data), toDbRow: scheduleToDb, fromDbRow: scheduleFromDb },
                plans: { table: 'plans', getData: () => usePlanStore.getState().plans, setData: (data) => usePlanStore.getState().setPlans(data), toDbRow: planToDb, fromDbRow: planFromDb },
                habits: { table: 'habits', getData: () => useHabitStore.getState().habits, setData: (data) => useHabitStore.getState().setHabits(data), toDbRow: habitToDb, fromDbRow: habitFromDb },
                notes: { table: 'notes', getData: () => useNoteStore.getState().notes, setData: (data) => useNoteStore.getState().setNotes(data), toDbRow: noteToDb, fromDbRow: noteFromDb },
                noteWalls: { table: 'note_walls', getData: () => useNoteStore.getState().walls, setData: (data) => useNoteStore.getState().setWalls(data), toDbRow: noteWallToDb, fromDbRow: noteWallFromDb },
                trackerCategories: { table: 'tracker_categories', getData: () => useTrackerStore.getState().categories, setData: (data) => useTrackerStore.getState().setCategories(data), toDbRow: trackerCategoryToDb },
                trackerEntries: { table: 'tracker_entries', getData: () => useTrackerStore.getState().entries, setData: (data) => useTrackerStore.getState().setEntries(data), toDbRow: trackerEntryToDb },
              })
            } catch (e) {
              console.warn('Auto sync on login skipped:', e)
            }
          }
        } catch (e) {
          console.warn('[App] Auto-login failed:', e)
        }
      }
      setCheckingSession(false)
    }
    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // 只在显式登出时清除用户状态，避免 INITIAL_SESSION 或 TOKEN_REFRESHED 失败时误登出
      if (event === 'SIGNED_OUT' && !session) {
        setUser(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [setUser])

  // 检查 session 期间显示加载态
  if (checkingSession) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${themeClass}`}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#6B4C9A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[var(--text-secondary)]">正在检查登录状态...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className={themeClass}>
        <ElectronTitleBar />
        <div className={isElectron ? 'pt-8' : ''}>
          <Login />
        </div>
        <Notification />
      </div>
    )
  }

  return (
    <div className={`h-screen w-screen flex overflow-hidden ${themeClass}`}>
      <ElectronTitleBar />
      {lockScreen.isLocked && <LockScreen />}
      <Layout className={isElectron ? 'pt-8' : ''}>
        <AnimatedRoutes />
      </Layout>
      <AnimatePresence>
        <FocusMiniBar />
      </AnimatePresence>
      <Notification />

      {/* 被其他设备顶下线弹窗 */}
      {kickedByDevice && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[var(--bg-primary)] rounded-2xl shadow-xl p-6 w-96 mx-4 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">该账号已在其他设备登录</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">您的账号刚在另一台电脑设备上登录，为保护数据安全，当前设备已暂停使用。如需继续使用，请重新登录。</p>
            <button
              onClick={async () => {
                setKickedByDevice(false)
                if (user) {
                  await clearDesktopSession(user.id)
                }
                await supabase.auth.signOut()
                setUser(null)
              }}
              className="btn-primary w-full py-2.5"
            >
              确认并重新登录
            </button>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default App

