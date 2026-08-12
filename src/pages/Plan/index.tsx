import React, { useState } from 'react'
import { usePlanStore, useTodoStore, useScheduleStore, useRecycleBinStore, useAppStore } from '@/store'
import { syncDelete, syncUpsert, planToDb, taskToDb, scheduleToDb } from '@/lib/sync'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '@/components/Modal/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  Plus, Target, Edit, Trash,
  CheckSquare, Calendar
} from '@/utils/icons'
import type { Plan } from '@/types'
import { generateUUID } from '@/lib/utils'

const PlanPage: React.FC = () => {
  /* Desktop-only */
  const { plans, addPlan, updatePlan, deletePlan } = usePlanStore()
  const { user, settings } = useAppStore()
  // 获取各板块功能开关
  const flags = settings.featureFlags || {}
  const { addItem } = useRecycleBinStore()
  const { addTask } = useTodoStore()
  const { addSchedule } = useScheduleStore()
  const [showModal, setShowModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'unscheduled'>('all')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [migrateModal, setMigrateModal] = useState<{ plan: Plan; target: 'task' | 'schedule' } | null>(null)
  const [migrateStartDate, setMigrateStartDate] = useState('')
  const [migrateEndDate, setMigrateEndDate] = useState('')

  const [form, setForm] = useState({
    title: '',
    content: '',
    priority: '' as Plan['priority'] | '',
    tags: [] as string[],
    tagInput: ''
  })

  const activePlans = plans.filter(p => !p.deleted_at)
  const allTags = [...new Set(activePlans.flatMap(p => p.tags || []))]
  const filteredPlans = activePlans.filter(p => {
    if (filterStatus === 'scheduled') return p.is_scheduled
    if (filterStatus === 'unscheduled') return !p.is_scheduled
    return true
  }).filter(p => {
    if (!filterTag) return true
    return (p.tags || []).includes(filterTag)
  })

  const resetForm = () => {
    setForm({ title: '', content: '', priority: '', tags: [], tagInput: '' })
    setEditingPlan(null)
  }

  const handleSave = () => {
    if (!form.title.trim()) return
    const saveData = {
      title: form.title,
      content: form.content,
      priority: form.priority || ('medium' as Plan['priority']),
      tags: form.tags || []
    }
    if (editingPlan) {
      const updatedPlan = { ...editingPlan, ...saveData, updated_at: new Date().toISOString() }
      updatePlan(editingPlan.id, { ...saveData })
      if (user) {
        syncUpsert('plans', user.id, updatedPlan, planToDb).then(r => {
          if (!r.success) console.error('[Plan] Failed to sync plan:', r.error)
        })
      }
    } else {
      const newPlan = {
        id: generateUUID(),
        user_id: user?.id || 'current-user',
        ...saveData,
        is_scheduled: false,
        scheduled_to: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      addPlan(newPlan)
      if (user) {
        syncUpsert('plans', user.id, newPlan, planToDb).then(r => {
          if (!r.success) console.error('[Plan] Failed to sync plan:', r.error)
        })
      }
    }
    setShowModal(false)
    resetForm()
  }

  const handleDelete = (plan: Plan) => {
    deletePlan(plan.id)
    addItem({ id: plan.id, type: 'plan', title: plan.title, data: plan })
    if (user) {
      syncDelete('plans', plan.id, user.id).then(r => {
        if (!r.success) console.error('[Plan] Failed to hard delete from cloud:', r.error)
      })
    }
    setConfirmDelete(null)
  }

  const handleMigrate = (plan: Plan, target: 'task' | 'schedule') => {
    if (target === 'task') {
      // 转待办：直接创建任务
      const now = new Date()
      const newTask = {
        id: generateUUID(),
        user_id: user?.id || 'current-user',
        title: plan.title,
        content: plan.content || '',
        priority: plan.priority || 'medium',
        tags: [...(plan.tags || [])],
        subtasks: [],
        is_completed: false,
        completed_at: null,
        is_archived: false,
        archived_at: null,
        deleted_at: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      }
      addTask(newTask)
      if (user) {
        syncUpsert('tasks', user.id, newTask, taskToDb).then(r => {
          if (!r.success) console.error('[Plan] Failed to sync task:', r.error)
        })
      }
      const updatedPlanForTask = { ...plan, is_scheduled: true, scheduled_to: 'task', updated_at: now.toISOString() }
      updatePlan(plan.id, { is_scheduled: true, scheduled_to: 'task' })
      if (user) {
        syncUpsert('plans', user.id, updatedPlanForTask, planToDb).then(r => {
          if (!r.success) console.error('[Plan] Failed to sync plan落地标记:', r.error)
        })
      }
    } else {
      // 转日程：弹出时间选择模态框
      const now = new Date()
      setMigrateStartDate(toLocalDateStrFromDate(now))
      setMigrateEndDate(toLocalDateStrFromDate(now))
      setMigrateModal({ plan, target })
    }
  }

  const toLocalDateStrFromDate = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  const confirmMigrateSchedule = () => {
    if (!migrateModal || !migrateStartDate || !migrateEndDate) return
    const plan = migrateModal.plan
    const startISO = `${migrateStartDate}T00:00`
    const endISO = `${migrateEndDate}T00:00`
    const now = new Date()
    const newSchedule = {
      id: generateUUID(),
      user_id: user?.id || 'current-user',
      title: plan.title,
      content: plan.content || '',
      start_time: startISO,
      end_time: endISO,
      repeat_rule: null,
      is_reminder: false,
      reminder_type: null,
      plan_id: plan.id,
      deleted_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }
    addSchedule(newSchedule)
    if (user) {
      syncUpsert('schedules', user.id, newSchedule, scheduleToDb).then(r => {
        if (!r.success) console.error('[Plan] Failed to sync schedule:', r.error)
      })
    }
    const updatedPlanForSchedule = { ...plan, is_scheduled: true, scheduled_to: 'schedule', updated_at: now.toISOString() }
    updatePlan(plan.id, { is_scheduled: true, scheduled_to: 'schedule' })
    if (user) {
      syncUpsert('plans', user.id, updatedPlanForSchedule, planToDb).then(r => {
        if (!r.success) console.error('[Plan] Failed to sync plan落地标记:', r.error)
      })
    }
    setMigrateModal(null)
  }

  const priorityLabel = { high: '高', medium: '中', low: '低' }
  const priorityClass = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' }

  return (
    <div className="page-container">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-6">
          <div>
            <h1 className="page-title mb-1">宏观规划</h1>
            <p className="text-xs md:text-sm text-[var(--text-secondary)]">
              {activePlans.filter(p => !p.is_scheduled).length} 个未落地 · {activePlans.filter(p => p.is_scheduled).length} 个已落地
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="flex bg-[var(--bg-secondary)] rounded-button p-0.5 md:p-1 border border-[var(--border-color)] overflow-x-auto flex-nowrap md:flex-wrap max-w-full">
              {(['all', 'unscheduled', 'scheduled'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 md:px-3 py-1.5 md:py-1 text-xs font-medium rounded-button transition-all flex-shrink-0 min-h-[32px] md:min-h-0 ${
                    filterStatus === s
                      ? 'bg-primary-600 text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s === 'all' ? '全部' : s === 'unscheduled' ? '未落地' : '已落地'}
                </button>
              ))}
            </div>
            <button onClick={() => { resetForm(); setShowModal(true) }} className="btn-primary text-xs md:text-sm flex items-center gap-2 flex-shrink-0">
              <Plus size={14} />
              新建
            </button>
          </div>
        </div>

        {/* 标签筛选 */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:overflow-visible md:flex-wrap md:mx-0 md:px-0 mb-4">
            <span className="text-xs text-[var(--text-tertiary)] flex-shrink-0 whitespace-nowrap">标签筛选：</span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 md:px-2.5 md:py-1 text-xs rounded-button transition-colors min-h-[36px] md:min-h-0 ${
                  filterTag === tag
                    ? 'bg-primary-600 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tag}
              </button>
            ))}
            {filterTag && (
              <button
                onClick={() => setFilterTag(null)}
                className="flex-shrink-0 whitespace-nowrap text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] min-h-[36px] md:min-h-0 px-1"
              >
                清除
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          <AnimatePresence>
            {filteredPlans.map((plan) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="card-hover"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{plan.title}</span>
                      {plan.priority && <span className={`tag-pill ${priorityClass[plan.priority]}`}>{priorityLabel[plan.priority]}</span>}
                      {plan.is_scheduled && (
                        <span className="tag-pill bg-success/10 text-success">
                          {plan.scheduled_to === 'task' ? '已转待办' : '已转日程'}
                        </span>
                      )}
                    </div>
                    {plan.content && (
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{plan.content}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {(plan.tags || []).map(tag => (
                        <span key={tag} className="tag-pill text-xs">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-1 flex-wrap md:flex-shrink-0 md:ml-3">
                    {/* 落地为日程/任务按钮：受 planSchedule 开关控制 */}
                    {!plan.is_scheduled && flags.planSchedule !== false && (
                      <>
                        <button
                          onClick={() => handleMigrate(plan, 'task')}
                          className="px-3 py-2 md:px-2.5 md:py-1.5 text-xs rounded-button bg-[var(--bg-tertiary)] text-primary-600 hover:bg-primary-600 hover:text-white transition-colors flex items-center gap-1 min-h-[40px] md:min-h-0"
                        >
                          <CheckSquare size={13} />
                          转待办
                        </button>
                        <button
                          onClick={() => handleMigrate(plan, 'schedule')}
                          className="px-3 py-2 md:px-2.5 md:py-1.5 text-xs rounded-button bg-[var(--bg-tertiary)] text-primary-600 hover:bg-primary-600 hover:text-white transition-colors flex items-center gap-1 min-h-[40px] md:min-h-0"
                        >
                          <Calendar size={13} />
                          转日程
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setEditingPlan(plan)
                        setForm({
                          title: plan.title,
                          content: plan.content,
                          priority: plan.priority,
                          tags: [...(plan.tags || [])],
                          tagInput: ''
                        })
                        setShowModal(true)
                      }}
                      className="p-2.5 md:p-2.5 rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] min-h-[44px] md:min-h-0 flex items-center justify-center"
                    >
                      <Edit size={15} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(plan.id)}
                      className="p-2.5 md:p-2.5 rounded-button hover:bg-red-50 text-[var(--text-tertiary)] hover:text-danger min-h-[44px] md:min-h-0 flex items-center justify-center"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredPlans.length === 0 && (
            <div className="empty-state">
              <Target size={48} className="text-[var(--text-tertiary)] mb-3" />
              <p className="text-[var(--text-secondary)]">暂无规划</p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm() }}
        title={editingPlan ? '编辑规划' : '新建规划'}
        footer={
          <>
            <button onClick={() => { setShowModal(false); resetForm() }} className="btn-secondary">取消</button>
            <button onClick={handleSave} className="btn-primary">{editingPlan ? '保存' : '创建'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">标题</label>
            <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="规划标题" className="input-dark" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">详情</label>
            <textarea value={form.content} onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))} placeholder="详情（可选）" rows={3} className="input-dark resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">优先级</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setForm(prev => ({ ...prev, priority: '' }))}
                className={`px-4 py-2.5 md:py-2 rounded-button text-sm font-medium transition-all min-h-[44px] md:min-h-0 flex-1 md:flex-initial ${
                  form.priority === ''
                    ? 'bg-[var(--bg-tertiary)] text-primary-600 ring-2 ring-offset-1 ring-offset-[var(--bg-secondary)]'
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                }`}
              >
                无
              </button>
              {(['high', 'medium', 'low'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setForm(prev => ({ ...prev, priority: p }))}
                  className={`px-4 py-2.5 md:py-2 rounded-button text-sm font-medium transition-all min-h-[44px] md:min-h-0 flex-1 md:flex-initial ${
                    form.priority === p
                      ? priorityClass[p] + ' ring-2 ring-offset-1 ring-offset-[var(--bg-secondary)]'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                  }`}
                >
                  {priorityLabel[p]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">标签</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-[#6B4C9A]/10 text-[#6B4C9A] dark:bg-[#6B4C9A]/20 dark:text-[#9B7EC9] rounded text-xs flex items-center gap-1"
                >
                  {tag}
                  <button
                    onClick={() => setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}
                    className="hover:text-danger leading-none min-h-[28px] min-w-[28px] flex items-center justify-center"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={form.tagInput}
              onChange={e => setForm(prev => ({ ...prev, tagInput: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  const tag = form.tagInput.trim().replace(/,$/, '')
                  if (tag && !form.tags.includes(tag)) {
                    setForm(prev => ({ ...prev, tags: [...prev.tags, tag], tagInput: '' }))
                  } else {
                    setForm(prev => ({ ...prev, tagInput: '' }))
                  }
                }
              }}
              placeholder="输入标签，按回车添加"
              className="input-dark text-sm py-1.5 px-3"
            />
          </div>
        </div>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const plan = plans.find(p => p.id === confirmDelete)
            if (plan) handleDelete(plan)
          }}
          title="确认删除"
          message="删除后规划将进入回收站。"
          type="danger"
        />
      )}

      {/* 转日程时间选择模态框 */}
      {migrateModal && (
        <Modal
          isOpen={true}
          onClose={() => setMigrateModal(null)}
          title={`将「${migrateModal.plan.title}」转为日程`}
          footer={<>
            <button onClick={() => setMigrateModal(null)} className="btn-secondary">取消</button>
            <button onClick={confirmMigrateSchedule} className="btn-primary">确认创建日程</button>
          </>}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">请设置日程的时间范围：</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">开始日期</label>
                <input type="date" value={migrateStartDate} onChange={e => setMigrateStartDate(e.target.value)} className="input-dark" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">结束日期</label>
                <input type="date" value={migrateEndDate} onChange={e => setMigrateEndDate(e.target.value)} className="input-dark" />
              </div>
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">日程会在日历上从开始日期持续显示到结束日期，创建后可在日历中编辑。</p>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default PlanPage
