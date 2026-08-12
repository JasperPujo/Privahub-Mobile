import { supabase } from './supabase'
import { useAppStore } from '@/store'
import type { Shift } from '@/types'

// 通用同步工具：将本地数据同步到 Supabase

interface SyncOptions {
  table: string
  userId: string
  data: any[]
  idField?: string
  /** 推送前转换本地数据为数据库字段格式 */
  toDbRow?: (item: any) => any
  /** 拉取后转换数据库行为本地格式 */
  fromDbRow?: (row: any) => any
}

/**
 * 将 reminder_time 规范化为 string[] 或 null
 * 处理多种格式：JSON 字符串、数组、单值字符串、null
 * 返回 null 表示无提醒时间
 */
function normalizeReminderTime(raw: any): string[] | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (Array.isArray(raw)) {
    const filtered = raw.filter(t => typeof t === 'string' && t)
    return filtered.length > 0 ? filtered : null
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((t: any) => typeof t === 'string' && t)
        return filtered.length > 0 ? filtered : null
      }
      // 不是 JSON 数组，当作单值
      return [raw]
    } catch {
      // 不是 JSON，当作单值
      return [raw]
    }
  }
  return null
}

/**
 * 将 reminder_time 规范化为数据库存储格式（JSON 字符串或 null）
 * 用于 toDbRow 函数，确保推送到数据库的始终是字符串
 */
function normalizeReminderTimeForDb(raw: any): string | null {
  const arr = normalizeReminderTime(raw)
  return arr ? JSON.stringify(arr) : null
}

/**
 * 合并两条记录：以 updated_at 较新的记录为基础，对数组字段做并集合并
 *
 * 关键问题：Supabase 有 BEFORE UPDATE 触发器会把 updated_at 设为服务器 now()，
 * 服务器时钟可能比客户端快几秒，导致远程 updated_at > 本地 updated_at。
 *
 * 修复策略：
 * 1. 增加 30 秒宽容期：本地时间即使略旧，只要在 30 秒以内，仍视为本地胜出
 *    （服务器 NTP 漂移 + 网络延迟可能达到 10+ 秒，5 秒不够）
 * 2. 状态字段单向保护：is_completed/is_archived/is_pinned 一旦本地为 true，不被远程 false 覆盖
 * 3. 对数组字段（checkins, subtasks, comments, tags）：做并集合并
 * 4. sort_order 特殊处理：默认值 999 不覆盖有效值
 */
