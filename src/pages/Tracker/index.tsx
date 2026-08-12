import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrackerStore, useAppStore, usePoinStore } from '@/store'
import { syncDelete, syncUpsert, trackerCategoryToDb, trackerEntryToDb } from '@/lib/sync'
import { supabase } from '@/lib/supabase'
import { earnPoin, deductPoin, refundPoin } from '@/lib/poin'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '@/components/Modal/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useDragReorder } from '@/hooks/useDragReorder'
import {
  Plus, Trash, Edit, Clock, Activity, Droplets, Cigarette,
  Coffee, Pill, Utensils, Bike, HeartPulse, BookOpen, Smartphone, X,
  Smile, Frown, Zap, Heart, Meh, AlertCircle, Briefcase, Dumbbell,
  Users, Palette, Car, Armchair, Sparkles, Battery, Cloud, CloudRain,
  Snowflake, Wind, Sun, Moon, BarChart2, Move, Coins
} from '@/utils/icons'
import type { TrackerCategory } from '@/types'
import { generateUUID } from '@/lib/utils'

const iconComponents: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Activity, Droplets, Cigarette, Coffee, Pill, Utensils, Bike,
  HeartPulse, BookOpen, Smartphone,
  // 情绪类
  Smile, Frown, Zap, Heart, Meh, AlertCircle,
  // 活动类
  Briefcase, Dumbbell, Users, Palette, Car, Armchair,
  // 健康类
  Sparkles, Battery,
  // 天气类
  Cloud, CloudRain, Snowflake, Wind, Sun, Moon
}

const defaultColors = ['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6']

