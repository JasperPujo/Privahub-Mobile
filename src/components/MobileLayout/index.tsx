import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore, useTodoStore, useScheduleStore, usePlanStore, useHabitStore, useNoteStore, useTrackerStore, usePoinStore } from '@/store'
import { useFocusStore } from '@/store/focusStore'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useReminders } from '@/hooks/useReminders'
import { supabase } from '@/lib/supabase'
import { fullSync, noteWallToDb, noteWallFromDb, taskToDb, taskFromDb, scheduleToDb, scheduleFromDb, planToDb, planFromDb, habitToDb, habitFromDb, noteToDb, noteFromDb, trackerCategoryToDb, trackerEntryToDb } from '@/lib/sync'
import {
  Home, CheckSquare, Calendar, Target, TrendingUp, Activity, StickyNote,
  Trash2, Settings, RefreshCw, LogOut, User, Zap, ShoppingBag, Coins, Grid,
  X, List
} from '@/utils/icons'
import appIcon from '@/assets/app-icon.png'
import FocusMiniBar from '@/components/FocusMiniBar'

const iconMap: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Home, CheckSquare, Calendar, Target, TrendingUp, Activity, StickyNote,
  Trash2, Settings, Zap, ShoppingBag, Grid, List
}

const mobileModules = [
  { id: 'todo', title: '待办', icon: 'CheckSquare', path: '/todo' },
  { id: 'focus', title: '专注', icon: 'Zap', path: '/focus' },
  { id: 'habit', title: '习惯', icon: 'TrendingUp', path: '/habit' },
  { id: 'calendar', title: '日历', icon: 'Calendar', path: '/calendar' },
  { id: 'plan', title: '规划', icon: 'Target', path: '/plan' },
  { id: 'tracker', title: '记录', icon: 'Activity', path: '/tracker' },
  { id: 'notes', title: '随心贴', icon: 'StickyNote', path: '/notes' },
  { id: 'poinshop', title: 'Poin', icon: 'ShoppingBag', path: '/poinshop' },
  { id: 'recycle', title: '回收站', icon: 'Trash2', path: '/recycle' },
]

const defaultMobileBottomTabs = ['todo', 'focus', 'habit']

interface LayoutProps {
  children: React.ReactNode
  className?: string
}

