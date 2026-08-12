import { useEffect, useCallback, useRef } from 'react'
import { useAppStore, useTodoStore, useScheduleStore, usePlanStore, useHabitStore, useNoteStore, useTrackerStore, useShiftStore } from '@/store'
import { fullSync, noteWallToDb, noteWallFromDb, taskToDb, taskFromDb, scheduleToDb, scheduleFromDb, planToDb, planFromDb, habitToDb, habitFromDb, noteToDb, noteFromDb, trackerCategoryToDb, trackerEntryToDb, shiftToDb, shiftFromDb } from '@/lib/sync'

export function useAutoSync() {
  const user = useAppStore((s) => s.user)
  const isLoggedIn = useAppStore((s) => s.isLoggedIn)
  const isSyncing = useAppStore((s) => s.isSyncing)
  const setLastSyncTime = useAppStore((s) => s.setLastSyncTime)
  const lastSyncTime = useAppStore((s) => s.lastSyncTime)

  const autoSyncRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownRef = useRef(false)
  const lastSyncTimeRef = useRef<string | null>(lastSyncTime)

  // 当 lastSyncTime 变化时同步到 ref（clearAllDataStores 后 lastSyncTime 变 null，需要重置）
  useEffect(() => {
    if (lastSyncTime === null && lastSyncTimeRef.current !== null) {
      lastSyncTimeRef.current = null
      console.log('[AutoSync] lastSyncTime reset to null, next sync will be full')
    }
  }, [lastSyncTime])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // setData 保护标志：fullSync 期间 setData 触发的 store 变更不应触发防抖同步
  const setDataGuardRef = useRef(false)

  const stores = {
    noteWalls: { table: 'note_walls', getData: () => useNoteStore.getState().walls, setData: (data: any) => { setDataGuardRef.current = true; useNoteStore.getState().setWalls(data); setDataGuardRef.current = false }, toDbRow: noteWallToDb, fromDbRow: noteWallFromDb },
    tasks: {
      table: 'tasks',
      getData: () => [...useTodoStore.getState().tasks, ...useTodoStore.getState().archivedTasks],
      setData: (data: any) => {
        setDataGuardRef.current = true
        const active = data.filter((t: any) => !t.is_archived)
        const archived = data.filter((t: any) => t.is_archived)
          .sort((a: any, b: any) => (b.archived_at || '').localeCompare(a.archived_at || ''))
        useTodoStore.getState().setTasks(active)
        useTodoStore.getState().setArchivedTasks(archived)
        setDataGuardRef.current = false
      },
      toDbRow: taskToDb,
      fromDbRow: taskFromDb,
    },
    schedules: { table: 'schedules', getData: () => useScheduleStore.getState().schedules, setData: (data: any) => { setDataGuardRef.current = true; useScheduleStore.getState().setSchedules(data); setDataGuardRef.current = false }, toDbRow: scheduleToDb, fromDbRow: scheduleFromDb },
    plans: { table: 'plans', getData: () => usePlanStore.getState().plans, setData: (data: any) => { setDataGuardRef.current = true; usePlanStore.getState().setPlans(data); setDataGuardRef.current = false }, toDbRow: planToDb, fromDbRow: planFromDb },
    habits: { table: 'habits', getData: () => useHabitStore.getState().habits, setData: (data: any) => { setDataGuardRef.current = true; useHabitStore.getState().setHabits(data); setDataGuardRef.current = false }, toDbRow: habitToDb, fromDbRow: habitFromDb },
    notes: { table: 'notes', getData: () => useNoteStore.getState().notes, setData: (data: any) => { setDataGuardRef.current = true; useNoteStore.getState().setNotes(data); setDataGuardRef.current = false }, toDbRow: noteToDb, fromDbRow: noteFromDb },
    trackerCategories: { table: 'tracker_categories', getData: () => useTrackerStore.getState().categories, setData: (data: any) => { setDataGuardRef.current = true; useTrackerStore.getState().setCategories(data); setDataGuardRef.current = false }, toDbRow: trackerCategoryToDb, fromDbRow: trackerCategoryToDb },
    trackerEntries: { table: 'tracker_entries', getData: () => useTrackerStore.getState().entries, setData: (data: any) => { setDataGuardRef.current = true; useTrackerStore.getState().setEntries(data); setDataGuardRef.current = false }, toDbRow: trackerEntryToDb, fromDbRow: trackerEntryToDb },
    shifts: { table: 'shifts', getData: () => useShiftStore.getState().shifts, setData: (data: any) => { setDataGuardRef.current = true; useShiftStore.getState().setShifts(data); setDataGuardRef.current = false }, toDbRow: shiftToDb, fromDbRow: shiftFromDb },
  }

  const silentSync = useCallback(async () => {
    if (!user || isSyncing) return
    const since = lastSyncTimeRef.current
    try {
      // 减去 60 秒作为 since，补偿服务器与客户端的时钟偏差
      // 防止服务器时钟比客户端快导致漏拉记录
      const syncTime = new Date(Date.now() - 60000).toISOString()
      await fullSync(user.id, stores, { since, parallel: true })
      lastSyncTimeRef.current = syncTime
      setLastSyncTime(syncTime)
      // 进入冷却期：15 秒内忽略 store 变更触发的防抖（避免 setData 回写循环）
      cooldownRef.current = true
      setTimeout(() => { cooldownRef.current = false }, 15000)
      console.log('[AutoSync] Sync completed at', syncTime)
    } catch (err: any) {
      console.error('[AutoSync] Sync failed:', err)
    }
  }, [user, isSyncing, setLastSyncTime])

  // 防抖即时同步：store 变更 5 秒后自动触发增量同步
  // 同步刚完成时会因 setData 回写再次触发，用冷却机制避免
  const scheduleDebouncedSync = useCallback(() => {
    // 同步期间、冷却期间、或 setData 保护期间不设置新的定时器
    if (!user || cooldownRef.current || isSyncing || setDataGuardRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      silentSync()
    }, 3000)
  }, [user, silentSync, isSyncing])

  useEffect(() => {
    if (!user || !isLoggedIn) return

    // 监听各 store 数据变化，触发防抖同步
    const unsubTasks = useTodoStore.subscribe(() => scheduleDebouncedSync())
    const unsubSchedules = useScheduleStore.subscribe(() => scheduleDebouncedSync())
    const unsubPlans = usePlanStore.subscribe(() => scheduleDebouncedSync())
    const unsubHabits = useHabitStore.subscribe(() => scheduleDebouncedSync())
    const unsubNotes = useNoteStore.subscribe(() => scheduleDebouncedSync())
    const unsubTracker = useTrackerStore.subscribe(() => scheduleDebouncedSync())
    const unsubShifts = useShiftStore.subscribe(() => scheduleDebouncedSync())

    return () => {
      unsubTasks()
      unsubSchedules()
      unsubPlans()
      unsubHabits()
      unsubNotes()
      unsubTracker()
      unsubShifts()
    }
  }, [user, isLoggedIn, scheduleDebouncedSync])

  // 定时同步：登录后 5 秒首次同步，之后每 5 分钟同步
  useEffect(() => {
    if (user && isLoggedIn) {
      const timer = setTimeout(() => { silentSync() }, 5000)
      autoSyncRef.current = setInterval(silentSync, 5 * 60 * 1000)
      return () => {
        clearTimeout(timer)
        if (autoSyncRef.current) clearInterval(autoSyncRef.current)
      }
    }
  }, [user, isLoggedIn, silentSync])

  return { silentSync, lastSyncTimeRef }
}