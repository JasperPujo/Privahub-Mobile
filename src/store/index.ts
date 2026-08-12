import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User, UserSettings, FeatureFlags, Task, Schedule, Shift, Habit, Plan, NoteWall, Note, Tag, ModuleConfig, LockScreenState, TrackerCategory, TrackerEntry, PoinConfig, PoinRecord, PoinShopItem, PoinBagItem } from '@/types'

// 版本号：由 Vite 编译时从 package.json 注入，确保与应用真实版本完全一致
// 修改版本号只需更新 package.json 中的 version 字段，所有位置自动同步
export const APP_VERSION = __APP_VERSION__

// 预设标签 —— 任务待办
const defaultTodoTags: Tag[] = [
  { id: 'tag-todo-work', name: '工作', color: '#4B3FE3', is_builtin: true, created_at: '' },
  { id: 'tag-todo-study', name: '学习', color: '#1DC981', is_builtin: true, created_at: '' },
  { id: 'tag-todo-life', name: '生活', color: '#EFAA17', is_builtin: true, created_at: '' },
  { id: 'tag-todo-health', name: '健康', color: '#E8463A', is_builtin: true, created_at: '' },
  { id: 'tag-todo-important', name: '重要', color: '#8B5CF6', is_builtin: true, created_at: '' },
  { id: 'tag-todo-urgent', name: '紧急', color: '#F97316', is_builtin: true, created_at: '' },
]

// 预设标签 —— 日程日历
const defaultScheduleTags: Tag[] = [
  { id: 'tag-schedule-meeting', name: '会议', color: '#4B3FE3', is_builtin: true, created_at: '' },
  { id: 'tag-schedule-appointment', name: '约会', color: '#EC4899', is_builtin: true, created_at: '' },
  { id: 'tag-schedule-activity', name: '活动', color: '#27D2BF', is_builtin: true, created_at: '' },
  { id: 'tag-schedule-deadline', name: '截止', color: '#E8463A', is_builtin: true, created_at: '' },
  { id: 'tag-schedule-anniversary', name: '纪念日', color: '#8B5CF6', is_builtin: true, created_at: '' },
  { id: 'tag-schedule-personal', name: '个人', color: '#EFAA17', is_builtin: true, created_at: '' },
]

// 模块配置
const defaultModules: ModuleConfig[] = [
  { id: 'home', name: 'home', title: '主页', icon: 'Home', path: '/', isVisible: true },
  { id: 'todo', name: 'todo', title: '任务待办', icon: 'CheckSquare', path: '/todo', isVisible: true },
  { id: 'calendar', name: 'calendar', title: '日历日程', icon: 'Calendar', path: '/calendar', isVisible: true },
  { id: 'plan', name: 'plan', title: '宏观规划', icon: 'Target', path: '/plan', isVisible: true },
  { id: 'habit', name: 'habit', title: '习惯记录', icon: 'TrendingUp', path: '/habit', isVisible: true },
  { id: 'tracker', name: 'tracker', title: '实时记录', icon: 'Activity', path: '/tracker', isVisible: true },
  { id: 'notes', name: 'notes', title: '随心贴', icon: 'StickyNote', path: '/notes', isVisible: true },
  { id: 'focus', name: 'focus', title: 'Priva专注', icon: 'Zap', path: '/focus', isVisible: true },
  { id: 'poinshop', name: 'poinshop', title: 'Poin商城', icon: 'ShoppingBag', path: '/poinshop', isVisible: true },
  { id: 'recycle', name: 'recycle', title: '回收站', icon: 'Trash2', path: '/recycle', isVisible: true },
  { id: 'settings', name: 'settings', title: '设置', icon: 'Settings', path: '/settings', isVisible: true },
]

const defaultFeatureFlags: FeatureFlags = {
  todoPriority: true,
  todoSubtasks: true,
  todoTags: true,
  todoDueDate: true,
  scheduleAllDay: true,
  scheduleRepeat: true,
  scheduleLocation: true,
  habitNegative: true,
  habitCheckinNote: true,
  trackerNote: true,
  trackerHeatmap: true,
  trackerUnit: true,
  notesWalls: true,
  planSchedule: true,
}