const MobileLayout: React.FC<LayoutProps> = ({ children, className }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    settings,
    updateSettings,
    logout,
    user,
    isSyncing,
    setSyncing,
    setLastSyncTime,
    addNotification,
    setUser
  } = useAppStore()
  const { config: poinConfig, balance: poinBalance } = usePoinStore()
  const { lastSyncTimeRef } = useAutoSync()
  useReminders()

  // Focus 状态
  const focusIsActive = useFocusStore(s => s.isActive)

  const [showMore, setShowMore] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedBottomIds = (Array.isArray(settings.mobileBottomTabs) ? settings.mobileBottomTabs : defaultMobileBottomTabs)
    .filter(id => mobileModules.some(m => m.id === id))
    .slice(0, 3)
  const bottomItems = selectedBottomIds.map(id => mobileModules.find(m => m.id === id)!).filter(Boolean)
  const moreModules = mobileModules.filter(m => !selectedBottomIds.includes(m.id))
  const beforeSortModules = moreModules.slice(0, 5)
  const afterSortModules = moreModules.slice(5)
  const navItems = [bottomItems[0], bottomItems[1], { id: 'home', title: '主页', icon: 'Home', path: '/' }, bottomItems[2]]
    .filter(Boolean) as typeof mobileModules

  // 当前激活的 Tab
  const activeTab = navItems.find(tab => location.pathname === tab.path)?.id || ''

  // 更多菜单中是否有当前页面
  const isInMore = moreModules.some(m => m.path === location.pathname) ||
                   location.pathname === '/settings' ||
                   location.pathname === '/about' ||
                   location.pathname.startsWith('/habit/stats') ||
                   location.pathname.startsWith('/tracker/stats') ||
                   location.pathname.startsWith('/focus/stats')

  const toggleBottomTab = (moduleId: string) => {
    const current = selectedBottomIds
    const next = current.includes(moduleId)
      ? current.filter(id => id !== moduleId)
      : [...current, moduleId]

    if (next.length > 3) {
      addNotification({ message: '底部栏最多放 3 个常用功能，首页固定在中间，更多固定在右侧', type: 'warning' })
      return
    }
    updateSettings({ mobileBottomTabs: next })
  }

  // 同步处理
  const handleSync = async () => {
    if (!user) {
      addNotification({ message: '请先登录', type: 'warning' })
      return
    }
    setSyncing(true)
    try {
      const todoStore = useTodoStore.getState()
      const scheduleStore = useScheduleStore.getState()
      const planStore = usePlanStore.getState()
      const habitStore = useHabitStore.getState()
      const noteStore = useNoteStore.getState()
      const trackerStore = useTrackerStore.getState()

      const results = await fullSync(user.id, {
        noteWalls: { table: 'note_walls', getData: () => noteStore.walls, setData: (data: any) => noteStore.setWalls(data), toDbRow: noteWallToDb, fromDbRow: noteWallFromDb },
        tasks: {
          table: 'tasks',
          getData: () => [...todoStore.tasks, ...todoStore.archivedTasks],
          setData: (data: any) => {
            const active = data.filter((t: any) => !t.is_archived)
            const archived = data.filter((t: any) => t.is_archived)
              .sort((a: any, b: any) => (b.archived_at || '').localeCompare(a.archived_at || ''))
            todoStore.setTasks(active)
            todoStore.setArchivedTasks(archived)
          },
          toDbRow: taskToDb,
          fromDbRow: taskFromDb,
        },
        schedules: { table: 'schedules', getData: () => scheduleStore.schedules, setData: (data: any) => scheduleStore.setSchedules(data), toDbRow: scheduleToDb, fromDbRow: scheduleFromDb },
        plans: { table: 'plans', getData: () => planStore.plans, setData: (data: any) => planStore.setPlans(data), toDbRow: planToDb, fromDbRow: planFromDb },
        habits: { table: 'habits', getData: () => habitStore.habits, setData: (data: any) => habitStore.setHabits(data), toDbRow: habitToDb, fromDbRow: habitFromDb },
        notes: { table: 'notes', getData: () => noteStore.notes, setData: (data: any) => noteStore.setNotes(data), toDbRow: noteToDb, fromDbRow: noteFromDb },
        trackerCategories: { table: 'tracker_categories', getData: () => trackerStore.categories, setData: (data: any) => trackerStore.setCategories(data), toDbRow: trackerCategoryToDb },
        trackerEntries: { table: 'tracker_entries', getData: () => trackerStore.entries, setData: (data: any) => trackerStore.setEntries(data), toDbRow: trackerEntryToDb },
      }, { since: lastSyncTimeRef.current, parallel: true })

      const failedTables: string[] = []
      for (const [key, result] of Object.entries(results)) {
        const r = result as any
        if (!r.push?.success || !r.pull?.success) {
          failedTables.push(r.table || key)
        }
      }

      if (failedTables.length > 0) {
        addNotification({ message: '部分数据同步失败', type: 'warning' })
      } else {
        addNotification({ message: '数据同步完成', type: 'success' })
      }
    } catch (err: any) {
      addNotification({ message: '同步失败：' + (err.message || '未知错误'), type: 'error' })
    } finally {
      const now = new Date().toISOString()
      lastSyncTimeRef.current = now
      setSyncing(false)
    }
  }

  // 头像上传
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      addNotification({ message: '头像图片不能超过2MB', type: 'error' })
      return
    }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setUser({ ...user!, avatar: dataUrl })
      localStorage.setItem('user_avatar_' + user!.id, dataUrl)
      try {
        await supabase
          .from('users')
          .update({ avatar: dataUrl, updated_at: new Date().toISOString() })
          .eq('id', user!.id)
        addNotification({ message: '头像已更新并同步', type: 'success' })
      } catch {
        addNotification({ message: '头像已更新（本地）', type: 'success' })
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden ${className || ''}`}>
      {/* ============ 移动端顶栏（fixed 固定在顶部） ============ */}
      <header
        className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)',
          height: 'calc(56px + env(safe-area-inset-top, 0px))',
        }}
      >
        {/* 左侧 Logo */}
        <div className="flex items-center gap-2 h-14">
          <img src={appIcon} alt="PrivaHub" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-[var(--text-primary)] text-base">PrivaHub</span>
        </div>

        {/* 右侧操作 */}
        <div className="flex items-center gap-1.5 h-14">
          {/* Poin 余额 */}
          {poinConfig.enable && (
            <button
              onClick={() => navigate('/poinshop')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600/10 active:bg-primary-600/20 transition-colors"
            >
              <Coins size={15} className="text-primary-600" />
              <span className="text-xs font-medium text-primary-600">{poinBalance}</span>
            </button>
          )}

          {/* 同步按钮 */}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] active:bg-[var(--bg-tertiary)] transition-colors"
          >
            <RefreshCw size={17} className={`text-[var(--text-secondary)] ${isSyncing ? 'animate-spin' : ''}`} />
          </button>

          {/* 用户头像 */}
          <button
            onClick={() => setShowUserMenu(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full overflow-hidden active:scale-95 transition-transform"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="avatar" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary-600/10 flex items-center justify-center">
                <User size={16} className="text-primary-600" />
              </div>
            )}
          </button>
        </div>
      </header>

      {/* ============ 主内容区（padding 避开 fixed 顶栏和底栏） ============ */}
      <main 
        className="flex-1 overflow-hidden flex flex-col relative"
        style={{
          paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(54px + min(env(safe-area-inset-bottom, 0px), 8px))',
        }}
      >
        <div className="flex-1 overflow-auto bg-[var(--bg-primary)] flex flex-col">
          {children}
        </div>
        <FocusMiniBar />
      </main>

      {/* ============ 底部导航栏（fixed 固定在底部） ============ */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]"
        style={{
          paddingBottom: 'min(env(safe-area-inset-bottom, 0px), 8px)',
          height: 'calc(54px + min(env(safe-area-inset-bottom, 0px), 8px))',
        }}
      >
        {navItems.map((tab) => {
          const Icon = iconMap[tab.icon]
          const isActive = activeTab === tab.id
          const isHome = tab.id === 'home'
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center justify-center gap-0.5 h-[54px] relative"
            >
              <div className={isHome ? `w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm ${
                isActive ? 'bg-primary-600 text-white' : 'bg-primary-600/10 text-primary-600'
              }` : 'relative w-9 h-6 flex items-center justify-center'}>
                {isActive && !isHome && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary-600 rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon
                  size={isHome ? 24 : 22}
                  className={isHome ? '' : (isActive ? 'text-primary-600' : 'text-[var(--text-tertiary)]')}
                />
              </div>
              <span
                className={`text-[10px] ${isHome ? '-mt-0.5' : ''} ${isActive ? 'text-primary-600 font-medium' : 'text-[var(--text-tertiary)]'}`}
              >
                {tab.title}
              </span>
            </button>
          )
        })}

        {/* 更多按钮 */}
        <button
          onClick={() => setShowMore(true)}
          className="flex flex-col items-center justify-center gap-0.5 h-[54px] relative"
        >
          <div className="relative w-9 h-6 flex items-center justify-center">
            {(isInMore || showMore) && (
              <motion.div
                layoutId="activeTab"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary-600 rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Grid
              size={22}
              className={isInMore || showMore ? 'text-primary-600' : 'text-[var(--text-tertiary)]'}
            />
          </div>
          <span
            className={`text-[10px] ${isInMore || showMore ? 'text-primary-600 font-medium' : 'text-[var(--text-tertiary)]'}`}
          >
            更多
          </span>
        </button>
      </nav>

      {/* ============ 更多菜单（底部弹出） ============ */}
      <AnimatePresence>
        {showMore && (
          <>
            {/* 遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setShowMore(false)}
            />
            {/* 底部弹窗 */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-secondary)] rounded-t-2xl shadow-soft-lg"
              style={{
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              {/* 拖拽指示器 */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
              </div>

              {/* 标题栏 */}
              <div className="flex items-center justify-between px-5 py-3">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">全部功能</h3>
                <button
                  onClick={() => setShowMore(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)]"
                >
                  <X size={18} className="text-[var(--text-secondary)]" />
                </button>
              </div>

              {/* 功能网格 */}
              <div className="grid grid-cols-4 gap-2 px-4 pb-3">
                {beforeSortModules.map((module) => {
                  const Icon = iconMap[module.icon]
                  return (
                    <button
                      key={module.id}
                      onClick={() => {
                        setShowMore(false)
                        navigate(module.path)
                      }}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl active:bg-[var(--bg-tertiary)] transition-colors relative"
                    >
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-primary-600/10">
                        <Icon size={20} className="text-primary-600" />
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {module.title}
                      </span>
                    </button>
                  )
                })}

                <button
                  onClick={() => setShowSort(true)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl active:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-primary-600/10">
                    <List size={20} className="text-primary-600" />
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)]">排序</span>
                </button>

                {afterSortModules.map((module) => {
                  const Icon = iconMap[module.icon]
                  return (
                    <button
                      key={module.id}
                      onClick={() => {
                        setShowMore(false)
                        navigate(module.path)
                      }}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl active:bg-[var(--bg-tertiary)] transition-colors relative"
                    >
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-primary-600/10">
                        <Icon size={20} className="text-primary-600" />
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {module.title}
                      </span>
                    </button>
                  )
                })}

                {/* 设置 */}
                <button
                  onClick={() => {
                    setShowMore(false)
                    navigate('/settings')
                  }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl active:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-primary-600/10">
                    <Settings size={20} className="text-primary-600" />
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)]">设置</span>
                </button>
              </div>

              {/* 退出登录 */}
              <div className="px-4 pb-4 pt-1">
                <button
                  onClick={async () => {
                    setShowMore(false)
                    await logout()
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border-color)] text-danger active:bg-red-50 dark:active:bg-red-950/20 transition-colors"
                >
                  <LogOut size={17} />
                  <span className="text-sm font-medium">退出登录</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============ 底部栏排序/自定义 ============ */}
      <AnimatePresence>
        {showSort && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={() => setShowSort(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="fixed bottom-0 left-0 right-0 z-[60] bg-[var(--bg-secondary)] rounded-t-2xl shadow-soft-lg"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">底部栏排序</h3>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">首页固定居中，更多固定右侧；最多选择 3 个常用功能</p>
                </div>
                <button
                  onClick={() => setShowSort(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg active:bg-[var(--bg-tertiary)]"
                >
                  <X size={18} className="text-[var(--text-secondary)]" />
                </button>
              </div>
              <div className="px-4 py-3 space-y-2 max-h-[55vh] overflow-y-auto">
                {mobileModules.map((module) => {
                  const Icon = iconMap[module.icon]
                  const checked = selectedBottomIds.includes(module.id)
                  return (
                    <button
                      key={module.id}
                      onClick={() => toggleBottomTab(module.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                        checked
                          ? 'border-primary-600 bg-primary-600/10'
                          : 'border-[var(--border-color)] bg-[var(--bg-primary)] active:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        checked ? 'bg-primary-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                      }`}>
                        <Icon size={19} />
                      </div>
                      <span className="flex-1 text-left text-sm font-medium text-[var(--text-primary)]">{module.title}</span>
                      <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        checked ? 'bg-primary-600 border-primary-600' : 'border-[var(--border-color)]'
                      }`}>
                        {checked && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={() => {
                    updateSettings({ mobileBottomTabs: defaultMobileBottomTabs })
                    addNotification({ message: '底部栏已恢复默认', type: 'success' })
                  }}
                  className="w-full py-3 rounded-xl border border-[var(--border-color)] text-sm text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
                >
                  恢复默认
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============ 用户菜单（底部弹出） ============ */}
      <AnimatePresence>
        {showUserMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setShowUserMenu(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-secondary)] rounded-t-2xl shadow-soft-lg"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
              </div>

              {/* 用户信息 */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-color)]">
                {user?.avatar ? (
                  <img src={user.avatar} alt="avatar" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary-600/10 flex items-center justify-center">
                    <User size={20} className="text-primary-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user?.username || '用户'}</p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">{user?.email}</p>
                </div>
              </div>

              {/* 菜单项 */}
              <div className="py-2">
                <button
                  onClick={() => {
                    setShowUserMenu(false)
                    fileInputRef.current?.click()
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 active:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <User size={18} className="text-[var(--text-secondary)]" />
                  <span className="text-sm text-[var(--text-primary)]">更换头像</span>
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false)
                    navigate('/settings')
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 active:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <Settings size={18} className="text-[var(--text-secondary)]" />
                  <span className="text-sm text-[var(--text-primary)]">设置</span>
                </button>
                <button
                  onClick={async () => {
                    setShowUserMenu(false)
                    await logout()
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 active:bg-red-50 dark:active:bg-red-950/20 transition-colors"
                >
                  <LogOut size={18} className="text-danger" />
                  <span className="text-sm text-danger">退出登录</span>
                </button>
              </div>
              <div className="pb-2" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
    </div>
  )
}

export default MobileLayout