function mergeRecords(local: any, remote: any): any {
  if (!local) return remote
  if (!remote) return local
  // 删除状态优先：任意一方已删除，保留已删除状态（防止已删除记录被复活）
  if (local.deleted_at || remote.deleted_at) {
    return local.deleted_at ? local : remote
  }

  const localTime = local.updated_at || local.created_at || '1970-01-01'
  const remoteTime = remote.updated_at || remote.created_at || '1970-01-01'

  // 宽容期：30 秒内本地优先（防止服务器时钟偏差导致远程覆盖刚做的本地操作）
  // 之前 5 秒不够，服务器 NTP 漂移 + 网络延迟可能达到 10+ 秒
  const localMs = new Date(localTime).getTime()
  const remoteMs = new Date(remoteTime).getTime()
  const diffMs = Math.abs(localMs - remoteMs)
  const localWins = diffMs <= 30000 ? true : localTime >= remoteTime

  const winner = localWins ? local : remote
  const loser = localWins ? remote : local
  const merged = { ...winner }

  // ---- 状态字段双向保护（基于状态变更时间戳） ----
  // 核心原则：状态字段（is_completed/is_archived/is_pinned）的变化时间比 updated_at 更可靠
  // 因为 updated_at 会被 Supabase 触发器覆盖为服务器时间，无法准确反映客户端操作时间
  //
  // 双向保护逻辑：
  // - 如果双方状态不一致（一方 true 一方 false）
  // - 比较 true 方的状态变更时间（completed_at/archived_at）与 false 方的 updated_at
  // - true 方时间 >= false 方时间 → 保持 true（状态变更发生在之后或同时）
  // - true 方时间 < false 方时间 → 保持 false（用户主动撤销了状态）
  //
  // 这解决了以下场景：
  // 1. 本地完成 → 推送到远程 → 重新登录 → 远程有 is_completed=true
  //    但本地因 30s 宽容期胜出且有旧的 is_completed=false → 错误地推送 false 到远程
  // 2. 本地归档 → 推送到远程 → 重新登录 → 远程有 is_archived=true
  //    但本地因 30s 宽容期胜出且有旧的 is_archived=false → 错误地推送 false 到远程

  // is_completed
  if (local.is_completed !== remote.is_completed) {
    const trueSide = local.is_completed ? local : remote
    const falseSide = local.is_completed ? remote : local
    const trueStateTime = trueSide.completed_at || trueSide.updated_at || ''
    const falseStateTime = falseSide.updated_at || ''
    if (trueStateTime >= falseStateTime) {
      merged.is_completed = true
      merged.completed_at = trueSide.completed_at || merged.completed_at
    } else {
      merged.is_completed = false
      merged.completed_at = null
    }
  }

  // is_archived
  if (local.is_archived !== remote.is_archived) {
    const trueSide = local.is_archived ? local : remote
    const falseSide = local.is_archived ? remote : local
    const trueStateTime = trueSide.archived_at || trueSide.updated_at || ''
    const falseStateTime = falseSide.updated_at || ''
    if (trueStateTime >= falseStateTime) {
      merged.is_archived = true
      merged.archived_at = trueSide.archived_at || merged.archived_at
    } else {
      merged.is_archived = false
      merged.archived_at = null
    }
  }

  // is_pinned
  if (local.is_pinned !== remote.is_pinned) {
    const trueSide = local.is_pinned ? local : remote
    const falseSide = local.is_pinned ? remote : local
    const trueStateTime = trueSide.updated_at || ''
    const falseStateTime = falseSide.updated_at || ''
    if (trueStateTime >= falseStateTime) {
      merged.is_pinned = true
    } else {
      merged.is_pinned = false
    }
  }

  // ---- 字段级合并：数组字段取并集 ----

  // checkins: winner 的打卡记录为权威集合（不支持并集合并）
  // 原因：并集合并会导致已删除的打卡记录从 loser 复活
  // winner 是 updated_at 更新的一方，uncheckin() 会更新 updated_at
  // 所以 winner 的 checkins 数组就是最终结果
  if (Array.isArray(local.checkins) && Array.isArray(remote.checkins)) {
    merged.checkins = (winner.checkins || []).slice().sort((a: any, b: any) =>
      (a.date || '').localeCompare(b.date || '')
    )
  }

  // subtasks: 按 id 去重，winner 优先
  if (Array.isArray(local.subtasks) && Array.isArray(remote.subtasks)) {
    const subtaskMap = new Map<string, any>()
    for (const s of loser.subtasks) {
      if (s && s.id) subtaskMap.set(s.id, s)
    }
    for (const s of winner.subtasks) {
      if (s && s.id) subtaskMap.set(s.id, s)
    }
    merged.subtasks = Array.from(subtaskMap.values())
  }

  // comments: 按 id 去重，winner 优先
  if (Array.isArray(local.comments) && Array.isArray(remote.comments)) {
    const commentMap = new Map<string, any>()
    for (const c of loser.comments) {
      if (c && c.id) commentMap.set(c.id, c)
    }
    for (const c of winner.comments) {
      if (c && c.id) commentMap.set(c.id, c)
    }
    merged.comments = Array.from(commentMap.values())
  }

  // tags: 取并集
  if (Array.isArray(local.tags) && Array.isArray(remote.tags)) {
    const tagSet = new Set<string>()
    for (const t of loser.tags) tagSet.add(String(t))
    for (const t of winner.tags) tagSet.add(String(t))
    merged.tags = Array.from(tagSet)
  }

  // sort_order 特殊处理：如果 winner 的 sort_order 是默认值(999)而 loser 有有效值，保留 loser 的
  // 这防止数据库缺少 sort_order 列时远程返回默认值覆盖本地排序
  if (winner.sort_order === 999 || winner.sort_order === undefined || winner.sort_order === null) {
    if (loser.sort_order !== undefined && loser.sort_order !== null && loser.sort_order !== 999) {
      merged.sort_order = loser.sort_order
    }
  }

  // ---- reminder_time：winner-takes-all + 一致性检查 ----
  // 之前的交集策略有两个致命缺陷：
  // 1. 用户新增提醒时，如果远程还是 null（push 未完成或列缺失），交集结果为 null → 新增的提醒被清除
  // 2. 交集策略无法处理"一端新增、另一端删除"的并发场景
  //
  // 正确策略：reminder_time 跟随 winner（updated_at 更新的一方）
  // - 新增提醒：本地 updated_at 更新 → 本地胜出 → reminder_time 保留 ✓
  // - 删除提醒：本地 updated_at 更新 → 本地胜出 → reminder_time = null ✓
  // - 防止删除复活：依赖 push 阶段的条件更新（只推 updated_at >= 远程的记录）
  //
  // 一致性检查：确保 reminder_enabled 与 reminder_time 状态一致
  const mergedRt = normalizeReminderTime(merged.reminder_time)
  if (mergedRt === null || mergedRt.length === 0) {
    merged.reminder_time = null
    merged.reminder_enabled = false
  } else {
    merged.reminder_time = JSON.stringify(mergedRt)
    if (merged.reminder_enabled === undefined || merged.reminder_enabled === null) {
      merged.reminder_enabled = true
    }
  }

  // updated_at 取两者中较新的，避免被服务器触发器干扰
  merged.updated_at = localTime >= remoteTime ? localTime : remoteTime

  return merged
}

/**
 * 从错误消息中提取缺失的列名
 * 支持两种错误格式：
 * - Postgres: column "xxx" of relation "yyy" does not exist
 * - PostgREST: Could not find the 'xxx' column of 'yyy' in the schema cache
 */
function extractMissingColumn(errorMessage: string): string | null {
  // Postgres 格式: column "xxx" of relation "yyy" does not exist
  let match = errorMessage.match(/column "(\w+)" of relation "\w+" does not exist/)
  if (match) return match[1]
  // PostgREST 格式: Could not find the 'xxx' column of 'yyy' in the schema cache
  match = errorMessage.match(/Could not find the '(\w+)' column/)
  if (match) return match[1]
  return null
}

