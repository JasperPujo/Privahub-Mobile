import { create } from 'zustand'

interface FocusState {
  // 计时状态
  isRunning: boolean
  elapsed: number
  mode: 'countUp' | 'countDown' | 'pomodoro'
  targetDuration: number
  isRest: boolean
  pomodoroCount: number
  focusTheme: string
  linkedTaskId: string | null
  completedTaskIds: string[]

  // 悬浮窗状态
  isActive: boolean  // 是否有正在进行的专注（用于显示悬浮窗）
  miniBarVisible: boolean  // 悬浮窗是否可见

  // Actions
  startSession: (mode: 'countUp' | 'countDown' | 'pomodoro', targetDuration: number, theme: string, taskId: string | null) => void
  setRunning: (running: boolean) => void
  setElapsed: (updater: number | ((prev: number) => number)) => void
  setMode: (mode: 'countUp' | 'countDown' | 'pomodoro') => void
  setTargetDuration: (duration: number) => void
  setIsRest: (isRest: boolean) => void
  setPomodoroCount: (count: number | ((prev: number) => number)) => void
  setFocusTheme: (theme: string) => void
  setLinkedTaskId: (id: string | null) => void
  addCompletedTask: (taskId: string) => void
  endSession: () => void  // 结束会话，清空所有状态
  resetTimer: () => void  // 只重置计时器，不结束会话
  setMiniBarVisible: (visible: boolean) => void
}

export const useFocusStore = create<FocusState>((set) => ({
  isRunning: false,
  elapsed: 0,
  mode: 'pomodoro',
  targetDuration: 25 * 60,
  isRest: false,
  pomodoroCount: 0,
  focusTheme: '无主题专注',
  linkedTaskId: null,
  completedTaskIds: [],
  isActive: false,
  miniBarVisible: true,

  startSession: (mode, targetDuration, theme, taskId) => set({
    isRunning: false,
    elapsed: 0,
    mode,
    targetDuration,
    focusTheme: theme,
    linkedTaskId: taskId,
    completedTaskIds: [],
    isRest: false,
    pomodoroCount: 0,
    isActive: true,
    miniBarVisible: true,
  }),

  setRunning: (running) => set({ isRunning: running }),
  setElapsed: (updater) => set((state) => ({
    elapsed: typeof updater === 'function' ? (updater as any)(state.elapsed) : updater
  })),
  setMode: (mode) => set({ mode }),
  setTargetDuration: (duration) => set({ targetDuration: duration }),
  setIsRest: (isRest) => set({ isRest }),
  setPomodoroCount: (count) => set((state) => ({
    pomodoroCount: typeof count === 'function' ? (count as any)(state.pomodoroCount) : count
  })),
  setFocusTheme: (theme) => set({ focusTheme: theme }),
  setLinkedTaskId: (id) => set({ linkedTaskId: id }),
  addCompletedTask: (taskId) => set((state) => ({
    completedTaskIds: [...state.completedTaskIds, taskId]
  })),

  endSession: () => set({
    isRunning: false,
    elapsed: 0,
    mode: 'pomodoro',
    targetDuration: 25 * 60,
    isRest: false,
    pomodoroCount: 0,
    focusTheme: '无主题专注',
    linkedTaskId: null,
    completedTaskIds: [],
    isActive: false,
  }),

  resetTimer: () => set({ isRunning: false, elapsed: 0 }),

  setMiniBarVisible: (visible) => set({ miniBarVisible: visible }),
}))
