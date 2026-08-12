import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePoinStore, useHabitStore, useTrackerStore, useAppStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { syncUpsert, syncDelete, poinShopItemToDb } from '@/lib/sync'
import { redeemShopItem, consumeBagItem, fetchBalance, fetchPoinConfig, savePoinConfig, reverseRecord } from '@/lib/poin'
import { generateUUID } from '@/lib/utils'
import {
  Coins, ShoppingBag, Plus, Edit, Trash, Gift, Ticket,
  Check, X, ChevronDown, ChevronRight, Settings as SettingsIcon, RotateCcw
} from '@/utils/icons'
import type { PoinShopItem, PoinShopType, PoinLimitRule } from '@/types'
import ConfirmDialog from '@/components/ConfirmDialog'

const PoinShop: React.FC = () => {
  const { user, addNotification } = useAppStore()
  const { config, records, shopItems, bagItems, balance, setBalance, setShopItems, setBagItems, setRecords, addShopItem, updateShopItem, deleteShopItem } = usePoinStore()
  const { habits } = useHabitStore()
  const { categories: trackerCategories } = useTrackerStore()

  const [activeTab, setActiveTab] = useState<'shop' | 'bag' | 'records'>('shop')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<PoinShopItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [confirmReverse, setConfirmReverse] = useState<string | null>(null)

  // 初始化：加载 Poin 数据（仅首次挂载时加载配置，避免覆盖用户在设置弹窗中的修改）
  useEffect(() => {
    if (!user) return
    const loadData = async () => {
      // 加载配置：仅在首次加载（本地配置为默认值时）从云端拉取，避免覆盖用户修改
      const localCfg = usePoinStore.getState().config
      const isDefault = !localCfg.enable && localCfg.allow_overdraft === true && localCfg.save_log === true
      if (isDefault) {
        const cfg = await fetchPoinConfig(user.id)
        usePoinStore.getState().setConfig(cfg)
      }

      // 加载余额
      const bal = await fetchBalance(user.id)
      setBalance(bal)

      // 加载商城奖品
      try {
        const { data: shopData } = await supabase
          .from('poin_shop')
          .select('*')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (shopData) setShopItems(shopData.map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          name: row.name || '',
          cost_poin: row.cost_poin ?? 0,
          shop_type: row.shop_type || 'reward',
          bind_habit_id: row.bind_habit_id || null,
          bind_tracker_id: row.bind_tracker_id || null,
          limit_rule: row.limit_rule || 'none',
          description: row.description || '',
          status: row.status || 'active',
          deleted_at: row.deleted_at || null,
          created_at: row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
        })))
      } catch (e) { /* table might not exist yet */ }

      // 加载背包
      try {
        const { data: bagData } = await supabase
          .from('poin_bag')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        if (bagData) setBagItems(bagData.map((row: any) => ({
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
        })))
      } catch (e) { /* table might not exist yet */ }

      // 加载收支明细
      try {
        const { data: recordData } = await supabase
          .from('poin_records')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200)
        if (recordData) setRecords(recordData.map((row: any) => ({
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
        })))
      } catch (e) { /* table might not exist yet */ }
    }
    loadData()
  }, [user])

  // 表单状态
  const [form, setForm] = useState({
    name: '',
    cost_poin: 1,
    shop_type: 'reward' as PoinShopType,
    bind_habit_id: '' as string,
    bind_tracker_id: '' as string,
    limit_rule: 'none' as PoinLimitRule,
    limit_count: 1,
    description: '',
    status: 'active' as 'active' | 'inactive',
  })

  const resetForm = () => {
    setForm({ name: '', cost_poin: 1, shop_type: 'reward', bind_habit_id: '', bind_tracker_id: '', limit_rule: 'none', limit_count: 1, description: '', status: 'active' })
    setEditingItem(null)
  }

  const negativeHabits = habits.filter(h => !h.deleted_at && h.type === 'negative')

  const handleSave = async () => {
    if (!form.name.trim()) {
      // 豁免券类型：如果绑定了习惯或tracker，名称可以不填（自动生成）
      if (form.shop_type === 'exemption' && (form.bind_habit_id || form.bind_tracker_id)) {
        // 名称不填，使用自动生成
      } else {
        addNotification({ message: '请填写名称，或选择绑定的习惯/打卡项目', type: 'warning' })
        return
      }
    }
    if (!user) return

    // 豁免券类型：自动生成名称
    let itemName = form.name.trim()
    if (form.shop_type === 'exemption') {
      if (form.bind_habit_id) {
        const habit = habits.find(h => h.id === form.bind_habit_id)
        if (habit && !itemName) {
          itemName = `${habit.name}豁免券`
        }
      } else if (form.bind_tracker_id) {
        const tracker = trackerCategories.find(t => t.id === form.bind_tracker_id)
        if (tracker && !itemName) {
          itemName = `${tracker.name}豁免券`
        }
      }
    }

    if (editingItem) {
      const updated = { ...editingItem, name: itemName, cost_poin: form.cost_poin, shop_type: form.shop_type, bind_habit_id: form.shop_type === 'exemption' ? (form.bind_habit_id || null) : null, bind_tracker_id: form.shop_type === 'exemption' ? (form.bind_tracker_id || null) : null, limit_rule: form.limit_rule, limit_count: form.limit_count, description: form.description, status: form.status, updated_at: new Date().toISOString() }
      updateShopItem(editingItem.id, updated)
      syncUpsert('poin_shop', user.id, updated, poinShopItemToDb).then(r => {
        if (!r.success) console.error('[PoinShop] sync update failed:', r.error)
      })
      addNotification({ message: '奖品已更新', type: 'success' })
    } else {
      const newItem: PoinShopItem = {
        id: generateUUID(),
        user_id: user.id,
        name: itemName,
        cost_poin: form.cost_poin,
        shop_type: form.shop_type,
        bind_habit_id: form.shop_type === 'exemption' ? (form.bind_habit_id || null) : null,
        bind_tracker_id: form.shop_type === 'exemption' ? (form.bind_tracker_id || null) : null,
        limit_rule: form.limit_rule,
        limit_count: form.limit_count,
        description: form.description,
        status: form.status,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      addShopItem(newItem)
      syncUpsert('poin_shop', user.id, newItem, poinShopItemToDb).then(r => {
        if (!r.success) console.error('[PoinShop] sync add failed:', r.error)
      })
      addNotification({ message: '奖品已创建', type: 'success' })
    }
    setShowModal(false)
    resetForm()
  }

  const handleDelete = async (id: string) => {
    if (!user) return
    deleteShopItem(id)
    syncDelete('poin_shop', id, user.id)
    setConfirmDelete(null)
    addNotification({ message: '奖品已删除', type: 'success' })
  }

  const handleRedeem = async (item: PoinShopItem) => {
    if (!user) return
    const result = await redeemShopItem(user.id, item)
    addNotification({ message: result.message, type: result.success ? 'success' : 'warning' })
  }

  const handleConsumeBag = async (bagItemId: string) => {
    if (!user) return
    const success = await consumeBagItem(user.id, bagItemId)
    addNotification({ message: success ? '已核销' : '核销失败', type: success ? 'success' : 'error' })
  }

  const handleReset = async () => {
    if (!user) return
    const { resetAllPoin } = await import('@/lib/poin')
    await resetAllPoin(user.id)
    setConfirmReset(false)
    addNotification({ message: '全部 Poin 数据已重置', type: 'success' })
  }

  // 撤回 Poin 记录
  const handleReverse = async (recordId: string) => {
    if (!user) return
    const result = await reverseRecord(user.id, recordId)
    addNotification({ message: result.message, type: result.success ? 'success' : 'warning' })
    if (result.success) {
      // 重新加载余额和记录
      const bal = await fetchBalance(user.id)
      setBalance(bal)
      try {
        const { data: recordData } = await supabase
          .from('poin_records')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200)
        if (recordData) setRecords(recordData.map((row: any) => ({
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
        })))
      } catch (e) { /* ignore */ }
    }
    setConfirmReverse(null)
  }

  // Poin 设置变更（允许透支、留存日志）
  const handlePoinSettingChange = async (key: 'allow_overdraft' | 'save_log', value: boolean) => {
    const newConfig = { ...config, [key]: value }
    if (user) {
      try {
        // savePoinConfig 内部会乐观更新本地，失败时自动回滚
        await savePoinConfig(user.id, newConfig)
        addNotification({ message: '设置已保存', type: 'success' })
      } catch (e: any) {
        addNotification({ message: '设置保存失败，请检查网络后重试', type: 'error' })
        console.error('[PoinShop] savePoinConfig failed:', e)
      }
    }
  }

  const activeShopItems = shopItems.filter(s => !s.deleted_at)
  const pendingRewards = bagItems.filter(b => !b.is_used && !b.bind_habit_id && !b.bind_tracker_id)
  const exemptionCoupons = bagItems.filter(b => !b.is_used && (b.bind_habit_id || b.bind_tracker_id))
  // 按习惯或 tracker 分类分组
  const exemptionGroups = exemptionCoupons.reduce((acc, item) => {
    const key = item.bind_habit_id || item.bind_tracker_id || 'unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, typeof exemptionCoupons>)

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const typeLabels: Record<string, string> = {
    todo: '待办完成',
    plan: '规划完成',
    habit: '习惯打卡',
    shop: '兑换消费',
  }

  return (
    <div className="page-container">
      <div className="max-w-3xl mx-auto">
        {/* 顶部余额卡片 */}
        <div className="card mb-4 md:mb-6 bg-gradient-to-br from-primary-600 to-primary-800 text-white">
          <div className="flex items-center justify-between p-3 md:p-6">
            <div className="min-w-0">
              <p className="text-xs md:text-sm opacity-80">我的 Poin 余额</p>
              <div className="flex items-center gap-2 mt-1">
                <Coins className="size-6 md:size-8 flex-shrink-0" />
                <span className="text-2xl md:text-3xl font-bold tabular-nums">{balance}</span>
              </div>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1 px-3 py-2 md:px-3 md:py-2 rounded-button bg-white/10 hover:bg-white/20 transition-colors text-xs md:text-sm whitespace-nowrap flex-shrink-0"
              title="Poin 设置"
            >
              <SettingsIcon size={14} />
              <span className="hidden sm:inline">Poin 设置</span>
            </button>
          </div>
        </div>

        {/* 标签栏 */}
        <div className="flex gap-1 mb-3 md:mb-4 border-b border-[var(--border-color)] overflow-x-auto -mx-1 px-1 lg:mx-0 lg:px-0">
          {([
            { key: 'shop', label: '可兑换奖励', icon: ShoppingBag },
            { key: 'bag', label: '我的背包', icon: Gift },
            { key: 'records', label: '收支明细', icon: Coins },
          ] as const).map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 md:px-3 md:py-2 text-xs md:text-sm font-medium transition-colors border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* 可兑换奖励 */}
        {activeTab === 'shop' && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
              <h2 className="text-sm md:text-lg font-medium text-[var(--text-primary)]">可兑换奖励</h2>
              <button
                onClick={() => { resetForm(); setShowModal(true) }}
                className="flex items-center gap-1 px-3 py-2 md:px-3 md:py-1.5 text-xs md:text-sm bg-primary-600 text-white rounded-button hover:bg-primary-700 transition-colors whitespace-nowrap flex-shrink-0"
              >
                <Plus size={14} />
                新增
              </button>
            </div>

            {activeShopItems.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-tertiary)]">
                <ShoppingBag size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs md:text-sm">还没有兑换项目，点击右上角创建</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                {activeShopItems.map(item => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`card p-3 ${item.status === 'inactive' ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {item.shop_type === 'exemption' ? (
                          <Ticket size={16} className="text-primary-600 flex-shrink-0" />
                        ) : (
                          <Gift size={16} className="text-primary-600 flex-shrink-0" />
                        )}
                        <span className="font-medium text-sm text-[var(--text-primary)] truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingItem(item)
                            setForm({
                              name: item.name,
                              cost_poin: item.cost_poin,
                              shop_type: item.shop_type,
                              bind_habit_id: item.bind_habit_id || '',
                              bind_tracker_id: item.bind_tracker_id || '',
                              limit_rule: item.limit_rule,
                              limit_count: item.limit_count ?? 1,
                              description: item.description,
                              status: item.status,
                            })
                            setShowModal(true)
                          }}
                          className="p-1.5 lg:p-1 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)] flex items-center justify-center"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(item.id)}
                          className="p-1.5 lg:p-1 hover:bg-[var(--bg-tertiary)] rounded text-danger flex items-center justify-center"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-xs text-[var(--text-tertiary)] mb-1.5 truncate">{item.description}</p>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] min-w-0 flex-wrap">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Coins size={13} className="text-primary-600" />
                          {item.cost_poin} Poin
                        </span>
                        {item.limit_rule !== 'none' && (
                          <span className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-xs whitespace-nowrap">
                            {item.limit_rule === 'daily' ? '每日限1次' : item.limit_rule === 'weekly' ? '每周限1次' : `每日限${item.limit_count ?? 1}次`}
                          </span>
                        )}
                        {item.status === 'inactive' && (
                          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs whitespace-nowrap">已下架</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRedeem(item)}
                        disabled={item.status === 'inactive'}
                        className="px-3 py-1.5 lg:px-2.5 lg:py-1 text-xs bg-primary-600 text-white rounded-button hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center justify-center flex-shrink-0"
                      >
                        兑换
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 我的背包 */}
        {activeTab === 'bag' && (
          <div className="space-y-4 md:space-y-6">
            {/* 普通奖励 */}
            <div>
              <h3 className="text-xs md:text-sm font-medium text-[var(--text-secondary)] mb-2 md:mb-3 flex items-center gap-1.5">
                <Gift size={14} />
                待享用奖励 ({pendingRewards.length})
              </h3>
              {pendingRewards.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] py-3 text-center">暂无待享用奖励</p>
              ) : (
                <div className="space-y-1.5 md:space-y-2">
                  {pendingRewards.map(item => (
                    <div key={item.id} className="card p-2.5 md:p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-baseline gap-2">
                        <span className="text-xs md:text-sm font-medium text-[var(--text-primary)] truncate min-w-0">{item.shop_item_name}</span>
                        <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap flex-shrink-0">消耗 {item.cost_poin} Poin</span>
                      </div>
                      <button
                        onClick={() => handleConsumeBag(item.id)}
                        className="px-3 py-1.5 lg:px-2.5 lg:py-1 text-xs bg-green-600 text-white rounded-button hover:bg-green-700 transition-colors flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                      >
                        <Check size={12} />
                        已享用
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 豁免券 */}
            <div>
              <h3 className="text-xs md:text-sm font-medium text-[var(--text-secondary)] mb-2 md:mb-3 flex items-center gap-1.5">
                <Ticket size={14} />
                习惯豁免券
              </h3>
              {Object.keys(exemptionGroups).length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] py-3 text-center">暂无豁免券</p>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {Object.entries(exemptionGroups).map(([bindId, items]) => {
                    const habit = habits.find(h => h.id === bindId)
                    const tracker = trackerCategories.find(t => t.id === bindId)
                    const groupName = habit?.name || tracker?.name || '未知'
                    return (
                      <div key={bindId} className="card p-2.5 md:p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs md:text-sm font-medium text-[var(--text-primary)] truncate">
                            {groupName}豁免券
                          </span>
                          <span className="text-xs text-primary-600 font-medium whitespace-nowrap">x{items.length}</span>
                        </div>
                        <p className="text-xs md:text-xs text-[var(--text-tertiary)]">{tracker ? '实时打卡该项目时自动消耗，抵消 Poin 扣除' : '打卡该消极习惯时自动消耗，抵消 Poin 扣除'}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 收支明细 */}
        {activeTab === 'records' && (
          <div>
            <h2 className="text-sm md:text-lg font-medium text-[var(--text-primary)] mb-3 md:mb-4">收支明细</h2>
            {records.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-tertiary)]">
                <Coins size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs md:text-sm">暂无收支记录</p>
              </div>
            ) : (
              <div className="card divide-y divide-[var(--border-color)]">
                {records.map(record => (
                  <div key={record.id} className={`flex items-center justify-between py-2.5 md:py-3 px-1 ${record.is_reversed ? 'opacity-55 grayscale' : ''}`}>
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        record.is_reversed ? 'bg-gray-100 text-gray-500' : record.change_num > 0 ? 'bg-green-100 text-green-600' : record.change_num < 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        <Coins size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs md:text-sm truncate ${record.is_reversed ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-primary)]'}`}>{record.description.replace(/^\[已撤回\]\s*/, '')}</p>
                        <p className="text-xs md:text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                          {typeLabels[record.type] || record.type} · {formatTime(record.created_at)}{record.is_reversed ? ` · 已撤回${record.reversed_at ? ` ${formatTime(record.reversed_at)}` : ''}` : ''}
                        </p>
                      </div>
                    </div>
<div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className={`text-xs md:text-sm font-medium whitespace-nowrap ${record.is_reversed ? 'text-[var(--text-tertiary)] line-through' : record.change_num > 0 ? 'text-green-600' : record.change_num < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                      {record.change_num > 0 ? '+' : ''}{record.change_num}
                    </span>
                    {record.change_num !== 0 && !record.is_reversed && (
                      <button
                        onClick={() => setConfirmReverse(record.id)}
                        className="p-1.5 lg:p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-orange-500 transition-colors flex items-center justify-center"
                        title="撤回此记录"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm() }}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            {/* 弹窗标题 - 固定顶部 */}
            <div className="flex items-center justify-between p-4 md:p-6 pb-3 border-b border-[var(--border-color)] flex-shrink-0">
              <h3 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">
                {editingItem ? '编辑兑换项目' : '新增兑换项目'}
              </h3>
              <button onClick={() => { setShowModal(false); resetForm() }} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X size={20} />
              </button>
            </div>
            {/* 表单内容 - 可滚动 */}
            <div className="p-4 md:p-6 space-y-3 md:space-y-4 overflow-y-auto flex-1">
              {/* 类型选择 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">类型</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm({ ...form, shop_type: 'reward', bind_habit_id: '', bind_tracker_id: '' })}
                    className={`flex-1 py-2 text-sm rounded-button border transition-colors ${
                      form.shop_type === 'reward' ? 'border-primary-600 bg-primary-600/10 text-primary-600' : 'border-[var(--border-color)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <Gift size={14} className="inline mr-1" />
                    通用奖励
                  </button>
                  <button
                    onClick={() => setForm({ ...form, shop_type: 'exemption' })}
                    className={`flex-1 py-2 text-sm rounded-button border transition-colors ${
                      form.shop_type === 'exemption' ? 'border-primary-600 bg-primary-600/10 text-primary-600' : 'border-[var(--border-color)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <Ticket size={14} className="inline mr-1" />
                    豁免券
                  </button>
                </div>
              </div>

              {/* 豁免券：选择绑定习惯 / 实时打卡（二选一，选填） */}
              {form.shop_type === 'exemption' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">绑定消极习惯 <span className="text-[var(--text-tertiary)] text-xs">（选填）</span></label>
                    <select
                      value={form.bind_habit_id}
                      onChange={e => setForm({ ...form, bind_habit_id: e.target.value, bind_tracker_id: e.target.value ? '' : form.bind_tracker_id })}
                      className="input-dark"
                    >
                      <option value="">不绑定</option>
                      {negativeHabits.map(h => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">绑定实时打卡 <span className="text-[var(--text-tertiary)] text-xs">（选填）</span></label>
                    <select
                      value={form.bind_tracker_id}
                      onChange={e => setForm({ ...form, bind_tracker_id: e.target.value, bind_habit_id: e.target.value ? '' : form.bind_habit_id })}
                      className="input-dark"
                    >
                      <option value="">不绑定</option>
                      {trackerCategories.filter(t => !t.deleted_at).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">习惯和打卡项目只能绑定其中一个。未填名称时将自动生成「名称+豁免券」</p>
                  </div>
                </>
              )}

              {/* 奖励名称 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  {form.shop_type === 'exemption' ? '券名称（可修改）' : '奖励名称'}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={form.shop_type === 'exemption' ? '不填则自动生成（如：吸烟豁免券）' : '如：喝奶茶、游戏2小时'}
                  className="input-dark"
                />
              </div>

              {/* 所需 Poin */}
              <div>
                <label className="block text-sm font-medium mb-1.5">兑换所需 Poin</label>
                <input
                  type="number"
                  min={0}
                  value={form.cost_poin || ''}
                  onChange={e => setForm({ ...form, cost_poin: Math.max(0, Number(e.target.value) || 0) })}
                  className="input-dark"
                />
              </div>

              {/* 兑换限制 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">兑换次数限制</label>
                <select
                  value={form.limit_rule}
                  onChange={e => setForm({ ...form, limit_rule: e.target.value as PoinLimitRule })}
                  className="input-dark"
                >
                  <option value="none">不限次数</option>
                  <option value="daily">每日限兑 1 次</option>
                  <option value="weekly">每周限兑 1 次</option>
                  <option value="custom">自定义每日次数</option>
                </select>
                {form.limit_rule === 'custom' && (
                  <div className="mt-2">
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">每日可兑换次数</label>
                    <input
                      type="number"
                      min={1}
                      value={form.limit_count || ''}
                      onChange={e => setForm({ ...form, limit_count: Math.max(1, Number(e.target.value) || 1) })}
                      className="input-dark"
                    />
                  </div>
                )}
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">补充备注</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="可选"
                  className="input-dark"
                  rows={2}
                />
              </div>

              {/* 上架状态 */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">上架状态</span>
                <button
                  onClick={() => setForm({ ...form, status: form.status === 'active' ? 'inactive' : 'active' })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.status === 'active' ? 'bg-primary-600' : 'bg-[var(--border-color)]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.status === 'active' ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            {/* 底部按钮 - 固定底部 */}
            <div className="flex gap-2 p-4 md:p-6 pt-3 border-t border-[var(--border-color)] flex-shrink-0">
              <button onClick={() => { setShowModal(false); resetForm() }} className="flex-1 px-4 py-2 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">取消</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 text-sm rounded-lg bg-[#6B4C9A] text-white hover:bg-[#5a3f85]">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="确认删除"
        message="删除后无法恢复，确定要删除这个兑换项目吗？"
        type="warning"
      />

      {/* 重置确认 */}
      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
        title="重置全部 Poin 数据"
        message="此操作将清空您的 Poin 余额、商店奖品、背包所有奖励与豁免券、全部收支日志，恢复初始状态，且不可恢复。确定要重置吗？"
        type="danger"
      />

      {/* 撤回记录确认 */}
      <ConfirmDialog
        isOpen={!!confirmReverse}
        onClose={() => setConfirmReverse(null)}
        onConfirm={() => confirmReverse && handleReverse(confirmReverse)}
        title="撤回 Poin 记录"
        message="撤回将反向修正该记录的余额变动（如原记录为+5则扣除5，原记录为-5则返还5），并把原记录标记为灰色划线，不再生成新的撤回流水。此操作不可重复，确定要撤回吗？"
        type="warning"
      />

      {/* Poin 设置弹窗 */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            {/* 弹窗标题 - 固定顶部 */}
            <div className="flex items-center justify-between p-4 md:p-6 pb-3 border-b border-[var(--border-color)] flex-shrink-0">
              <h3 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">Poin 设置</h3>
              <button onClick={() => setShowSettings(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X size={20} />
              </button>
            </div>
            {/* 设置内容 - 可滚动 */}
            <div className="p-4 md:p-6 space-y-3 md:space-y-4 overflow-y-auto flex-1">
              {/* 允许透支 */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">允许透支</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">开启后余额可为负数；关闭后余额不足时禁止打卡消极习惯</p>
                </div>
                <button
                  onClick={() => handlePoinSettingChange('allow_overdraft', !config.allow_overdraft)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-3 ${config.allow_overdraft ? 'bg-primary-600' : 'bg-[var(--border-color)]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.allow_overdraft ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* 留存收支日志 */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">留存收支日志</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">开启后记录所有 Poin 收支明细；关闭后不再记录</p>
                </div>
                <button
                  onClick={() => handlePoinSettingChange('save_log', !config.save_log)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-3 ${config.save_log ? 'bg-primary-600' : 'bg-[var(--border-color)]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.save_log ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-[var(--border-color)] my-2" />

              {/* 重置全部数据 */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-danger">重置全部 Poin 数据</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">清空余额、商店奖品、背包库存、收支记录，恢复初始状态</p>
                </div>
                <button
                  onClick={() => { setShowSettings(false); setConfirmReset(true) }}
                  className="px-3 py-1.5 text-xs bg-danger/10 text-danger rounded-button hover:bg-danger/20 transition-colors flex-shrink-0 ml-3"
                >
                  重置
                </button>
              </div>
            </div>
            {/* 底部按钮 - 固定底部 */}
            <div className="flex gap-2 p-4 md:p-6 pt-3 border-t border-[var(--border-color)] flex-shrink-0">
              <button onClick={() => setShowSettings(false)} className="flex-1 px-4 py-2 text-sm rounded-lg bg-[#6B4C9A] text-white hover:bg-[#5a3f85]">完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PoinShop