/**
 * 全量推送：将本地数据推送到 Supabase（更新或插入）
 * 支持列缺失自动重试：当检测到 "column does not exist" 错误时，
 * 自动移除缺失列并重试 upsert（最多重试 2 次）
 */
export async function syncPush({ table, userId, data, idField = 'id', toDbRow }: SyncOptions) {
  if (!userId || data.length === 0) return { success: true, count: 0 }

  // 转换并给每条数据加上 user_id（过滤掉已删除记录，硬删除由 fullSync 统一处理）
  let rows = data
    .filter(item => item && item.id && !item.deleted_at)
    .map(item => ({
      ...(toDbRow ? toDbRow(item) : item),
      user_id: userId,
    })) as any[]

  if (rows.length === 0) return { success: true, count: 0 }

  // 确保每条数据的 user_id 是有效 UUID
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  rows = rows.map(row => ({
    ...row,
    user_id: UUID_REGEX.test(row.user_id) ? row.user_id : userId,
  }))

  // 批量 upsert：每批 500 条，避免大批量请求超时
  const BATCH_SIZE = 500

  // 最多重试 6 次（每次移除一个缺失列，足够处理所有 reminder_* 列）
  const maxRetries = 6
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let error: any = null
      let status = 200
      let statusText = 'OK'
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const res = await supabase.from(table).upsert(batch, { onConflict: idField })
        status = res.status
        statusText = res.statusText
        if (res.error) { error = res.error; break }
      }

      if (error) {
        const errMsg = error.message || ''
        const errCode = error.code || ''

        // 检测 "column does not exist" 错误（Postgres 42703 或 PostgREST PGRST204）
        if (
          (errMsg.includes('does not exist') && errMsg.includes('column')) ||
          errCode === '42703' ||
          errCode === 'PGRST204' ||
          (errMsg.includes("Could not find the") && errMsg.includes('column'))
        ) {
          const missingCol = extractMissingColumn(errMsg)
          if (missingCol && attempt < maxRetries) {
            console.warn(
              `[Sync] Table "${table}" missing column "${missingCol}", removing it and retrying (attempt ${attempt + 1}/${maxRetries})`
            )
            rows = rows.map(row => {
              const cleaned = { ...row }
              delete cleaned[missingCol]
              return cleaned
            })
            continue
          }
        }

        console.error(
          `[Sync] Push to table "${table}" failed:`,
          `\n  HTTP status: ${status} ${statusText}`,
          `\n  Error code: ${error.code}`,
          `\n  Error message: ${error.message}`,
          `\n  Error details: ${error.details || 'N/A'}`,
          `\n  Error hint: ${error.hint || 'N/A'}`,
          `\n  Row count attempted: ${rows.length}`,
        )
        return { success: false, error, table }
      }

      return { success: true, count: rows.length }
    } catch (err: any) {
      const errMsg = err.message || String(err)

      if (
        (errMsg.includes('does not exist') && errMsg.includes('column')) ||
        errMsg.includes("Could not find the") ||
        errMsg.includes('PGRST204')
      ) {
        const missingCol = extractMissingColumn(errMsg)
        if (missingCol && attempt < maxRetries) {
          console.warn(
            `[Sync] Table "${table}" missing column "${missingCol}" (exception), removing and retrying (attempt ${attempt + 1}/${maxRetries})`
          )
          rows = rows.map(row => {
            const cleaned = { ...row }
            delete cleaned[missingCol]
            return cleaned
          })
          continue
        }
      }

      console.error(
        `[Sync] Push to table "${table}" threw exception:`,
        `\n  Error: ${errMsg}`,
        `\n  Row count attempted: ${rows.length}`,
      )
      return { success: false, error: { message: errMsg, code: 'EXCEPTION' }, table }
    }
  }

  return { success: false, error: { message: 'Max retries exceeded for missing columns', code: 'MAX_RETRIES' }, table }
}


/**
 * 拉取：从 Supabase 拉取用户数据，支持增量（since 参数）
 */