const TrackerPage: React.FC = () => {
  /* Desktop-only */
  const navigate = useNavigate()
  const { categories, entries, addCategory, updateCategory, deleteCategory, addEntry, deleteEntry, reorderCategories } = useTrackerStore()
  const { user, settings, addNotification } = useAppStore()
  // 获取各板块功能开关
  const flags = settings.featureFlags || {}

  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<TrackerCategory | null>(null)
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null)
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [entryCategoryId, setEntryCategoryId] = useState<string | null>(null)
  const [entryTimestamp, setEntryTimestamp] = useState('')
  const [entryNote, setEntryNote] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterDate, setFilterDate] = useState('')
  const [showAllIcons, setShowAllIcons] = useState(false)
  const [filterTracker, setFilterTracker] = useState<string>('')

  const [form, setForm] = useState({
    name: '', icon: 'Activity', color: '#3B82F6', unit: '次',
    reward_poin: 0, deduct_poin: 0
  })

  // 按 sort_order 排序后的有效分类（同时用于拖拽排序与渲染）
  const activeCategories = categories
    .filter(c => !c.deleted_at)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))

  // 分类拖拽排序
  const { dragIndex, draggedOver, handleDragStart, handleDragOver, handleDrop, handleDragEnd } = useDragReorder(activeCategories, reorderCategories)

  // 如果没有类别，自动创建几个默认的
  const effectiveCategories = activeCategories.length > 0 ? activeCategories : []

  // 图标列表：默认只显示前 10 个（约 2 行），可展开全部
  const allIcons = Object.keys(iconComponents)
  const visibleIcons = showAllIcons ? allIcons : allIcons.slice(0, 10)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 今日记录
  const todayEntries = entries.filter(e => {
    if (e.deleted_at) return false
    const d = new Date(e.timestamp)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return ds === todayStr
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // 日期筛选后的记录
  const filteredEntries = filterDate
    ? entries.filter(e => {
        if (e.deleted_at) return false
        const d = new Date(e.timestamp)
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return ds === filterDate
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : todayEntries

  // 记录项筛选后的记录
  const filteredRecords = filterTracker
    ? filteredEntries.filter(e => e.category_id === filterTracker)
    : filteredEntries

  // 按类别分组今日记录数
  const todayCountByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    todayEntries.forEach(e => {
      map[e.category_id] = (map[e.category_id] || 0) + 1
    })
    return map
  }, [todayEntries])

  const resetForm = () => {
    setForm({ name: '', icon: 'Activity', color: '#3B82F6', unit: '次', reward_poin: 0, deduct_poin: 0 })
    setEditingCategory(null)
    setShowAllIcons(false)
  }

  const handleSaveCategory = () => {
    if (!form.name.trim()) return
    const poinData = {
      reward_poin: Number(form.reward_poin) || 0,
      deduct_poin: Number(form.deduct_poin) || 0,
    }
    if (editingCategory) {
      updateCategory(editingCategory.id, { name: form.name, icon: form.icon, color: form.color, unit: form.unit, ...poinData })
      if (user) {
        const updatedCategory = { ...editingCategory, name: form.name, icon: form.icon, color: form.color, unit: form.unit, ...poinData, updated_at: new Date().toISOString() }
        syncUpsert('tracker_categories', user.id, updatedCategory, trackerCategoryToDb).then(r => {
          if (!r.success) console.error('[Tracker] Failed to sync category update:', r.error)
        })
      }
    } else {
      const newCategory = {
        id: generateUUID(),
        user_id: user?.id || 'current-user',
        name: form.name,
        icon: form.icon,
        color: form.color,
        unit: form.unit,
        ...poinData,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      addCategory(newCategory)
      if (user) {
        syncUpsert('tracker_categories', user.id, newCategory, trackerCategoryToDb).then(r => {
          if (!r.success) console.error('[Tracker] Failed to sync category:', r.error)
        })
      }
    }
    setShowCategoryModal(false)
    resetForm()
  }

  const handleQuickRecord = async (categoryId: string) => {
    const newEntry = {
      id: generateUUID(),
      user_id: user?.id || 'current-user',
      category_id: categoryId,
      timestamp: new Date().toISOString(),
      note: '',
      deleted_at: null,
      created_at: new Date().toISOString()
    }
    addEntry(newEntry)
    if (user) {
      syncUpsert('tracker_entries', user.id, newEntry, trackerEntryToDb).then(r => {
        if (!r.success) console.error('[Tracker] Failed to sync entry:', r.error)
      })
      // Poin 奖惩
      const poinConfig = usePoinStore.getState().config
      if (poinConfig.enable) {
        const cat = activeCategories.find(c => c.id === categoryId)
        if (cat) {
          const reward = cat.reward_poin ?? 0
          const deduct = cat.deduct_poin ?? 0
          if (reward > 0) {
            earnPoin(user.id, reward, 'tracker', newEntry.id, `实时记录：${cat.name}`).catch(e => console.error('[Tracker] earnPoin error:', e))
          }
          if (deduct > 0) {
            deductPoin(user.id, deduct, 'tracker', newEntry.id, `实时记录：${cat.name}`).catch(e => {
              if (e.message === 'POIN_INSUFFICIENT') {
                addNotification({ message: 'Poin 余额不足，无法记录此项', type: 'warning' })
              } else {
                console.error('[Tracker] deductPoin error:', e)
              }
            })
          }
        }
      }
    }
  }

  const openEntryModal = (categoryId: string) => {
    setEntryCategoryId(categoryId)
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    setEntryTimestamp(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`)
    setEntryNote('')
    setShowEntryModal(true)
  }

  const handleSaveEntry = () => {
    if (!entryCategoryId || !entryTimestamp) return
    const newEntry = {
      id: generateUUID(),
      user_id: user?.id || 'current-user',
      category_id: entryCategoryId,
      timestamp: new Date(entryTimestamp).toISOString(),
      note: entryNote,
      deleted_at: null,
      created_at: new Date().toISOString()
    }
    addEntry(newEntry)
    if (user) {
      syncUpsert('tracker_entries', user.id, newEntry, trackerEntryToDb).then(r => {
        if (!r.success) console.error('[Tracker] Failed to sync entry:', r.error)
      })
      // Poin 奖惩
      const poinConfig = usePoinStore.getState().config
      if (poinConfig.enable) {
        const cat = activeCategories.find(c => c.id === entryCategoryId)
        if (cat) {
          const reward = cat.reward_poin ?? 0
          const deduct = cat.deduct_poin ?? 0
          if (reward > 0) {
            earnPoin(user.id, reward, 'tracker', newEntry.id, `实时记录：${cat.name}`).catch(e => console.error('[Tracker] earnPoin error:', e))
          }
          if (deduct > 0) {
            deductPoin(user.id, deduct, 'tracker', newEntry.id, `实时记录：${cat.name}`).catch(e => {
              if (e.message === 'POIN_INSUFFICIENT') {
                addNotification({ message: 'Poin 余额不足，无法记录此项', type: 'warning' })
              } else {
                console.error('[Tracker] deductPoin error:', e)
              }
            })
          }
        }
      }
    }
    setShowEntryModal(false)
    setEntryCategoryId(null)
    setEntryNote('')
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredRecords.map(e => e.id)))
  }

  const exitBatchMode = () => {
    setBatchMode(false)
    setSelectedIds(new Set())
    setConfirmBatchDelete(false)
  }

  const handleBatchDelete = () => {
    selectedIds.forEach(id => {
      deleteEntry(id)
      if (user) {
        syncDelete('tracker_entries', id, user.id).catch(e =>
          console.error('[Tracker] Failed to batch delete entry:', e)
        )
      }
    })
    exitBatchMode()
    setConfirmBatchDelete(false)
  }

  // 获取类别的近7天记录数
  const getWeekCounts = (categoryId: string) => {
    const counts: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const count = entries.filter(e => {
        if (e.deleted_at || e.category_id !== categoryId) return false
        const ed = new Date(e.timestamp)
        const eds = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`
        return eds === ds
      }).length
      counts.push(count)
    }
    return counts
  }

  const getCategoryEntries = (categoryId: string) => {
    return entries
      .filter(e => !e.deleted_at && e.category_id === categoryId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
  }

  return (
    <div className="page-container">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-6">
          <div>
            <h1 className="page-title mb-2">实时记录</h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-600/10 text-primary-600">
                {activeCategories.length} 个记录项
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                今日已记录 {todayEntries.length} 次
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <button onClick={() => navigate('/tracker/stats')} className="text-xs md:text-sm text-[#6B4C9A] hover:text-[#5a3f85] flex items-center gap-1 min-h-[36px] md:min-h-0 px-1">
              <BarChart2 size={14} />
              <span>统计</span>
            </button>
            <button onClick={() => { resetForm(); setShowCategoryModal(true) }} className="btn-primary text-xs md:text-sm flex items-center gap-1.5">
              <Plus size={14} /> 新建
            </button>
          </div>
        </div>

        {/* 类别卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4 mb-6">
          <AnimatePresence>
            {effectiveCategories.map((cat, index) => {
              const Icon = iconComponents[cat.icon] || Activity
              const todayCount = todayCountByCategory[cat.id] || 0
              const weekCounts = getWeekCounts(cat.id)
              const maxWeek = Math.max(...weekCounts, 1)
              return (
                <motion.div key={cat.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  draggable={true}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  className={`card-hover relative group ${dragIndex === index ? 'opacity-40' : ''} ${draggedOver === index ? 'ring-2 ring-primary-500' : ''}`}>
                  {/* 拖拽手柄（仅 hover 显示，整个卡片可拖动） */}
                  <div className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] hidden md:block">
                    <Move size={14} />
                  </div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-button flex items-center justify-center" style={{ backgroundColor: cat.color + '20', color: cat.color }}>
                      <Icon size={20} />
                    </div>
                    <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEntryModal(cat.id)}
                        className="p-2 md:p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] min-h-[36px] md:min-h-0 flex items-center justify-center" title="详细记录">
                        <Clock size={16} className="md:!w-3.5 md:!h-3.5" />
                      </button>
                      <button onClick={() => {
                        setEditingCategory(cat)
                        setForm({ name: cat.name, icon: cat.icon, color: cat.color, unit: cat.unit, reward_poin: cat.reward_poin ?? 0, deduct_poin: cat.deduct_poin ?? 0 })
                        setShowCategoryModal(true)
                      }} className="p-2 md:p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] min-h-[36px] md:min-h-0 flex items-center justify-center">
                        <Edit size={16} className="md:!w-3.5 md:!h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteCategory(cat.id)}
                        className="p-2 md:p-1 rounded hover:bg-red-50 text-[var(--text-tertiary)] hover:text-danger min-h-[36px] md:min-h-0 flex items-center justify-center">
                        <Trash size={16} className="md:!w-3.5 md:!h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">{cat.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    今日 {todayCount} {cat.unit}
                  </p>
                  {/* Poin 奖惩标注 */}
                  {usePoinStore.getState().config.enable && ((cat.reward_poin ?? 0) > 0 || (cat.deduct_poin ?? 0) > 0) && (
                    <div className="flex items-center gap-1 mt-1">
                      {(cat.reward_poin ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                          <Coins size={10} /> +{cat.reward_poin}
                        </span>
                      )}
                      {(cat.deduct_poin ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                          <Coins size={10} /> -{cat.deduct_poin}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 近7天热力图：受 trackerHeatmap 开关控制 */}
                  {flags.trackerHeatmap !== false && (<>
                  <div className="flex gap-0.5 md:gap-1 mt-2">
                    {weekCounts.map((c, i) => {
                      const dayLabel = new Date(Date.now() - (6 - i) * 86400000)
                      const label = `${dayLabel.getMonth() + 1}/${dayLabel.getDate()}`
                      const isToday = i === 6
                      // 零记录用浅灰底色，有记录用同一色系从浅到深渐变
                      const ratio = maxWeek > 0 ? c / maxWeek : 0
                      const bgColor = c === 0
                        ? '#e5e7eb'
                        : (() => {
                            // 将类别颜色转换为更明显的深浅梯度
                            const hex = cat.color.replace('#', '')
                            const r = parseInt(hex.substring(0, 2), 16)
                            const g = parseInt(hex.substring(2, 4), 16)
                            const b = parseInt(hex.substring(4, 6), 16)
                            // 混合白色和类别颜色，ratio越高越接近原色
                            const mr = Math.round(255 - (255 - r) * (0.3 + ratio * 0.7))
                            const mg = Math.round(255 - (255 - g) * (0.3 + ratio * 0.7))
                            const mb = Math.round(255 - (255 - b) * (0.3 + ratio * 0.7))
                            return `rgb(${mr}, ${mg}, ${mb})`
                          })()
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className={`text-[8px] md:text-[9px] whitespace-nowrap ${isToday ? 'text-primary-600 font-medium' : 'text-[var(--text-tertiary)]'}`}>
                            {label}
                          </span>
                          <div
                            className="w-full aspect-square rounded-sm transition-all relative group/bar flex items-center justify-center"
                            style={{
                              backgroundColor: bgColor,
                              opacity: c === 0 ? 1 : 1
                            }}
                            title={`${label}${isToday ? '(今天)' : ''}: ${c}${cat.unit}`}
                          >
                            <span className={`text-[9px] md:text-xs font-medium leading-none select-none ${c === 0 ? 'text-gray-400' : 'text-white'}`}>
                              {c > 0 ? c : ''}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    近7天 {weekCounts.reduce((a, b) => a + b, 0)} {cat.unit} · 颜色越深代表记录越多
                  </p>
                  </>)}

                  <button onClick={() => handleQuickRecord(cat.id)}
                    className="w-full mt-3 py-2 md:py-1.5 text-xs md:text-xs font-medium rounded-button transition-colors min-h-[40px] md:min-h-0"
                    style={{ backgroundColor: cat.color + '15', color: cat.color }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = cat.color + '30' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = cat.color + '15' }}>
                    + 快速记录
                  </button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {effectiveCategories.length === 0 && (
          <div className="empty-state mb-6">
            <Activity size={32} className="text-[var(--text-tertiary)] mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">还没有记录项，点击右上角新建</p>
          </div>
        )}

        {/* 记录历史 */}
        <div className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="section-title flex-shrink-0">{filterDate ? `${filterDate} 记录` : '今日记录'}</h2>
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0 md:flex-wrap flex-nowrap">
              {/* 记录项筛选 */}
              <select
                value={filterTracker}
                onChange={e => setFilterTracker(e.target.value)}
                className="px-2 py-1.5 md:py-1 text-xs rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] flex-shrink-0"
              >
                <option value="">全部记录项</option>
                {activeCategories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-2 py-1.5 md:py-1 text-xs rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] flex-shrink-0"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex-shrink-0 min-h-[32px] px-1"
                >
                  清除
                </button>
              )}
              {filteredRecords.length > 0 && (
                <>
                  {batchMode && (
                    <button onClick={() => setConfirmBatchDelete(true)}
                      className="text-xs text-danger hover:text-danger/80 transition-colors font-medium flex-shrink-0 min-h-[32px] px-1">
                      批量删除
                    </button>
                  )}
                  <button
                    onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
                    className={`text-xs transition-colors flex-shrink-0 min-h-[32px] px-1 ${batchMode ? 'text-primary-600 hover:text-primary-700 font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                    {batchMode ? '退出选择' : '批量选择'}
                  </button>
                </>
              )}
            </div>
          </div>
          {filteredRecords.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] py-4 text-center">今日暂无记录</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {filteredRecords.map(entry => {
                const cat = categories.find(c => c.id === entry.category_id)
                if (!cat || cat.deleted_at) return null
                const Icon = iconComponents[cat.icon] || Activity
                const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                const isSelected = selectedIds.has(entry.id)
                return (
                  <div key={entry.id}
                    className={`flex items-center justify-between py-2 px-3 rounded transition-colors ${
                      isSelected ? 'bg-primary-600/10' : 'hover:bg-[var(--bg-tertiary)]/50'
                    }`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {batchMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(entry.id)}
                          className="w-5 h-5 md:w-4 md:h-4 rounded border-[var(--border-color)] text-primary-600 focus:ring-primary-600 cursor-pointer flex-shrink-0"
                        />
                      )}
                      <div className="w-8 h-8 rounded-button flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + '15', color: cat.color }}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{cat.name}</span>
                        {entry.note && (
                          <span
                            className={`block text-xs text-[var(--text-secondary)] mt-0.5 cursor-pointer ${expandedId === entry.id ? '' : 'line-clamp-2'}`}
                            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          >
                            {entry.note}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-[var(--text-tertiary)]">{time}</span>
                      {!batchMode && (
                        <button onClick={() => setConfirmDeleteEntry(entry.id)}
                          className="p-1.5 md:p-1 rounded hover:bg-danger/10 text-[var(--text-tertiary)] hover:text-danger min-h-[36px] md:min-h-0 flex items-center justify-center">
                          <X size={14} className="md:!w-3 md:!h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 各类别详细历史 */}
        {effectiveCategories.map(cat => {
          const catEntries = getCategoryEntries(cat.id)
          if (catEntries.length === 0) return null
          const Icon = iconComponents[cat.icon] || Activity
          return (
            <div key={cat.id} className="card mt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-button flex items-center justify-center" style={{ backgroundColor: cat.color + '15', color: cat.color }}>
                  <Icon size={14} />
                </div>
                <h3 className="text-sm font-medium text-[var(--text-primary)]">{cat.name} — 最近记录</h3>
              </div>
              <div className="space-y-1">
                {catEntries.map(entry => {
                  const d = new Date(entry.timestamp)
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
                  return (
                    <div key={entry.id} className="flex items-center justify-between text-sm py-1.5 md:py-1 px-2 rounded hover:bg-[var(--bg-tertiary)]/30">
                      <span className="text-[var(--text-secondary)] flex-shrink-0">{dateStr}</span>
                      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end ml-2">
                        {entry.note && (
                          <span
                            className={`text-xs text-[var(--text-tertiary)] cursor-pointer truncate ${expandedId === entry.id ? 'whitespace-normal' : 'truncate'}`}
                            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          >
                            {entry.note}
                          </span>
                        )}
                        <button onClick={() => setConfirmDeleteEntry(entry.id)}
                          className="p-1.5 md:p-0.5 text-danger hover:bg-danger/10 rounded flex-shrink-0 min-h-[32px] md:min-h-0 flex items-center justify-center">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

      </div>

      {/* 新建/编辑类别弹窗 */}
      <Modal isOpen={showCategoryModal} onClose={() => { setShowCategoryModal(false); resetForm() }}
        title={editingCategory ? '编辑记录项' : '新建记录项'}
        footer={<>
          <button onClick={() => { setShowCategoryModal(false); resetForm() }} className="btn-secondary">取消</button>
          <button onClick={handleSaveCategory} className="btn-primary">{editingCategory ? '保存' : '创建'}</button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">名称</label>
              <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：喝水、抽烟" className="input-dark" />
            </div>
            {/* 单位输入：受 trackerUnit 开关控制 */}
            {flags.trackerUnit !== false && (
            <div>
              <label className="block text-sm font-medium mb-1.5">单位</label>
              <input type="text" value={form.unit} onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
                placeholder="例如：杯、支、次" className="input-dark" />
            </div>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">图标</label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {visibleIcons.map(iconName => {
                  const IconComp = iconComponents[iconName]
                  return (
                    <button key={iconName} onClick={() => setForm(prev => ({ ...prev, icon: iconName }))}
                      className={`p-2 rounded-button border-2 transition-all flex items-center justify-center min-h-[44px] ${
                        form.icon === iconName ? 'border-primary-600 bg-primary-600/5' : 'border-[var(--border-color)]'
                      }`}>
                      <IconComp size={18} className={form.icon === iconName ? 'text-primary-600' : 'text-[var(--text-secondary)]'} />
                    </button>
                  )
                })}
              </div>
              {!showAllIcons && form.icon && !visibleIcons.includes(form.icon) && (
                <div className="mt-2 text-xs text-[var(--text-tertiary)]">
                  当前选中：
                  <span className="inline-flex items-center gap-1 ml-1 text-primary-600">
                    {(() => { const IC = iconComponents[form.icon]; return IC ? <IC size={14} /> : null })()}
                  </span>
                </div>
              )}
              {allIcons.length > 10 && (
                <div className="flex justify-end">
                  <button onClick={() => setShowAllIcons(!showAllIcons)} className="text-xs text-[#6B4C9A] min-h-[36px] px-1">
                    {showAllIcons ? '收起' : '显示全部'}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">颜色</label>
              <div className="flex gap-2 flex-wrap">
                {defaultColors.map(c => (
                  <button key={c} onClick={() => setForm(prev => ({ ...prev, color: c }))}
                    className={`w-9 h-9 md:w-8 md:h-8 rounded-full border-2 transition-all min-h-[44px] md:min-h-0 ${form.color === c ? 'border-[var(--text-primary)] scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          {/* Poin 奖惩设置：仅在 Poin 系统开启时显示 */}
          {usePoinStore.getState().config.enable && (
          <div className="space-y-3 pt-2 border-t border-[var(--border-color)]">
            <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              <Coins size={14} className="text-primary-600" />
              <span>Poin 奖惩</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>奖励 Poin</label>
                <input type="number" min={0} value={form.reward_poin || ''}
                  onChange={e => setForm(prev => ({ ...prev, reward_poin: Math.max(0, Number(e.target.value) || 0) }))}
                  placeholder="0" className="input-dark" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>扣除 Poin</label>
                <input type="number" min={0} value={form.deduct_poin || ''}
                  onChange={e => setForm(prev => ({ ...prev, deduct_poin: Math.max(0, Number(e.target.value) || 0) }))}
                  placeholder="0" className="input-dark" />
              </div>
            </div>
          </div>
          )}
        </div>
      </Modal>

      {/* 详细记录弹窗 */}
      <Modal isOpen={showEntryModal} onClose={() => { setShowEntryModal(false); setEntryCategoryId(null) }}
        title="详细记录"
        footer={<>
          <button onClick={() => { setShowEntryModal(false); setEntryCategoryId(null) }} className="btn-secondary">取消</button>
          <button onClick={handleSaveEntry} className="btn-primary">确认记录</button>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">时间</label>
            <input type="datetime-local" value={entryTimestamp}
              onChange={e => setEntryTimestamp(e.target.value)} className="input-dark" />
          </div>
          {/* 备注输入：受 trackerNote 开关控制 */}
          {flags.trackerNote !== false && (
          <div>
            <label className="block text-sm font-medium mb-1.5">备注（可选）</label>
            <input type="text" value={entryNote} onChange={e => setEntryNote(e.target.value)}
              placeholder="例如：饭后一支、喝了一瓶水" className="input-dark" />
          </div>
          )}
        </div>
      </Modal>

      {confirmDeleteCategory && (
        <ConfirmDialog isOpen={true} onClose={() => setConfirmDeleteCategory(null)}
          onConfirm={async () => {
            const catId = confirmDeleteCategory
            deleteCategory(catId)
            setConfirmDeleteCategory(null)
            // 云端硬删除分类 + 该分类下所有记录
            if (user) {
              syncDelete('tracker_categories', catId, user.id)
              // 批量删除该分类下的 tracker_entries
              try {
                await supabase.from('tracker_entries').delete().eq('category_id', catId).eq('user_id', user.id)
              } catch (e) {
                console.error('[Tracker] Failed to delete entries for category:', e)
              }
            }
          }}
          title="确认删除" message="删除后该记录项及所有历史记录将被彻底删除，无法恢复。" type="danger" />
      )}

      {confirmDeleteEntry && (
        <ConfirmDialog isOpen={true} onClose={() => setConfirmDeleteEntry(null)}
          onConfirm={() => {
            deleteEntry(confirmDeleteEntry)
            if (user) {
              syncDelete('tracker_entries', confirmDeleteEntry, user.id).then(r => {
                if (!r.success) console.error('[Tracker] Failed to delete entry from cloud:', r.error)
              })
              // Poin 退还
              const poinConfig = usePoinStore.getState().config
              if (poinConfig.enable) {
                refundPoin(user.id, 'tracker', confirmDeleteEntry, '删除实时记录').catch(e => console.error('[Tracker] refundPoin error:', e))
              }
            }
            setConfirmDeleteEntry(null)
          }}
          title="确认删除" message="删除这条记录？" type="danger" />
      )}

      {confirmBatchDelete && (
        <ConfirmDialog isOpen={true} onClose={() => setConfirmBatchDelete(false)}
          onConfirm={handleBatchDelete}
          title="确认批量删除" message={`确定要删除选中的 ${selectedIds.size} 条记录吗？此操作无法撤销。`} type="danger" />
      )}

      {/* 批量操作栏 */}
      <AnimatePresence>
        {batchMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 md:py-2.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-lg max-w-[calc(100vw-2rem)]"
          >
            <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">已选择 {selectedIds.size} 条</span>
            <button onClick={selectAll} className="text-sm text-primary-600 hover:text-primary-700 font-medium min-h-[36px] px-1">全选</button>
            <button onClick={exitBatchMode} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] min-h-[36px] px-1">取消</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default TrackerPage