const defaultSettings: UserSettings = {
  theme: 'light',
  autoLogin: false,
  rememberPassword: false,
  lockScreenEnabled: false,
  soundEnabled: false,
  scheduleReminderEnabled: false,
  autoLockEnabled: false,
  autoLockTimeout: 15,
  defaultHomePage: 'home',
  hiddenModules: [],
  moduleOrder: defaultModules.map(m => m.id),
  homeShortcuts: ['todo', 'calendar', 'plan', 'notes'],
  mobileBottomTabs: ['todo', 'focus', 'habit'],
  featureFlags: defaultFeatureFlags,
  appVersion: APP_VERSION,
}

// 全局应用状态
interface AppState {
  // 主题
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void

  // 用户
  user: User | null
  isLoggedIn: boolean
  setUser: (user: User | null) => void
  logout: () => void

  // 设置
  settings: UserSettings
  updateSettings: (settings: Partial<UserSettings>) => void

  // 模块
  modules: ModuleConfig[]
  setModules: (modules: ModuleConfig[]) => void
  toggleModuleVisibility: (moduleId: string) => void
  reorderModules: (newOrder: string[]) => void

  // 锁屏
  lockScreen: LockScreenState
  setLockScreen: (state: Partial<LockScreenState>) => void
  lockApp: () => void
  unlockApp: (password: string) => boolean

  // 通知
  notifications: { id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }[]
  addNotification: (notification: Omit<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }, 'id'>) => void
  removeNotification: (id: string) => void

  // 同步
  lastSyncTime: string | null
  isSyncing: boolean
  setSyncing: (syncing: boolean) => void
  setLastSyncTime: (time: string) => void

  // 侧边栏
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 主题
      theme: 'light',
      setTheme: (theme) => {
        set({ theme })
        if (theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light'
        get().setTheme(newTheme)
      },

      // 用户
      user: null,
      isLoggedIn: false,
      setUser: (user) => set({ user, isLoggedIn: !!user }),
      logout: async () => {
        const state = get()
        // 如果开启了自动登录，保留 Supabase session，仅清除本地状态
        if (!state.settings.autoLogin) {
          const { supabase } = await import('@/lib/supabase')
          await supabase.auth.signOut()
        }
        set({ user: null, isLoggedIn: false })
        // 清除本地登录缓存
        localStorage.removeItem('auth_token')
      },

      // 设置
      settings: defaultSettings,
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        }))
        // 异步保存到 Supabase
        const user = get().user
        if (user?.id) {
          import('@/lib/supabase').then(({ supabase }) => {
            const settings = get().settings
            supabase.from('users').update({ settings }).eq('id', user.id).then(({ error }) => {
              if (error) console.warn('[Store] Failed to save settings:', error.message)
            })
          })
        }
      },

      // 模块
      modules: defaultModules,
      setModules: (modules) => set({ modules }),
      toggleModuleVisibility: (moduleId) => {
        set((state) => {
          const hidden = state.settings.hiddenModules.includes(moduleId)
            ? state.settings.hiddenModules.filter(id => id !== moduleId)
            : [...state.settings.hiddenModules, moduleId]
          return {
            settings: { ...state.settings, hiddenModules: hidden }
          }
        })
      },
      reorderModules: (newOrder) => {
        set((state) => {
          const reordered = newOrder.map(id => state.modules.find(m => m.id === id)!).filter(Boolean)
          return {
            modules: reordered,
            settings: { ...state.settings, moduleOrder: newOrder }
          }
        })
      },

      // 锁屏
      lockScreen: {
        isLocked: false,
        passwordHash: '',
        failedAttempts: 0,
        lockUntil: null
      },
      setLockScreen: (state) => {
        set((prev) => ({
          lockScreen: { ...prev.lockScreen, ...state }
        }))
      },
      lockApp: () => {
        const { lockScreen } = get()
        if (lockScreen.passwordHash) {
          set({ lockScreen: { ...lockScreen, isLocked: true } })
        }
      },
      unlockApp: (password: string) => {
        const { lockScreen } = get()
        const now = Date.now()
        if (lockScreen.lockUntil && now < lockScreen.lockUntil) {
          return false
        }
        // 简单哈希比较（实际使用 crypto 模块）
        const hashed = btoa(password)
        if (hashed === lockScreen.passwordHash) {
          set({ lockScreen: { ...lockScreen, isLocked: false, failedAttempts: 0 } })
          return true
        } else {
          const attempts = lockScreen.failedAttempts + 1
          const lockUntil = attempts >= 5 ? now + 5 * 60 * 1000 : null
          set({ lockScreen: { ...lockScreen, failedAttempts: attempts, lockUntil } })
          return false
        }
      },

      // 通知
      notifications: [],
      addNotification: (notification) => {
        const id = Date.now().toString()
        set((state) => ({
          notifications: [...state.notifications, { ...notification, id }]
        }))
        setTimeout(() => {
          get().removeNotification(id)
        }, 3000)
      },
      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter(n => n.id !== id)
        }))
      },

      // 同步
      lastSyncTime: null,
      isSyncing: false,
      setSyncing: (syncing) => set({ isSyncing: syncing }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),

      // 侧边栏
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: 'private-workbench-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        settings: state.settings,
        modules: state.modules,
        lockScreen: state.lockScreen,
        lastSyncTime: state.lastSyncTime
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const storedVersion = state.settings?.appVersion
        if (storedVersion !== APP_VERSION) {
          // 版本变化：合并模块列表（保留用户可见性设置，添加新模块）
          const mergedModules = defaultModules.map((defaultModule) => {
            const stored = state.modules?.find((m) => m.id === defaultModule.id)
            if (stored) {
              return { ...defaultModule, isVisible: stored.isVisible }
            }
            return defaultModule
          })
          state.setModules(mergedModules)
          // 合并设置（保留用户设置，添加新字段默认值）
          state.updateSettings({
            ...defaultSettings,
            ...state.settings,
            appVersion: APP_VERSION,
          })
        }
      }
    }
  )
)