export async function syncPull(table: string, userId: string, fromDbRow?: (row: any) => any, since?: string | null) {
  if (!userId) return { success: false, data: [] }

  try {
    let query = supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)

    // 增量：只拉取 updated_at 大于 since 的记录
    if (since) {
      query = query.gt('updated_at', since)
    }

    // 按更新时间倒序，优先获取最新数据；限制单次拉取量防止超时
    query = query.order('updated_at', { ascending: false }).limit(since ? 1000 : 3000)

    const { data, error, status, statusText } = await query

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        console.warn(`[Sync] Table "${table}" does not exist yet, skipping`)
        return { success: true, data: [] }
      }
      console.error(
        `[Sync] Pull from table "${table}" failed:`,
        `\n  HTTP status: ${status} ${statusText}`,
        `\n  Error code: ${error.code}`,
        `\n  Error message: ${error.message}`,
        `\n  Error details: ${error.details || 'N/A'}`,
        `\n  Error hint: ${error.hint || 'N/A'}`,
      )
      return { success: false, error, data: [], table }
    }

    const parsed = (data || []).map((row: any) => {
      const item = fromDbRow ? fromDbRow(row) : { ...row }
      // 通用 JSON 字段还原
      try {
        if (item.subtasks && typeof item.subtasks === 'string') item.subtasks = JSON.parse(item.subtasks)
      } catch { item.subtasks = [] }
      try {
        if (item.checkins && typeof item.checkins === 'string') item.checkins = JSON.parse(item.checkins)
      } catch { item.checkins = [] }
      try {
        if (item.comments && typeof item.comments === 'string') item.comments = JSON.parse(item.comments)
      } catch { item.comments = [] }
      // reminder_time 规范化：数据库可能返回数组（jsonb 列），统一转为 JSON 字符串
      if (item.reminder_time !== null && item.reminder_time !== undefined) {
        if (Array.isArray(item.reminder_time)) {
          item.reminder_time = item.reminder_time.length > 0 ? JSON.stringify(item.reminder_time) : null
        }
      }
      return item
    })

    return { success: true, data: parsed }
  } catch (err: any) {
    console.error(
      `[Sync] Pull from table "${table}" threw exception:`,
      `\n  Error: ${err.message || err}`,
    )
    return { success: false, error: { message: err.message || String(err), code: 'EXCEPTION' }, data: [], table }
  }
}


/**
 * 单条记录即时同步（创建/更新）
 * 在本地 store 变更后立即调用，将单条数据 upsert 到云端
 */
export async function syncUpsert(table: string, userId: string, data: any, toDbRow?: (item: any) => any) {
  if (!userId || !data?.id) return { success: false, error: { message: 'Missing userId or id', code: 'INVALID' } }
  try {
    let row = {
      ...(toDbRow ? toDbRow(data) : data),
      user_id: userId,
    }
    // 确保 user_id 是有效 UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_REGEX.test(row.user_id)) row.user_id = userId

    // 缺失列自动重试（与 syncPush 相同逻辑）
    const maxRetries = 6
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' })
      if (!error) return { success: true }

      const errMsg = error.message || ''
      const errCode = error.code || ''
      if (
        (errMsg.includes('does not exist') && errMsg.includes('column')) ||
        errCode === '42703' ||
        errCode === 'PGRST204' ||
        (errMsg.includes("Could not find the") && errMsg.includes('column'))
      ) {
        const missingCol = extractMissingColumn(errMsg)
        if (missingCol && attempt < maxRetries) {
          console.warn(`[Sync] Upsert "${table}" missing column "${missingCol}", retrying (${attempt + 1}/${maxRetries})`)
          delete row[missingCol]
          continue
        }
      }

      console.error(`[Sync] Upsert to table "${table}" failed: id=${data.id}`, `\n  Error code: ${error.code}`, `\n  Error message: ${error.message}`)
      return { success: false, error }
    }
    return { success: false, error: { message: 'Max retries exceeded', code: 'MAX_RETRIES' } }
  } catch (err: any) {
    console.error(`[Sync] Upsert to table "${table}" threw exception: id=${data.id}`, `\n  Error: ${err.message || err}`)
    return { success: false, error: { message: err.message || String(err), code: 'EXCEPTION' } }
  }
}

/**
 * 单条删除同步
 */
export async function syncDelete(table: string, id: string, userId: string) {
  try {
    const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId)
    if (error) {
      console.error(
        `[Sync] Delete from table "${table}" failed: id=${id}`,
        `\n  Error code: ${error.code}`,
        `\n  Error message: ${error.message}`,
        `\n  Error details: ${error.details || 'N/A'}`,
      )
      return { success: false, error }
    }
    return { success: true }
  } catch (err: any) {
    console.error(
      `[Sync] Delete from table "${table}" threw exception: id=${id}`,
      `\n  Error: ${err.message || err}`,
    )
    return { success: false, error: { message: err.message || String(err), code: 'EXCEPTION' } }
  }
}

/** 快速获取数据数组中的最大 updated_at（用于变化检测，替代 JSON.stringify） */
function getMaxUpdatedAt(data: any[]): string {
  let max = ''
  for (let i = 0; i < data.length; i++) {
    const t = data[i]?.updated_at || data[i]?.created_at || ''
    if (t > max) max = t
  }
  return max
}

/**
 * 快速比较两个数据数组是否有变化（长度 + 最大 updated_at）
 * 比 JSON.stringify 快几个数量级，适用于大数据集的变化检测
 */
function fastDataChanged(oldData: any[], newData: any[]): boolean {
  if (oldData.length !== newData.length) return true
  return getMaxUpdatedAt(oldData) !== getMaxUpdatedAt(newData)
}

/**
 * 同步：支持增量和并行
 * @param since 如果提供，只拉取/推送 updated_at > since 的数据（增量模式）
 * @param parallel 是否并行同步（默认 true）
 */
