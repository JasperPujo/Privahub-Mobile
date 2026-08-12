/**
 * 一次性数据迁移：将旧版非标准 ID 转换为标准 UUID
 * 在 App.tsx 启动时调用，仅执行一次
 */
import { generateUUID } from './utils'

const MIGRATION_KEY = 'privahub-id-migration-v3'

function isStandardUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function isOldFormatId(id: string): boolean {
  return id && typeof id === 'string' && !isStandardUUID(id)
}

/**
 * 迁移所有 localStorage 中的旧 ID 数据
 */
export function migrateOldIds() {
  if (localStorage.getItem(MIGRATION_KEY) === 'done') return

  console.log('[Migrate] Starting ID migration...')

  const idMap = new Map<string, string>()

  // 步骤1: 扫描所有 localStorage 收集旧 ID
  const scanStores = [
    { key: 'private-workbench-todo', arrayKey: 'tasks', fkFields: [] as string[] },
    { key: 'private-workbench-schedule', arrayKey: 'schedules', fkFields: ['plan_id'] },
    { key: 'private-workbench-plan', arrayKey: 'plans', fkFields: [] as string[] },
    { key: 'private-workbench-habit', arrayKey: 'habits', fkFields: [] as string[] },
    { key: 'private-workbench-note', arrayKey: 'walls', fkFields: [] as string[] },
    { key: 'private-workbench-note', arrayKey: 'notes', fkFields: ['wall_id'] },
    { key: 'private-workbench-tracker', arrayKey: 'categories', fkFields: [] as string[] },
    { key: 'private-workbench-tracker', arrayKey: 'entries', fkFields: ['category_id'] },
  ]

  for (const s of scanStores) {
    const raw = localStorage.getItem(s.key)
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      const items = data.state?.[s.arrayKey] || []
      for (const item of items) {
        if (item?.id && isOldFormatId(item.id) && !idMap.has(item.id)) {
          idMap.set(item.id, generateUUID())
        }
        if (item?.user_id && isOldFormatId(item.user_id) && !idMap.has(item.user_id)) {
          idMap.set(item.user_id, generateUUID())
        }
        for (const fk of s.fkFields) {
          if (item?.[fk] && isOldFormatId(item[fk]) && !idMap.has(item[fk])) {
            idMap.set(item[fk], generateUUID())
          }
        }
        // notes 中的 comments
        if (s.arrayKey === 'notes' && item?.comments) {
          for (const c of item.comments) {
            if (c?.id && isOldFormatId(c.id) && !idMap.has(c.id)) {
              idMap.set(c.id, generateUUID())
            }
          }
        }
        // habits 中的 checkins
        if (s.arrayKey === 'habits' && item?.checkins) {
          for (const c of item.checkins) {
            if (c?.id && isOldFormatId(c.id) && !idMap.has(c.id)) {
              idMap.set(c.id, generateUUID())
            }
          }
        }
        // tasks 中的 subtasks
        if (s.arrayKey === 'tasks' && item?.subtasks) {
          for (const st of item.subtasks) {
            if (st?.id && isOldFormatId(st.id) && !idMap.has(st.id)) {
              idMap.set(st.id, generateUUID())
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  // focus_sessions
  try {
    const focusRaw = localStorage.getItem('focus_sessions')
    if (focusRaw) {
      const sessions = JSON.parse(focusRaw)
      for (const s of sessions) {
        if (s?.id && isOldFormatId(s.id) && !idMap.has(s.id)) {
          idMap.set(s.id, generateUUID())
        }
      }
    }
  } catch { /* ignore */ }

  if (idMap.size === 0) {
    console.log('[Migrate] No old IDs found, skipping.')
    localStorage.setItem(MIGRATION_KEY, 'done')
    return
  }

  console.log(`[Migrate] Found ${idMap.size} old IDs to migrate.`)

  // 步骤2: 替换所有 store 中的 ID
  const replaceStores = [
    { key: 'private-workbench-todo', arrayKey: 'tasks', fkFields: [] as string[], nested: [{ path: 'subtasks', key: 'id' }] },
    { key: 'private-workbench-schedule', arrayKey: 'schedules', fkFields: ['plan_id'] as string[], nested: [] },
    { key: 'private-workbench-plan', arrayKey: 'plans', fkFields: [] as string[], nested: [] },
    { key: 'private-workbench-habit', arrayKey: 'habits', fkFields: [] as string[], nested: [{ path: 'checkins', key: 'id' }] },
    { key: 'private-workbench-note', arrayKey: 'walls', fkFields: [] as string[], nested: [] },
    { key: 'private-workbench-note', arrayKey: 'notes', fkFields: ['wall_id'] as string[], nested: [{ path: 'comments', key: 'id' }] },
    { key: 'private-workbench-tracker', arrayKey: 'categories', fkFields: [] as string[], nested: [] },
    { key: 'private-workbench-tracker', arrayKey: 'entries', fkFields: ['category_id'] as string[], nested: [] },
  ]

  for (const s of replaceStores) {
    const raw = localStorage.getItem(s.key)
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      const items = data.state?.[s.arrayKey]
      if (!Array.isArray(items)) continue

      for (const item of items) {
        if (!item) continue
        if (item.id && idMap.has(item.id)) item.id = idMap.get(item.id)
        if (item.user_id && idMap.has(item.user_id)) item.user_id = idMap.get(item.user_id)
        for (const fk of s.fkFields) {
          if (item[fk] && idMap.has(item[fk])) item[fk] = idMap.get(item[fk])
        }
        for (const n of s.nested) {
          const arr = item[n.path]
          if (Array.isArray(arr)) {
            for (const el of arr) {
              if (el?.[n.key] && idMap.has(el[n.key])) el[n.key] = idMap.get(el[n.key])
            }
          }
        }
      }

      localStorage.setItem(s.key, JSON.stringify(data))
      console.log(`[Migrate] Migrated ${s.key}.${s.arrayKey}`)
    } catch (e) {
      console.error(`[Migrate] Failed ${s.key}.${s.arrayKey}:`, e)
    }
  }

  // 替换 focus_sessions
  try {
    const focusRaw = localStorage.getItem('focus_sessions')
    if (focusRaw) {
      const sessions = JSON.parse(focusRaw)
      for (const s of sessions) {
        if (s?.id && idMap.has(s.id)) s.id = idMap.get(s.id)
      }
      localStorage.setItem('focus_sessions', JSON.stringify(sessions))
      console.log('[Migrate] Migrated focus_sessions')
    }
  } catch { /* ignore */ }

  localStorage.setItem(MIGRATION_KEY, 'done')
  console.log('[Migrate] ID migration completed. Reloading page...')
  window.location.reload()
}
