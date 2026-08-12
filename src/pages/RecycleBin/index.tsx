import React, { useState, useEffect } from 'react'
import { useRecycleBinStore, useTodoStore, useScheduleStore, usePlanStore, useHabitStore, useNoteStore } from '@/store'
import { motion } from 'framer-motion'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Trash2, RotateCcw, Trash, Clock } from '@/utils/icons'

const RecycleBin: React.FC = () => {
  const { items, restoreItem, permanentDelete } = useRecycleBinStore()
  const { updateTask } = useTodoStore()
  const { updateSchedule } = useScheduleStore()
  const { updatePlan } = usePlanStore()
  const { updateHabit } = useHabitStore()
  const { updateNote, updateWall } = useNoteStore()

  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmPermanent, setConfirmPermanent] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(interval)
  }, [])

  const getRemainingDays = (deletedAt: string) => {
    const deleted = new Date(deletedAt).getTime()
    const expires = deleted + 7 * 24 * 60 * 60 * 1000
    const remaining = Math.ceil((expires - now) / (24 * 60 * 60 * 1000))
    return Math.max(0, remaining)
  }

  const handleRestore = (item: typeof items[0]) => {
    // 根据类型恢复对应数据
    switch (item.type) {
      case 'task':
        updateTask(item.id, { deleted_at: null })
        break
      case 'schedule':
        updateSchedule(item.id, { deleted_at: null })
        break
      case 'plan':
        updatePlan(item.id, { deleted_at: null })
        break
      case 'habit':
        updateHabit(item.id, { deleted_at: null })
        break
      case 'note':
        updateNote(item.id, { deleted_at: null })
        break
      case 'note_wall':
        updateWall(item.id, { deleted_at: null })
        break
    }
    restoreItem(item.id)
  }

  const typeLabels: Record<string, string> = {
    task: '任务待办',
    schedule: '日历日程',
    plan: '宏观规划',
    habit: '习惯记录',
    note: '随心贴',
    note_wall: '主题墙'
  }

  // 按类型筛选：仅展示 items 中实际存在的类型
  const availableTypes = Array.from(new Set(items.map(i => i.type)))
  // 若当前筛选的类型已无项目（如恢复/删除后），回退到「全部」
  const effectiveFilter = filterType === 'all' || availableTypes.includes(filterType) ? filterType : 'all'
  const filteredItems = effectiveFilter === 'all' ? items : items.filter(i => i.type === effectiveFilter)

  return (
    <div className="page-container">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 lg:mb-6">
          <div>
            <h1 className="page-title mb-1">回收站</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {items.length} 个项目 · 7天后自动永久清除
            </p>
          </div>
          {items.length > 0 && (
            <button onClick={() => setConfirmClear(true)} className="btn-danger flex items-center gap-2 self-start lg:self-auto">
              <Trash size={16} />
              清空回收站
            </button>
          )}
        </div>

        {/* 按类型筛选：移动端水平滚动，桌面端自动换行 */}
        {items.length > 0 && availableTypes.length > 1 && (
          <div className="flex gap-2 overflow-x-auto lg:flex-wrap pb-2 mb-3 lg:mb-4 -mx-1 px-1 lg:mx-0 lg:px-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1.5 ${
                effectiveFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              全部
              <span className={`text-xs ${effectiveFilter === 'all' ? 'opacity-80' : 'opacity-60'}`}>{items.length}</span>
            </button>
            {availableTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1.5 ${
                  effectiveFilter === type
                    ? 'bg-primary-600 text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {typeLabels[type] || type}
                <span className={`text-xs ${effectiveFilter === type ? 'opacity-80' : 'opacity-60'}`}>{items.filter(i => i.type === type).length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {filteredItems.map((item) => {
            const remainingDays = getRemainingDays(item.deleted_at)
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-hover"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-button bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                      <Trash2 size={18} className="text-[var(--text-tertiary)]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</span>
                        <span className="tag-pill text-xs whitespace-nowrap flex-shrink-0">{typeLabels[item.type] || item.type}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock size={12} className="text-[var(--text-tertiary)] flex-shrink-0" />
                        <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                          {remainingDays > 0 ? `${remainingDays} 天后永久清除` : '即将清除'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRestore(item)}
                      className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                      <RotateCcw size={14} />
                      恢复
                    </button>
                    <button
                      onClick={() => setConfirmPermanent(item.id)}
                      className="p-2.5 rounded-button hover:bg-red-50 text-[var(--text-tertiary)] hover:text-danger flex items-center justify-center"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}

          {items.length === 0 && (
            <div className="empty-state">
              <Trash2 size={48} className="text-[var(--text-tertiary)] mb-3" />
              <p className="text-[var(--text-secondary)]">回收站是空的</p>
            </div>
          )}

          {items.length > 0 && filteredItems.length === 0 && (
            <div className="empty-state">
              <Trash2 size={48} className="text-[var(--text-tertiary)] mb-3" />
              <p className="text-[var(--text-secondary)]">该类型下暂无项目</p>
            </div>
          )}
        </div>
      </div>

      {/* 清空确认 */}
      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          items.forEach(item => permanentDelete(item.id))
          setConfirmClear(false)
        }}
        title="清空回收站"
        message="此操作不可撤销，所有项目将被永久删除。"
        type="danger"
        confirmText="永久删除全部"
      />

      {/* 单个永久删除确认 */}
      {confirmPermanent && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmPermanent(null)}
          onConfirm={() => {
            permanentDelete(confirmPermanent)
            setConfirmPermanent(null)
          }}
          title="永久删除"
          message="此操作不可撤销，项目将被永久删除。"
          type="danger"
        />
      )}
    </div>
  )
}

export default RecycleBin