export async function fullSync(userId: string, stores: Record<string, {
  table: string
  getData: () => any[]
  setData: (data: any[]) => void
  toDbRow?: (item: any) => any
  fromDbRow?: (row: any) => any
}>, options?: { since?: string | null; parallel?: boolean }) {
  // 同步锁：使用 appStore 统一管理，防止并发同步
  const appStore = useAppStore.getState()
  if (appStore.isSyncing) {
    console.log('[Sync] Another sync is in progress, skipping')
    return {}
  }
  appStore.setSyncing(true)

  const since = options?.since || null
  const useParallel = options?.parallel !== false

  // 如果所有本地 store 都为空，说明是新设备/首次同步，强制全量拉取
  const allStores = Object.values(stores)
  const hasAnyLocalData = allStores.some(s => s.getData().length > 0)
  const effectiveSince = hasAnyLocalData ? since : null
  if (!hasAnyLocalData && since) {
    console.log('[Sync] No local data detected, forcing full sync (ignoring since)')
  }
  const results: Record<string, any> = {}

  const syncOne = async ([key, store]: [string, any]) => {
    const { table, getData, setData, toDbRow, fromDbRow } = store
    try {
      const t0 = performance.now()

      // 1. 获取本地数据快照
      const localSnapshot = getData()

      // 2. 先拉取远程数据（pull-merge-push 策略）
      //    之前使用 push-then-pull 策略，但 push 会盲目覆盖远程数据，
      //    导致设备 B 的旧数据覆盖设备 A 的新数据（Supabase 触发器还会把 updated_at 设为 now()，让旧数据看起来像新的）
      //    改为 pull-merge-push：先拉取远程数据，合并后再推送，推送时跳过远程已更新的记录
      const pullResult = await syncPull(table, userId, fromDbRow, effectiveSince)
      const remoteData = pullResult.success ? pullResult.data : []

      // 构建远程 updated_at 映射，用于条件推送（跳过远程已更新的记录）
      const remoteUpdatedAtMap = new Map<string, string>()
      for (const item of remoteData as any[]) {
        if (item?.id) {
          remoteUpdatedAtMap.set(item.id, item.updated_at || item.created_at || '')
        }
      }

      // 3. 获取最新本地数据（可能在 await 期间被用户修改）
      const latestLocal = getData()

      // 4. 合并远程数据到本地（winner-takes-all based on updated_at）
      let mergedData = latestLocal
      let needSetData = false
      if (remoteData.length > 0) {
        const localMap = new Map(latestLocal.map((item: any) => [item.id, item]))
        for (const item of remoteData as any[]) {
          if (!item?.id) continue
          const existing: any = localMap.get(item.id)
          // 如果本地已删除，强制保留删除状态
          if (existing?.deleted_at && !item.deleted_at) {
            item.deleted_at = existing.deleted_at
          }
          const merged = mergeRecords(existing, item)
          localMap.set(item.id, merged)
        }
        mergedData = Array.from(localMap.values())
        // 快速检测变化：比较长度和最大 updated_at（替代昂贵的 JSON.stringify）
        needSetData = fastDataChanged(mergedData, latestLocal)
      }

      // 5. 只在数据有变化时才 setData，减少不必要的 store 触发
      if (needSetData) {
        setData(mergedData)
      }

      // 6. 条件推送：只推送本地比远程新（或远程不存在）的记录
      //    这防止旧本地数据覆盖新远程数据（解决删除提醒后同步又复活的问题）
      let dataToPush = mergedData.filter((item: any) => {
        if (!item || !item.id || item.deleted_at) return false
        // 增量过滤：只推送 updated_at > since 的记录
        if (effectiveSince) {
          const t = item.updated_at || item.created_at || ''
          if (t <= effectiveSince) return false
        }
        // 条件推送：如果远程有更新的记录，跳过推送
        const remoteTime = remoteUpdatedAtMap.get(item.id)
        if (remoteTime) {
          const localTime = item.updated_at || item.created_at || ''
          // 本地比远程旧超过 5 秒 → 远程是新的，跳过推送
          if (localTime < remoteTime) {
            const diff = new Date(remoteTime).getTime() - new Date(localTime).getTime()
            if (diff > 5000) return false
          }
        }

        // ---- 状态回归保护 ----
        // 如果远程已完成/已归档，但合并后变成了未完成/未归档，且远程状态变更时间更近
        // 则跳过推送，防止错误地覆盖远程的正确状态
        if (remoteData.length > 0) {
          const remoteItem = (remoteData as any[]).find((r: any) => r.id === item.id)
          if (remoteItem) {
            // 完成状态回归保护
            if (remoteItem.is_completed === true && item.is_completed === false) {
              const remoteCompletedTime = remoteItem.completed_at || remoteItem.updated_at || ''
              const localUpdatedTime = item.updated_at || ''
              if (remoteCompletedTime >= localUpdatedTime) {
                console.warn('[Sync] Skipping push for', item.id, '- would regress is_completed true->false')
                return false
              }
            }
            // 归档状态回归保护
            if (remoteItem.is_archived === true && item.is_archived === false) {
              const remoteArchivedTime = remoteItem.archived_at || remoteItem.updated_at || ''
              const localUpdatedTime = item.updated_at || ''
              if (remoteArchivedTime >= localUpdatedTime) {
                console.warn('[Sync] Skipping push for', item.id, '- would regress is_archived true->false')
                return false
              }
            }
          }
        }

        return true
      })

      let pushResult: any = { success: true, count: 0 }
      if (dataToPush.length > 0) {
        pushResult = await syncPush({ table, userId, data: dataToPush, toDbRow })
      }

      // 7. 硬删除云端已删除的记录
      const deletedIds = mergedData.filter((item: any) => item.deleted_at).map((item: any) => item.id)
      if (deletedIds.length > 0) {
        try {
          const { error: delError } = await supabase
            .from(table)
            .delete()
            .in('id', deletedIds)
            .eq('user_id', userId)
          if (delError) {
            console.warn(`[Sync] Hard delete ${deletedIds.length} from "${table}" failed:`, delError.message)
          }
        } catch (e: any) {
          console.warn(`[Sync] Hard delete from "${table}" exception:`, e.message)
        }
      }

      const elapsed = performance.now() - t0
      if (elapsed > 500) {
        console.log(`[Sync] "${table}" took ${elapsed.toFixed(0)}ms (push:${dataToPush.length} pull:${remoteData.length})`)
      }

      results[key] = { pull: pullResult, push: pushResult, mergedCount: dataToPush.length, table }
    } catch (err: any) {
      console.error(`[Sync] Error syncing table "${table}":`, err)
      results[key] = { pull: { success: false }, push: { success: false }, error: err, table }
    }
  }

  try {
    if (useParallel) {
      // 并行同步所有表
      await Promise.all(Object.entries(stores).map(syncOne))
    } else {
      // 串行同步
      for (const entry of Object.entries(stores)) {
        await syncOne(entry)
      }
    }
  } finally {
    appStore.setSyncing(false)
  }

  return results
}

