import { supabase } from './supabase'
import { usePoinStore, useAppStore, useTrackerStore } from '@/store'
import { generateUUID } from './utils'
import type { PoinRecord, PoinShopItem, PoinBagItem } from '@/types'

/**
 * Poin 货币系统核心服务
 *
 * 所有 Poin 增减操作通过此模块执行，确保余额、流水、背包三者一致。
 * 余额存储在 Supabase user_poin 表（单行 per user），流水存储在 poin_records 表。
 */

/** 获取用户当前 Poin 余额（优先从本地 store 读取，fallback 到 Supabase） */
export async function fetchBalance(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_poin')
      .select('balance')
      .eq('user_id', userId)
      .single()
    if (error) {
      // 表不存在或行不存在：余额默认 0
      if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('does not exist')) {
        return 0
      }
      console.error('[Poin] fetchBalance error:', error.message)
      return 0
    }
    return data?.balance ?? 0
  } catch (e: any) {
    console.error('[Poin] fetchBalance exception:', e.message)
    return 0
  }
}

/** 确保用户在 user_poin 表中有记录（首次开启 Poin 系统时调用） */
export async function ensurePoinAccount(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('user_poin')
      .select('user_id')
      .eq('user_id', userId)
      .single()
    if (error && error.code === 'PGRST116') {
      // 行不存在，插入初始记录（余额 = 0）
      const { error: insertError } = await supabase
        .from('user_poin')
        .insert({ user_id: userId, balance: 0 })
      if (insertError) console.warn('[Poin] ensurePoinAccount insert error:', insertError.message)
    }
  } catch (e: any) {
    console.warn('[Poin] ensurePoinAccount exception:', e.message)
  }
}

/** 内部：更新 Supabase 余额 + 本地 store */
async function updateBalance(userId: string, delta: number): Promise<number> {
  // 先获取当前余额
  const currentBalance = await fetchBalance(userId)
  const newBalance = currentBalance + delta

  // 更新 Supabase
  const { error } = await supabase
    .from('user_poin')
    .upsert({ user_id: userId, balance: newBalance }, { onConflict: 'user_id' })
  if (error) console.warn('[Poin] updateBalance upsert error:', error.message)

  // 更新本地 store
  usePoinStore.getState().setBalance(newBalance)
  return newBalance
}