// 各模块独立状态
interface TodoState {
  tasks: Task[]
  archivedTasks: Task[]
  tags: Tag[]
  setTasks: (tasks: Task[]) => void
  setArchivedTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, task: Partial<Task>) => void
  deleteTask: (id: string) => void
  archiveTask: (id: string) => Task | null
  unarchiveTask: (id: string) => Task | null
  exportArchived: () => string
  clearOldArchived: () => void
  setTags: (tags: Tag[]) => void
  addTag: (tag: Tag) => void
  deleteTag: (id: string) => void
  clearData: () => void
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      tasks: [],
      archivedTasks: [],
      tags: defaultTodoTags,
      setTasks: (tasks) => set({ tasks }),
      setArchivedTasks: (archivedTasks) => set({ archivedTasks }),
      addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
      updateTask: (id, task) => set((state) => {
        const now = new Date().toISOString()
        return {
          tasks: state.tasks.map(t => {
            if (t.id !== id) return t
            const isCompleting = task.is_completed === true && !t.is_completed
            const isReopening = task.is_completed === false && t.is_completed
            return {
              ...t,
              ...task,
              completed_at: isCompleting ? now : isReopening ? null : t.completed_at,
              updated_at: now
            }
          })
        }
      }),
      deleteTask: (id) => set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? { ...t, deleted_at: new Date().toISOString() } : t)
      })),
      archiveTask: (id) => {
        const state = get()
        const task = state.tasks.find(t => t.id === id)
        if (!task || !task.is_completed) return null
        const now = new Date().toISOString()
        const archivedTask = { ...task, is_archived: true, archived_at: now, updated_at: now }
        set({
          tasks: state.tasks.filter(t => t.id !== id),
          archivedTasks: [archivedTask, ...state.archivedTasks]
        })
        return archivedTask
      },
      unarchiveTask: (id) => {
        const state = get()
        const task = state.archivedTasks.find(t => t.id === id)
        if (!task) return null
        const now = new Date().toISOString()
        const restoredTask = { ...task, is_archived: false, archived_at: null, updated_at: now }
        set({
          archivedTasks: state.archivedTasks.filter(t => t.id !== id),
          tasks: [restoredTask, ...state.tasks]
        })
        return restoredTask
      },
      exportArchived: () => {
        const { archivedTasks } = get()
        return JSON.stringify(archivedTasks, null, 2)
      },
      clearOldArchived: () => set((state) => {
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
        return {
          archivedTasks: state.archivedTasks.filter(t => !t.archived_at || t.archived_at > oneYearAgo)
        }
      }),
      setTags: (tags) => set({ tags }),
      addTag: (tag) => set((state) => {
        // 避免重复添加同名标签
        if (state.tags.some(t => t.name === tag.name)) return state
        return { tags: [...state.tags, tag] }
      }),
      deleteTag: (id) => set((state) => ({ tags: state.tags.filter(t => t.id !== id) })),
      clearData: () => set({ tasks: [], archivedTasks: [], tags: defaultTodoTags }),
    }),
    {
      name: 'private-workbench-todo',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

interface ScheduleState {
  schedules: Schedule[]
  tags: Tag[]
  setSchedules: (schedules: Schedule[]) => void
  addSchedule: (schedule: Schedule) => void
  updateSchedule: (id: string, schedule: Partial<Schedule>) => void
  deleteSchedule: (id: string) => void
  setTags: (tags: Tag[]) => void
  addTag: (tag: Tag) => void
  deleteTag: (id: string) => void
  clearData: () => void
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      schedules: [],
      tags: defaultScheduleTags,
      setSchedules: (schedules) => set({ schedules }),
      addSchedule: (schedule) => set((state) => ({ schedules: [...state.schedules, schedule] })),
      updateSchedule: (id, schedule) => set((state) => ({
        schedules: state.schedules.map(s => s.id === id ? { ...s, ...schedule, updated_at: new Date().toISOString() } : s)
      })),
      deleteSchedule: (id) => set((state) => ({
        schedules: state.schedules.map(s => s.id === id ? { ...s, deleted_at: new Date().toISOString() } : s)
      })),
      setTags: (tags) => set({ tags }),
      addTag: (tag) => set((state) => {
        if (state.tags.some(t => t.name === tag.name)) return state
        return { tags: [...state.tags, tag] }
      }),
      deleteTag: (id) => set((state) => ({ tags: state.tags.filter(t => t.id !== id) })),
      clearData: () => set({ schedules: [], tags: defaultScheduleTags }),
    }),
    {
      name: 'private-workbench-schedule',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

interface PlanState {
  plans: Plan[]
  tags: Tag[]
  setPlans: (plans: Plan[]) => void
  addPlan: (plan: Plan) => void
  updatePlan: (id: string, plan: Partial<Plan>) => void
  deletePlan: (id: string) => void
  addTag: (tag: Tag) => void
  clearData: () => void
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      plans: [],
      tags: [],
      setPlans: (plans) => set({ plans }),
      addPlan: (plan) => set((state) => ({ plans: [plan, ...state.plans] })),
      updatePlan: (id, plan) => set((state) => ({
        plans: state.plans.map(p => p.id === id ? { ...p, ...plan, updated_at: new Date().toISOString() } : p)
      })),
      deletePlan: (id) => set((state) => ({
        plans: state.plans.map(p => p.id === id ? { ...p, deleted_at: new Date().toISOString() } : p)
      })),
      addTag: (tag) => set((state) => ({ tags: [...state.tags, tag] })),
      clearData: () => set({ plans: [], tags: [] }),
    }),
    {
      name: 'private-workbench-plan',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

interface HabitState {
  habits: Habit[]
  setHabits: (habits: Habit[]) => void
  addHabit: (habit: Habit) => void
  updateHabit: (id: string, habit: Partial<Habit>) => void
  deleteHabit: (id: string) => void
  reorderHabits: (newOrder: string[]) => void
  checkin: (id: string, date: string, note: string, images?: string[]) => void
  uncheckin: (id: string, date: string) => void
  clearData: () => void
}

export const useHabitStore = create<HabitState>()(
  persist(
    (set) => ({
      habits: [],
      setHabits: (habits) => set({ habits }),
      addHabit: (habit) => set((state) => ({ habits: [habit, ...state.habits] })),
      updateHabit: (id, habit) => set((state) => ({
        habits: state.habits.map(h => h.id === id ? { ...h, ...habit, updated_at: new Date().toISOString() } : h)
      })),
      deleteHabit: (id) => set((state) => ({
        habits: state.habits.map(h => h.id === id ? { ...h, deleted_at: new Date().toISOString() } : h)
      })),
      reorderHabits: (newOrder) => set((state) => {
        const orderMap = new Map(newOrder.map((id, i) => [id, i]))
        const now = new Date().toISOString()
        return {
          habits: state.habits
            .map(h => ({ ...h, sort_order: orderMap.has(h.id) ? orderMap.get(h.id)! : h.sort_order ?? 999, updated_at: now }))
            .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        }
      }),
      checkin: (id, date, note, images) => set((state) => ({
        habits: state.habits.map(h => {
          if (h.id !== id) return h
          const existingIndex = h.checkins.findIndex(c => c.date === date)
          let newCheckins
          if (existingIndex >= 0) {
            newCheckins = h.checkins.map((c, i) => i === existingIndex ? { date, note, images: images || [] } : c)
          } else {
            newCheckins = [...h.checkins, { date, note, images: images || [] }]
          }
          newCheckins.sort((a, b) => a.date.localeCompare(b.date))
          return { ...h, checkins: newCheckins, updated_at: new Date().toISOString() }
        })
      })),
      uncheckin: (id, date) => set((state) => ({
        habits: state.habits.map(h => {
          if (h.id !== id) return h
          return {
            ...h,
            checkins: h.checkins.filter(c => c.date !== date),
            updated_at: new Date().toISOString()
          }
        })
      })),
      clearData: () => set({ habits: [] }),
    }),
    {
      name: 'private-workbench-habit',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

interface NoteState {
  walls: NoteWall[]
  notes: Note[]
  setWalls: (walls: NoteWall[]) => void
  setNotes: (notes: Note[]) => void
  addWall: (wall: NoteWall) => void
  updateWall: (id: string, wall: Partial<NoteWall>) => void
  deleteWall: (id: string) => void
  reorderWalls: (wallIds: string[]) => void
  addNote: (note: Note) => void
  updateNote: (id: string, note: Partial<Note>) => void
  deleteNote: (id: string) => void
  moveNote: (noteId: string, targetWallId: string) => void
  pinNote: (id: string) => void
  reorderNotes: (wallId: string, noteIds: string[]) => void
  addComment: (noteId: string, comment: { id: string; text: string; created_at: string }) => void
  deleteComment: (noteId: string, commentId: string) => void
  clearData: () => void
}

export const useNoteStore = create<NoteState>()(
  persist(
    (set) => ({
      walls: [],
      notes: [],
      setWalls: (walls) => set({ walls }),
      setNotes: (notes) => set({ notes }),
      addWall: (wall) => set((state) => ({ walls: [wall, ...state.walls] })),
      updateWall: (id, wall) => set((state) => ({
        walls: state.walls.map(w => w.id === id ? { ...w, ...wall, updated_at: new Date().toISOString() } : w)
      })),
      deleteWall: (id) => set((state) => ({
        walls: state.walls.map(w => w.id === id ? { ...w, deleted_at: new Date().toISOString() } : w)
      })),
      reorderWalls: (wallIds) => set((state) => {
        const orderMap = new Map(wallIds.map((id, idx) => [id, idx]))
        const now = new Date().toISOString()
        return {
          walls: state.walls.map(w => ({
            ...w,
            sort_order: orderMap.has(w.id) ? orderMap.get(w.id)! : w.sort_order,
            updated_at: now
          })).sort((a, b) => a.sort_order - b.sort_order)
        }
      }),
      addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
      updateNote: (id, note) => set((state) => ({
        notes: state.notes.map(n => n.id === id ? { ...n, ...note, updated_at: new Date().toISOString() } : n)
      })),
      deleteNote: (id) => set((state) => ({
        notes: state.notes.map(n => n.id === id ? { ...n, deleted_at: new Date().toISOString() } : n)
      })),
      moveNote: (noteId, targetWallId) => set((state) => ({
        notes: state.notes.map(n => n.id === noteId ? { ...n, wall_id: targetWallId, updated_at: new Date().toISOString() } : n)
      })),
      pinNote: (id) => set((state) => ({
        notes: state.notes.map(n => n.id === id ? { ...n, is_pinned: !n.is_pinned } : n)
      })),
      reorderNotes: (wallId, noteIds) => set((state) => {
        const orderMap = new Map(noteIds.map((id, idx) => [id, idx]))
        const now = new Date().toISOString()
        return {
          notes: state.notes.map(n => {
            if (n.wall_id !== wallId) return n
            return {
              ...n,
              sort_order: orderMap.has(n.id) ? orderMap.get(n.id)! : n.sort_order,
              updated_at: now
            }
          })
        }
      }),
      addComment: (noteId, comment) => set((state) => ({
        notes: state.notes.map(n => {
          if (n.id !== noteId) return n
          return { ...n, comments: [...n.comments, comment], updated_at: new Date().toISOString() }
        })
      })),
      deleteComment: (noteId, commentId) => set((state) => ({
        notes: state.notes.map(n => {
          if (n.id !== noteId) return n
          return { ...n, comments: n.comments.filter(c => c.id !== commentId), updated_at: new Date().toISOString() }
        })
      })),
      clearData: () => set({ walls: [], notes: [] }),
    }),
    {
      name: 'private-workbench-note',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

interface RecycleBinState {
  items: { id: string; type: string; title: string; deleted_at: string; data: unknown }[]
  addItem: (item: { id: string; type: string; title: string; data: unknown }) => void
  restoreItem: (id: string) => void
  permanentDelete: (id: string) => void
  clearExpired: () => void
  clearData: () => void
}

export const useRecycleBinStore = create<RecycleBinState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((state) => ({
        items: [{ ...item, deleted_at: new Date().toISOString() }, ...state.items]
      })),
      restoreItem: (id) => set((state) => ({
        items: state.items.filter(item => item.id !== id)
      })),
      permanentDelete: (id) => set((state) => ({
        items: state.items.filter(item => item.id !== id)
      })),
      clearExpired: () => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        set((state) => ({
          items: state.items.filter(item => item.deleted_at > sevenDaysAgo)
        }))
      },
      clearData: () => set({ items: [] }),
    }),
    {
      name: 'private-workbench-recycle',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

// 实时记录（Tracker）状态
interface TrackerState {
  categories: TrackerCategory[]
  entries: TrackerEntry[]
  setCategories: (categories: TrackerCategory[]) => void
  setEntries: (entries: TrackerEntry[]) => void
  addCategory: (category: TrackerCategory) => void
  updateCategory: (id: string, category: Partial<TrackerCategory>) => void
  deleteCategory: (id: string) => void
  reorderCategories: (newOrder: string[]) => void
  addEntry: (entry: TrackerEntry) => void
  deleteEntry: (id: string) => void
  clearData: () => void
}

export const useTrackerStore = create<TrackerState>()(
  persist(
    (set) => ({
      categories: [],
      entries: [],
      setCategories: (categories) => set({ categories }),
      setEntries: (entries) => set({ entries }),
      addCategory: (category) => set((state) => ({ categories: [category, ...state.categories] })),
      updateCategory: (id, category) => set((state) => ({
        categories: state.categories.map(c => c.id === id ? { ...c, ...category, updated_at: new Date().toISOString() } : c)
      })),
      deleteCategory: (id) => set((state) => ({
        categories: state.categories.map(c => c.id === id ? { ...c, deleted_at: new Date().toISOString() } : c)
      })),
      reorderCategories: (newOrder) => set((state) => {
        const orderMap = new Map(newOrder.map((id, i) => [id, i]))
        const now = new Date().toISOString()
        return {
          categories: state.categories
            .map(c => ({ ...c, sort_order: orderMap.has(c.id) ? orderMap.get(c.id)! : c.sort_order ?? 999, updated_at: now }))
            .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        }
      }),
      addEntry: (entry) => set((state) => ({ entries: [entry, ...state.entries] })),
      deleteEntry: (id) => set((state) => ({
        entries: state.entries.map(e => e.id === id ? { ...e, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } : e)
      })),
      clearData: () => set({ categories: [], entries: [] }),
    }),
    {
      name: 'private-workbench-tracker',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

// 排班（Shift）状态
interface ShiftState {
  shifts: Shift[]
  setShift: (shift: Shift) => void
  setShifts: (data: Shift[]) => void
  removeShift: (year: number, month: number, day: number) => void
  getMonthShifts: (year: number, month: number) => Shift[]
  batchSetMonth: (year: number, month: number, items: Array<{ day: number; type: Shift['type'] }>) => void
  clearData: () => void
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      shifts: [],
      // 设置单条排班（存在则更新，不存在则新增）
      setShift: (shift) => set((state) => {
        const idx = state.shifts.findIndex(
          s => s.year === shift.year && s.month === shift.month && s.day === shift.day && !s.deleted_at
        )
        if (idx >= 0) {
          return { shifts: state.shifts.map((s, i) => i === idx ? { ...s, ...shift, updated_at: new Date().toISOString() } : s) }
        }
        return { shifts: [...state.shifts, shift] }
      }),
      // 批量设置排班数据（同步用）
      setShifts: (data) => set({ shifts: data }),
      // 删除某天的排班
      removeShift: (year, month, day) => set((state) => ({
        shifts: state.shifts.map(s =>
          s.year === year && s.month === month && s.day === day
            ? { ...s, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            : s
        )
      })),
      // 获取某月的有效排班列表
      getMonthShifts: (year, month) => {
        return get().shifts.filter(s => s.year === year && s.month === month && !s.deleted_at)
      },
      // 批量设置某月排班（会清除该月旧数据再写入）
      batchSetMonth: (year, month, items) => set((state) => {
        const now = new Date().toISOString()
        // 先将该月旧记录标记为删除
        const updated = state.shifts.map(s =>
          s.year === year && s.month === month && !s.deleted_at
            ? { ...s, deleted_at: now, updated_at: now }
            : s
        )
        // 写入新记录
        const newShifts = items.map(item => ({
          id: `shift-${year}-${month}-${item.day}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          user_id: 'current-user',
          year,
          month,
          day: item.day,
          type: item.type,
          deleted_at: null,
          created_at: now,
          updated_at: now,
        } as Shift))
        return { shifts: [...newShifts, ...updated] }
      }),
      clearData: () => set({ shifts: [] }),
    }),
    {
      name: 'private-workbench-shift',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

// ---- 切换账号时清除所有本地数据 ----

// Poin 货币系统状态
interface PoinState {
  config: PoinConfig
  records: PoinRecord[]
  shopItems: PoinShopItem[]
  bagItems: PoinBagItem[]
  balance: number
  setConfig: (config: PoinConfig) => void
  setBalance: (balance: number) => void
  setRecords: (records: PoinRecord[]) => void
  addRecord: (record: PoinRecord) => void
  updateRecord: (id: string, record: Partial<PoinRecord>) => void
  setShopItems: (items: PoinShopItem[]) => void
  addShopItem: (item: PoinShopItem) => void
  updateShopItem: (id: string, item: Partial<PoinShopItem>) => void
  deleteShopItem: (id: string) => void
  setBagItems: (items: PoinBagItem[]) => void
  addBagItem: (item: PoinBagItem) => void
  updateBagItem: (id: string, item: Partial<PoinBagItem>) => void
  resetAll: () => void
  clearData: () => void
}

export const usePoinStore = create<PoinState>()(
  persist(
    (set) => ({
      config: { enable: false, allow_overdraft: true, save_log: true },
      records: [],
      shopItems: [],
      bagItems: [],
      balance: 0,
      setConfig: (config) => set({ config }),
      setBalance: (balance) => set({ balance }),
      setRecords: (records) => set({ records }),
      addRecord: (record) => set((state) => ({ records: [record, ...state.records] })),
      updateRecord: (id, record) => set((state) => ({
        records: state.records.map(r => r.id === id ? { ...r, ...record } : r)
      })),
      setShopItems: (shopItems) => set({ shopItems }),
      addShopItem: (item) => set((state) => ({ shopItems: [item, ...state.shopItems] })),
      updateShopItem: (id, item) => set((state) => ({
        shopItems: state.shopItems.map(s => s.id === id ? { ...s, ...item, updated_at: new Date().toISOString() } : s)
      })),
      deleteShopItem: (id) => set((state) => ({
        shopItems: state.shopItems.map(s => s.id === id ? { ...s, deleted_at: new Date().toISOString() } : s)
      })),
      setBagItems: (bagItems) => set({ bagItems }),
      addBagItem: (item) => set((state) => ({ bagItems: [item, ...state.bagItems] })),
      updateBagItem: (id, item) => set((state) => ({
        bagItems: state.bagItems.map(b => b.id === id ? { ...b, ...item } : b)
      })),
      resetAll: () => set({ records: [], shopItems: [], bagItems: [], balance: 0 }),
      clearData: () => set({
        config: { enable: false, allow_overdraft: true, save_log: true },
        records: [],
        shopItems: [],
        bagItems: [],
        balance: 0,
      }),
    }),
    {
      name: 'private-workbench-poin',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

// ---- 切换账号时清除所有本地数据 ----
const STORE_KEYS = [
  'private-workbench-store',
  'private-workbench-todo',
  'private-workbench-schedule',
  'private-workbench-plan',
  'private-workbench-habit',
  'private-workbench-note',
  'private-workbench-recycle',
  'private-workbench-tracker',
  'private-workbench-shift',
  'private-workbench-poin',
]

export function clearAllDataStores() {
  // 清除除了 app store 以外的所有数据 store（app store 保留主题、设置等）
  // 但需要重置 lastSyncTime
  STORE_KEYS.forEach(key => {
    if (key === 'private-workbench-store') {
      const existing = localStorage.getItem(key)
      if (existing) {
        try {
          const parsed = JSON.parse(existing)
          // 保留主题、设置、模块配置，但清除 user/isLoggedIn、lastSyncTime
          delete parsed.state?.user
          delete parsed.state?.isLoggedIn
          delete parsed.state?.lastSyncTime
          localStorage.setItem(key, JSON.stringify(parsed))
        } catch { /* ignore */ }
      }
    } else {
      localStorage.removeItem(key)
    }
  })
  // 同时清除内存中的状态（避免 zustand 从内存中保留旧数据）
  useTodoStore.getState().clearData()
  useScheduleStore.getState().clearData()
  usePlanStore.getState().clearData()
  useHabitStore.getState().clearData()
  useNoteStore.getState().clearData()
  useRecycleBinStore.getState().clearData()
  useTrackerStore.getState().clearData()
  useShiftStore.getState().clearData()
  usePoinStore.getState().clearData()
  // 关键：重置内存中的 lastSyncTime 和同步锁
  // 只修改 localStorage 不够，Zustand 内存状态仍保留旧值
  // 会导致 useAutoSync 的 lastSyncTimeRef 保持旧值，首次同步错误地使用增量模式
  useAppStore.setState({ lastSyncTime: null, isSyncing: false })
}