// ===== 各表的字段映射函数 =====

/** Task: 本地 -> 数据库 */
export const taskToDb = (item: any) => ({
  id: item.id,
  title: item.title,
  content: item.content || item.description || '',
  description: item.content || item.description || '',
  priority: item.priority || 'medium',
  tags: Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? JSON.parse(item.tags || '[]') : []),
  subtasks: item.subtasks ? (typeof item.subtasks === 'string' ? item.subtasks : JSON.stringify(item.subtasks)) : '[]',
  due_date: item.due_date || null,
  is_scheduled: item.is_scheduled || false,
  scheduled_for: item.scheduled_for || null,
  is_completed: !!item.is_completed,
  completed_at: item.completed_at || null,
  is_archived: !!item.is_archived,
  archived_at: item.archived_at || null,
  deleted_at: item.deleted_at || null,
  reward_poin: typeof item.reward_poin === 'number' ? item.reward_poin : 0,
  reminder_enabled: item.reminder_enabled ?? false,
  reminder_mode: item.reminder_mode || 'custom',
  reminder_time: normalizeReminderTimeForDb(item.reminder_time),
  reminder_minutes: item.reminder_minutes ?? 15,
  reminder_triggered: item.reminder_triggered ?? false,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** Task: 数据库 -> 本地 */
export const taskFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  title: row.title || '',
  content: row.content || row.description || '',
  description: row.description || row.content || '',
  priority: row.priority || 'medium',
  tags: Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : []),
  subtasks: Array.isArray(row.subtasks) ? row.subtasks : (typeof row.subtasks === 'string' ? JSON.parse(row.subtasks || '[]') : []),
  due_date: row.due_date || null,
  is_scheduled: !!row.is_scheduled,
  scheduled_for: row.scheduled_for || null,
  is_completed: !!row.is_completed,
  completed_at: row.completed_at || null,
  is_archived: !!row.is_archived,
  archived_at: row.archived_at || null,
  deleted_at: row.deleted_at || null,
  reward_poin: typeof row.reward_poin === 'number' ? row.reward_poin : 0,
  reminder_enabled: row.reminder_enabled ?? false,
  reminder_mode: row.reminder_mode || 'custom',
  reminder_time: row.reminder_time || null,
  reminder_minutes: row.reminder_minutes ?? 15,
  reminder_triggered: row.reminder_triggered ?? false,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})

/** Schedule: 本地 -> 数据库 */
export const scheduleToDb = (item: any) => ({
  id: item.id,
  title: item.title,
  content: item.content || '',
  start_time: item.start_time,
  end_time: item.end_time,
  is_all_day: !!item.is_all_day,
  repeat_rule: item.repeat_rule ? (typeof item.repeat_rule === 'string' ? item.repeat_rule : JSON.stringify(item.repeat_rule)) : null,
  is_reminder: !!item.is_reminder,
  reminder_type: item.reminder_type || null,
  reminder_mode: item.reminder_mode || 'custom',
  reminder_time: normalizeReminderTimeForDb(item.reminder_time),
  reminder_minutes: item.reminder_minutes ?? 15,
  reminder_triggered: item.reminder_triggered ?? false,
  plan_id: item.plan_id || null,
  type: item.type || 'schedule',
  tags: Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? JSON.parse(item.tags || '[]') : []),
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** Schedule: 数据库 -> 本地 */
export const scheduleFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  title: row.title || '',
  content: row.content || '',
  start_time: row.start_time,
  end_time: row.end_time,
  is_all_day: !!row.is_all_day,
  repeat_rule: row.repeat_rule || null,
  is_reminder: !!row.is_reminder,
  reminder_type: row.reminder_type || null,
  reminder_mode: row.reminder_mode || 'custom',
  reminder_time: row.reminder_time || null,
  reminder_minutes: row.reminder_minutes ?? 15,
  reminder_triggered: row.reminder_triggered ?? false,
  plan_id: row.plan_id || null,
  tags: Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : []),
  deleted_at: row.deleted_at || (row.is_deleted ? new Date().toISOString() : null),
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})