/** 内部：写入一条收支流水 */
async function writeRecord(
  userId: string,
  changeNum: number,
  type: PoinRecord['type'],
  targetId: string | null,
  description: string
): Promise<void> {
  const config = usePoinStore.getState().config
  // 如果关闭了收支日志，不写入
  if (!config.save_log) return

  const record: PoinRecord = {
    id: generateUUID(),
    user_id: userId,
    change_num: changeNum,
    type,
    target_id: targetId,
    description,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // 写入 Supabase
  const { error } = await supabase.from('poin_records').insert({
    id: record.id,
    user_id: userId,
    change_num: changeNum,
    type,
    target_id: targetId,
    description,
    created_at: record.created_at,
    updated_at: record.updated_at,
  })
  if (error) console.warn('[Poin] writeRecord insert error:', error.message)

  // 更新本地 store
  usePoinStore.getState().addRecord(record)
}

/**
 * 获得 Poin（完成待办、正向习惯打卡、阶段规划完成）
 * @returns 新余额
 */
export async function earnPoin(
  userId: string,
  amount: number,
  type: PoinRecord['type'],
  targetId: string | null,
  description: string
): Promise<number> {
  if (amount <= 0) return usePoinStore.getState().balance
  const newBalance = await updateBalance(userId, amount)
  await writeRecord(userId, amount, type, targetId, description)
  return newBalance
}

/**
 * 扣除 Poin（消极习惯打卡）
 * @returns { newBalance, usedExemption } - 新余额和是否使用了豁免券
 */
export async function deductPoin(
  userId: string,
  amount: number,
  type: PoinRecord['type'],
  targetId: string | null,
  description: string
): Promise<{ newBalance: number; usedExemption: boolean }> {
  if (amount <= 0) return { newBalance: usePoinStore.getState().balance, usedExemption: false }

  // 尝试消耗豁免券（对习惯打卡和实时打卡类型）
  if ((type === 'habit' || type === 'tracker') && targetId) {
    const used = await consumeExemption(userId, targetId, type)
    if (used) {
      // 使用了豁免券，不扣除 Poin
      return { newBalance: usePoinStore.getState().balance, usedExemption: true }
    }
  }

  // 检查透支规则
  const config = usePoinStore.getState().config
  const currentBalance = usePoinStore.getState().balance
  if (!config.allow_overdraft && currentBalance < amount) {
    // 不允许透支且余额不足：禁止打卡
    throw new Error('POIN_INSUFFICIENT')
  }

  const newBalance = await updateBalance(userId, -amount)
  await writeRecord(userId, -amount, type, targetId, description)
  return { newBalance, usedExemption: false }
}

/**
 * 撤回 Poin：查找最近一次对应 target 的 Poin 记录并反向操作
 * - 如果原记录是获得（change_num > 0），则扣除相同金额
 * - 如果原记录是扣除（change_num < 0），则返还相同金额
 * - 如果原记录 change_num === 0（使用了豁免券），不做任何操作
 * - 如果找不到对应记录，不做任何操作
 */
export async function refundPoin(
  userId: string,
  type: PoinRecord['type'],
  targetId: string,
  description: string
): Promise<void> {
  const poinConfig = usePoinStore.getState().config
  if (!poinConfig.enable) return

  // 优先从本地 store 查找最近一条记录
  const localRecords = usePoinStore.getState().records
  let lastRecord = localRecords
    .filter(r => r.target_id === targetId && r.type === type)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

  // 本地没找到则查 Supabase
  if (!lastRecord) {
    const { data, error } = await supabase
      .from('poin_records')
      .select('*')
      .eq('user_id', userId)
      .eq('target_id', targetId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (!error && data && data.length > 0) {
      lastRecord = data[0] as PoinRecord
    }
  }

  if (!lastRecord) {
    console.warn('[Poin] refundPoin: no record found for target:', targetId)
    return
  }

  const originalChange = lastRecord.change_num

  // 豁免券场景：change_num === 0，无需退回
  if (originalChange === 0) {
    console.log('[Poin] refundPoin: exemption was used, no Poin to refund')
    return
  }

  // 反向操作：原获得则扣除，原扣除则返还
  const refundAmount = -originalChange
  await updateBalance(userId, refundAmount)
  await writeRecord(userId, refundAmount, type, targetId, description)
}

/**
 * 消耗豁免券：检查背包中是否有对应习惯/实时打卡分类的豁免券
 * @param targetId 习惯ID（bindType='habit'）或 实时打卡记录条目ID（bindType='tracker'）
 * @returns true=成功消耗豁免券，false=无可用豁免券
 */
export async function consumeExemption(userId: string, targetId: string, bindType: 'habit' | 'tracker' = 'habit'): Promise<boolean> {
  const bagItems = usePoinStore.getState().bagItems
  // tracker 类型：targetId 是记录条目ID，需解析为分类ID以匹配 bind_tracker_id
  let matchId = targetId
  if (bindType === 'tracker') {
    const entry = useTrackerStore.getState().entries.find(e => e.id === targetId && !e.deleted_at)
    if (entry) matchId = entry.category_id
  }
  // 找到绑定该习惯/打卡分类的、未核销的、剩余次数 > 0 的豁免券
  const exemption = bagItems.find(
    item => !item.is_used && item.remain_times > 0 &&
      (bindType === 'habit' ? item.bind_habit_id === matchId : item.bind_tracker_id === matchId)
  )
  if (!exemption) return false

  const newRemain = exemption.remain_times - 1
  const isUsed = newRemain <= 0
  const now = new Date().toISOString()

  // 更新 Supabase
  const { error } = await supabase
    .from('poin_bag')
    .update({ remain_times: newRemain, is_used: isUsed, updated_at: now })
    .eq('id', exemption.id)
  if (error) console.warn('[Poin] consumeExemption update error:', error.message)

  // 更新本地 store
  usePoinStore.getState().updateBagItem(exemption.id, { remain_times: newRemain, is_used: isUsed, updated_at: now })

  // 写入流水
  await writeRecord(userId, 0, bindType, targetId, `使用豁免券：${exemption.shop_item_name}`)

  return true
}

/**
 * 兑换商城奖品：消耗 Poin，存入背包
 * @returns { success, message }
 */
export async function redeemShopItem(
  userId: string,
  shopItem: PoinShopItem
): Promise<{ success: boolean; message: string }> {
  if (shopItem.status !== 'active') {
    return { success: false, message: '该奖品已下架' }
  }

  // 检查兑换次数限制
  const limitCheck = checkRedeemLimit(shopItem)
  if (!limitCheck.allowed) {
    return { success: false, message: limitCheck.reason || '已达兑换上限' }
  }

  const currentBalance = usePoinStore.getState().balance
  if (currentBalance < shopItem.cost_poin) {
    return { success: false, message: 'Poin 余额不足' }
  }

  // 扣除 Poin
  await updateBalance(userId, -shopItem.cost_poin)
  await writeRecord(userId, -shopItem.cost_poin, 'shop', shopItem.id, `兑换：${shopItem.name}`)

  // 创建背包物品
  const bagItem: PoinBagItem = {
    id: generateUUID(),
    user_id: userId,
    shop_item_id: shopItem.id,
    shop_item_name: shopItem.name,
    bind_habit_id: shopItem.bind_habit_id,
    bind_tracker_id: shopItem.bind_tracker_id,
    cost_poin: shopItem.cost_poin,
    remain_times: shopItem.shop_type === 'exemption' ? 1 : 1,
    is_used: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // 写入 Supabase
  const { error } = await supabase.from('poin_bag').insert({
    id: bagItem.id,
    user_id: userId,
    shop_item_id: bagItem.shop_item_id,
    shop_item_name: bagItem.shop_item_name,
    bind_habit_id: bagItem.bind_habit_id,
    bind_tracker_id: bagItem.bind_tracker_id,
    cost_poin: bagItem.cost_poin,
    remain_times: bagItem.remain_times,
    is_used: false,
    created_at: bagItem.created_at,
    updated_at: bagItem.updated_at,
  })
  if (error) console.warn('[Poin] redeemShopItem insert bag error:', error.message)

  // 更新本地 store
  usePoinStore.getState().addBagItem(bagItem)

  // 记录兑换时间（用于限制检查）
  recordRedeem(shopItem.id)

  return { success: true, message: `兑换成功：${shopItem.name}` }
}

/** 核销背包中的普通奖励（用户手动点击"已享用"） */
export async function consumeBagItem(userId: string, bagItemId: string): Promise<boolean> {
  const bagItems = usePoinStore.getState().bagItems
  const item = bagItems.find(b => b.id === bagItemId)
  if (!item || item.is_used) return false

  const now = new Date().toISOString()
  // 更新 Supabase
  const { error } = await supabase
    .from('poin_bag')
    .update({ is_used: true, remain_times: 0, updated_at: now })
    .eq('id', bagItemId)
  if (error) console.warn('[Poin] consumeBagItem error:', error.message)

  // 更新本地
  usePoinStore.getState().updateBagItem(bagItemId, { is_used: true, remain_times: 0, updated_at: now })
  return true
}

/**
 * 重置全部 Poin 数据：余额归零、清空商店、清空背包、清空流水
 */
export async function resetAllPoin(userId: string): Promise<void> {
  // 清空 Supabase（注意顺序：先删依赖项再删主项）
  await supabase.from('poin_bag').delete().eq('user_id', userId)
  await supabase.from('poin_records').delete().eq('user_id', userId)
  await supabase.from('poin_shop').delete().eq('user_id', userId)
  await supabase.from('user_poin').upsert({ user_id: userId, balance: 0 }, { onConflict: 'user_id' })

  // 清空本地 store
  usePoinStore.getState().resetAll()
}

/**
 * 检查是否可以打卡消极习惯
 * @returns { canCheckin, reason }
 */
export function canCheckinNegativeHabit(
  balance: number,
  deductAmount: number
): { canCheckin: boolean; reason?: string } {
  const config = usePoinStore.getState().config
  if (!config.enable) return { canCheckin: true } // Poin 系统未开启时不限制

  // 检查是否有豁免券
  // 注意：豁免券检查在 deductPoin 中处理，这里只检查透支规则
  if (!config.allow_overdraft && balance < deductAmount) {
    return { canCheckin: false, reason: 'Poin 余额不足且未开启透支，无法打卡消极习惯' }
  }
  return { canCheckin: true }
}

// ===== 兑换次数限制检查（本地记录，简单实现） =====

const redeemHistory: Record<string, string[]> = {} // shopItemId -> [timestamp, ...]

function checkRedeemLimit(shopItem: PoinShopItem): { allowed: boolean; reason?: string } {
  if (shopItem.limit_rule === 'none') return { allowed: true }

  const now = Date.now()
  const history = redeemHistory[shopItem.id] || []

  if (shopItem.limit_rule === 'daily') {
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const todayCount = history.filter(ts => Number(ts) >= todayStart).length
    if (todayCount >= 1) return { allowed: false, reason: '今日已兑换，每日限兑 1 次' }
  } else if (shopItem.limit_rule === 'weekly') {
    const weekStart = now - 7 * 24 * 60 * 60 * 1000
    const weekCount = history.filter(ts => Number(ts) >= weekStart).length
    if (weekCount >= 1) return { allowed: false, reason: '本周已兑换，每周限兑 1 次' }
  } else if (shopItem.limit_rule === 'custom') {
    const maxCount = shopItem.limit_count ?? 1
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const todayCount = history.filter(ts => Number(ts) >= todayStart).length
    if (todayCount >= maxCount) return { allowed: false, reason: `今日已兑换 ${maxCount} 次，已达上限` }
  }

  return { allowed: true }
}

function recordRedeem(shopItemId: string) {
  if (!redeemHistory[shopItemId]) redeemHistory[shopItemId] = []
  redeemHistory[shopItemId].push(String(Date.now()))
}

/**
 * 手动撤回 Poin 记录：反向操作指定记录的余额变动，并标记原记录已撤回
 * - 原记录 +5 → 扣除 5，原记录置灰/划线
 * - 原记录 -5 → 返还 5，原记录置灰/划线
 * - 原记录 0（豁免券）→ 不做任何操作
 * 不再生成额外撤回流水，避免同一条记录无限撤回。
 */
export async function reverseRecord(
  userId: string,
  recordId: string
): Promise<{ success: boolean; message: string }> {
  const poinConfig = usePoinStore.getState().config
  if (!poinConfig.enable) {
    return { success: false, message: 'Poin 系统未开启' }
  }

  // 从本地 store 查找记录
  let record = usePoinStore.getState().records.find(r => r.id === recordId)

  // 本地没找到则查 Supabase
  if (!record) {
    const { data, error } = await supabase
      .from('poin_records')
      .select('*')
      .eq('id', recordId)
      .eq('user_id', userId)
      .single()
    if (error || !data) {
      return { success: false, message: '未找到该记录' }
    }
    record = data as PoinRecord
  }

  if (!record) {
    return { success: false, message: '未找到该记录' }
  }

  if (record.is_reversed || record.description?.startsWith('[已撤回]')) {
    return { success: false, message: '该记录已经撤回，不能重复撤回' }
  }

  // 豁免券场景：change_num === 0，无需撤回
  if (record.change_num === 0) {
    return { success: false, message: '该记录为豁免券使用，无余额变动，无需撤回' }
  }

  // 反向操作
  const reverseAmount = -record.change_num

  // 更新余额
  await updateBalance(userId, reverseAmount)

  const reversedAt = new Date().toISOString()
  const { error } = await supabase
    .from('poin_records')
    .update({
      is_reversed: true,
      reversed_at: reversedAt,
      updated_at: reversedAt,
    })
    .eq('id', record.id)
    .eq('user_id', userId)

  if (error) {
    // 如果远端表还没有 is_reversed/reversed_at 字段，用描述前缀兜底持久标记，避免刷新后重复撤回。
    console.warn('[Poin] mark record reversed failed:', error.message)
    const fallbackDescription = record.description?.startsWith('[已撤回]')
      ? record.description
      : `[已撤回] ${record.description || ''}`
    const { error: fallbackError } = await supabase
      .from('poin_records')
      .update({
        description: fallbackDescription,
        updated_at: reversedAt,
      })
      .eq('id', record.id)
      .eq('user_id', userId)

    usePoinStore.getState().updateRecord(record.id, {
      description: fallbackDescription,
      is_reversed: true,
      reversed_at: reversedAt,
      updated_at: reversedAt,
    })

    if (fallbackError) {
      console.warn('[Poin] fallback mark record reversed failed:', fallbackError.message)
      return { success: true, message: '已撤回余额；但记录标记同步失败，请刷新后谨慎再次操作' }
    }
    return { success: true, message: `已撤回 ${record.change_num > 0 ? "+" : ""}${record.change_num} Poin` }
  }

  usePoinStore.getState().updateRecord(record.id, {
    is_reversed: true,
    reversed_at: reversedAt,
    updated_at: reversedAt,
  })

  return { success: true, message: `已撤回 ${record.change_num > 0 ? "+" : ""}${record.change_num} Poin` }
}

// ===== Poin 配置管理 =====

/** 获取 Poin 配置（从 Supabase 或使用默认值）
 *  注意：如果远端表不存在或查询失败，返回当前本地 store 中的配置，避免覆盖用户已开启的设置
 */
export async function fetchPoinConfig(userId: string) {
  const localConfig = usePoinStore.getState().config
  try {
    const { data, error } = await supabase
      .from('poin_config')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (error && error.code === 'PGRST116') {
      // 行不存在：保留本地完整配置（包括 allow_overdraft、save_log 等用户设置）
      return localConfig
    }
    if (error) {
      // 表不存在或其他错误：保留本地配置，不覆盖
      if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
        return localConfig
      }
      console.warn('[Poin] fetchPoinConfig error:', error.message)
      return localConfig
    }
    return {
      enable: !!data.enable,
      allow_overdraft: !!data.allow_overdraft,
      save_log: data.save_log !== false,
    }
  } catch {
    // 异常时保留本地配置
    return localConfig
  }
}

/** 保存 Poin 配置到 Supabase
 *  注意：如果 upsert 失败会 throw 错误，调用方应 catch 并回滚本地配置
 */
export async function savePoinConfig(userId: string, config: { enable: boolean; allow_overdraft: boolean; save_log: boolean }) {
  // 先保存本地（乐观更新），调用方在 catch 时回滚
  const oldConfig = usePoinStore.getState().config
  usePoinStore.getState().setConfig(config)

  const { error } = await supabase
    .from('poin_config')
    .upsert({
      user_id: userId,
      enable: config.enable,
      allow_overdraft: config.allow_overdraft,
      save_log: config.save_log,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) {
    // 云端保存失败，回滚本地配置
    usePoinStore.getState().setConfig(oldConfig)
    console.error('[Poin] savePoinConfig error:', error.message)
    throw new Error(error.message)
  }

  // 首次开启时确保账户存在
  if (config.enable) {
    await ensurePoinAccount(userId)
  }
}