/** Habit: 本地 -> 数据库（数据库用 title，本地用 name） */
export const habitToDb = (item: any) => ({
  id: item.id,
  name: item.name || item.title || '未命名习惯',
  title: item.title || item.name || '',
  description: item.description || '',
  color: item.color || '#6B4C9A',
  icon: item.icon || '',
  frequency: item.frequency || 'daily',
  reminder_time: normalizeReminderTimeForDb(item.reminder_time),
  type: item.type || 'positive',
  checkins: item.checkins ? (typeof item.checkins === 'string' ? item.checkins : JSON.stringify(item.checkins)) : '[]',
  sort_order: typeof item.sort_order === 'number' ? item.sort_order : 999,
  reward_poin: typeof item.reward_poin === 'number' ? item.reward_poin : 0,
  deduct_poin: typeof item.deduct_poin === 'number' ? item.deduct_poin : 0,
  reminder_enabled: item.reminder_enabled ?? false,
  reminder_mode: item.reminder_mode || 'custom',
  reminder_minutes: item.reminder_minutes ?? 15,
  reminder_triggered: item.reminder_triggered ?? false,
  is_archived: !!item.is_archived,
  archived_at: item.archived_at || null,
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** Habit: 数据库 -> 本地（数据库 title -> 本地 name） */
export const habitFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name || row.title || '',
  description: row.description || '',
  color: row.color || '#6B4C9A',
  icon: row.icon || '',
  frequency: row.frequency || 'daily',
  reminder_time: row.reminder_time || null,
  type: row.type || 'positive',
  checkins: Array.isArray(row.checkins) ? row.checkins : (typeof row.checkins === 'string' ? JSON.parse(row.checkins || '[]') : []),
  sort_order: typeof row.sort_order === 'number' ? row.sort_order : 999,
  reward_poin: typeof row.reward_poin === 'number' ? row.reward_poin : 0,
  deduct_poin: typeof row.deduct_poin === 'number' ? row.deduct_poin : 0,
  reminder_enabled: row.reminder_enabled ?? false,
  reminder_mode: row.reminder_mode || 'custom',
  reminder_minutes: row.reminder_minutes ?? 15,
  reminder_triggered: row.reminder_triggered ?? false,
  is_archived: !!row.is_archived,
  archived_at: row.archived_at || null,
  deleted_at: row.deleted_at || null,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})

/** Plan: 本地 -> 数据库 */
export const planToDb = (item: any) => ({
  id: item.id,
  title: item.title,
  content: item.content || '',
  priority: item.priority || 'medium',
  tags: Array.isArray(item.tags) ? JSON.stringify(item.tags) : (typeof item.tags === 'string' ? item.tags : '[]'),
  is_scheduled: !!item.is_scheduled,
  scheduled_to: item.scheduled_to || null,
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** Plan: 数据库 -> 本地 */
export const planFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  title: row.title || '',
  content: row.content || '',
  priority: row.priority || 'medium',
  tags: Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : []),
  is_scheduled: !!row.is_scheduled,
  scheduled_to: row.scheduled_to || null,
  deleted_at: row.deleted_at || null,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})

/** Note: 本地 -> 数据库 */
export const noteToDb = (item: any) => ({
  id: item.id,
  title: item.title || '',
  content: typeof item.content === 'string'
    ? item.content
    : (item.content != null ? JSON.stringify(item.content) : ''),
  wall_id: item.wall_id || null,
  image_ids: Array.isArray(item.image_ids) ? item.image_ids : (typeof item.image_ids === 'string' ? JSON.parse(item.image_ids || '[]') : []),
  audio_ids: Array.isArray(item.audio_ids) ? item.audio_ids : (typeof item.audio_ids === 'string' ? JSON.parse(item.audio_ids || '[]') : []),
  color: item.color || '',
  background: item.background || '',
  position: item.position || 0,
  sort_order: item.sort_order || 0,
  is_pinned: !!item.is_pinned,
  is_archived: !!item.is_archived,
  is_deleted: !!item.deleted_at,
  comments: item.comments ? (typeof item.comments === 'string' ? item.comments : JSON.stringify(item.comments)) : '[]',
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** Note: 数据库 -> 本地 */
export const noteFromDb = (row: any) => {
  // content 字段还原：从数据库字符串还原为 NoteContent 对象 { text, html?, format? }
  let content: any = row.content
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content)
      if (content && typeof content === 'object') {
        if (!('text' in content)) {
          content = { text: String(content) }
        }
      } else {
        content = { text: String(content) }
      }
    } catch {
      content = { text: content }
    }
  } else if (content == null) {
    content = { text: '' }
  } else if (typeof content === 'object' && !('text' in content)) {
    content = { text: JSON.stringify(content) }
  }

  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || '',
    wall_id: row.wall_id || null,
    content,
    image_ids: Array.isArray(row.image_ids) ? row.image_ids : (typeof row.image_ids === 'string' ? JSON.parse(row.image_ids || '[]') : []),
    audio_ids: Array.isArray(row.audio_ids) ? row.audio_ids : (typeof row.audio_ids === 'string' ? JSON.parse(row.audio_ids || '[]') : []),
    color: row.color || '',
    background: row.background || '',
    position: row.position || 0,
    sort_order: row.sort_order || 0,
    is_pinned: !!row.is_pinned,
    is_archived: !!row.is_archived,
    is_deleted: !!row.is_deleted,
    comments: Array.isArray(row.comments) ? row.comments : (typeof row.comments === 'string' ? JSON.parse(row.comments || '[]') : []),
    deleted_at: row.deleted_at || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  }
}

/** NoteWall: 本地 -> 数据库 */
export const noteWallToDb = (item: any) => ({
  id: item.id,
  name: item.name || '默认',
  description: item.description || '',
  sort_order: typeof item.sort_order === 'number' && Number.isInteger(item.sort_order) ? item.sort_order : 0,
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** NoteWall: 数据库 -> 本地 */
export const noteWallFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name || '默认',
  description: row.description || '',
  sort_order: row.sort_order || 0,
  deleted_at: row.deleted_at || null,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})

/** TrackerCategory: 双向一致 */
export const trackerCategoryToDb = (item: any) => ({
  id: item.id,
  name: item.name || '',
  icon: item.icon || '',
  color: item.color || '',
  unit: item.unit || '',
  reward_poin: item.reward_poin ?? null,
  deduct_poin: item.deduct_poin ?? null,
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** TrackerEntry: 双向一致 */
export const trackerEntryToDb = (item: any) => ({
  id: item.id,
  category_id: item.category_id,
  timestamp: item.timestamp || new Date().toISOString(),
  note: item.note || '',
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

// ===== 排班转换 =====
/** Shift: 本地 -> 数据库 */
export const shiftToDb = (s: Shift) => ({
  id: s.id,
  user_id: s.user_id,
  year: s.year,
  month: s.month,
  day: s.day,
  type: s.type,
  deleted_at: s.deleted_at,
  created_at: s.created_at,
  updated_at: s.updated_at,
})

/** Shift: 数据库 -> 本地 */
export const shiftFromDb = (row: any): Shift => ({
  id: row.id,
  user_id: row.user_id,
  year: row.year,
  month: row.month,
  day: row.day,
  type: row.type,
  deleted_at: row.deleted_at || null,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

// ===== Poin 系统转换 =====

/** PoinShopItem: 本地 -> 数据库 */
export const poinShopItemToDb = (item: any) => ({
  id: item.id,
  name: item.name || '',
  cost_poin: item.cost_poin ?? 0,
  shop_type: item.shop_type || 'reward',
  bind_habit_id: item.bind_habit_id || null,
  bind_tracker_id: item.bind_tracker_id || null,
  limit_rule: item.limit_rule || 'none',
  limit_count: item.limit_count ?? 1,
  description: item.description || '',
  status: item.status || 'active',
  deleted_at: item.deleted_at || null,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** PoinShopItem: 数据库 -> 本地 */
export const poinShopItemFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name || '',
  cost_poin: row.cost_poin ?? 0,
  shop_type: row.shop_type || 'reward',
  bind_habit_id: row.bind_habit_id || null,
  bind_tracker_id: row.bind_tracker_id || null,
  limit_rule: row.limit_rule || 'none',
  limit_count: row.limit_count ?? 1,
  description: row.description || '',
  status: row.status || 'active',
  deleted_at: row.deleted_at || null,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})

/** PoinBagItem: 本地 -> 数据库 */
export const poinBagItemToDb = (item: any) => ({
  id: item.id,
  shop_item_id: item.shop_item_id || null,
  shop_item_name: item.shop_item_name || '',
  bind_habit_id: item.bind_habit_id || null,
  bind_tracker_id: item.bind_tracker_id || null,
  cost_poin: item.cost_poin ?? 0,
  remain_times: item.remain_times ?? 0,
  is_used: !!item.is_used,
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString(),
})

/** PoinBagItem: 数据库 -> 本地 */
export const poinBagItemFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  shop_item_id: row.shop_item_id || null,
  shop_item_name: row.shop_item_name || '',
  bind_habit_id: row.bind_habit_id || null,
  bind_tracker_id: row.bind_tracker_id || null,
  cost_poin: row.cost_poin ?? 0,
  remain_times: row.remain_times ?? 0,
  is_used: !!row.is_used,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})

/** PoinRecord: 数据库 -> 本地（只读，不需要 toDb） */
export const poinRecordFromDb = (row: any) => ({
  id: row.id,
  user_id: row.user_id,
  change_num: row.change_num ?? 0,
  type: row.type || 'todo',
  target_id: row.target_id || null,
  description: row.description || '',
  is_reversed: !!row.is_reversed || String(row.description || '').startsWith('[已撤回]'),
  reversed_at: row.reversed_at || null,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
})
