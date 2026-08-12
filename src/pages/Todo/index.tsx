import React, { useState, useMemo } from 'react'
import { useTodoStore, useRecycleBinStore, useAppStore, usePoinStore } from '@/store'
import { syncDelete, syncUpsert, taskToDb } from '@/lib/sync'
import { earnPoin, refundPoin } from '@/lib/poin'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '@/components/Modal/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ReminderSettings from '@/components/ReminderSettings'
import {
  Plus, Check, Edit, Trash, Archive,
  ChevronDown, ChevronRight, CheckSquare,
  RotateCcw, Download, Tag as TagIcon, X, Coins
} from '@/utils/icons'
import type { Task, Subtask, Tag } from '@/types'
import { generateUUID } from '@/lib/utils'

const Todo: React.FC = () => {
  /* Desktop-only */
  const {
    tasks, archivedTasks, addTask, updateTask, deleteTask,
    archiveTask, unarchiveTask, exportArchived, clearOldArchived,
    tags: storeTags, addTag
  } = useTodoStore()
  const { user, settings } = useAppStore()
  // 获取各板块功能开关
  const flags = settings.featureFlags || {}
  const { addItem } = useRecycleBinStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [showCompleted, setShowCompleted] = useState(true)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [expandedArchivedMonths, setExpandedArchivedMonths] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    content: '',
    priority: 'medium' as Task['priority'],
    tags: [] as string[],
    tagInput: '',
    subtasks: [] as Subtask[],
    reward_poin: 0,
    reminder_enabled: false,
    reminder_mode: 'custom' as 'custom' | 'at_start' | 'before_start' | 'at_end' | 'before_end',
    reminder_time: '',
    reminder_minutes: 15
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const activeTasks = tasks.filter(t =>
    !t.is_completed && !t.deleted_at
  )
  const completedTasks = tasks.filter(t => t.is_completed && !t.deleted_at)

  // 收集所有任务中实际使用的标签名（用于筛选栏显示）
  const allUsedTags = useMemo(() => {
    const tagSet = new Set<string>()
    tasks.filter(t => !t.deleted_at).forEach(t => (t.tags || []).forEach(tag => tagSet.add(tag)))
    return Array.from(tagSet)
  }, [tasks])

  // 根据优先级和标签筛选
  const filteredTasks = activeTasks.filter(t => {
    const priorityMatch = filter === 'all' || t.priority === filter
    const tagMatch = !selectedTagFilter || (t.tags || []).includes(selectedTagFilter)
    return priorityMatch && tagMatch
  })

  const groupedArchived = archivedTasks.reduce((acc, task) => {
    const month = task.archived_at ? task.archived_at.slice(0, 7) : '未知'
    if (!acc[month]) acc[month] = []
    acc[month].push(task)
    return acc
  }, {} as Record<string, Task[]>)

  const formatMonth = (m: string) => {
    if (m === '未知') return m
    const [y, mon] = m.split('-')
    return `${y}年${Number(mon)}月`
  }

  const resetForm = () => {
    setForm({ title: '', content: '', priority: 'medium', tags: [], tagInput: '', subtasks: [], reward_poin: 0, reminder_enabled: false, reminder_mode: 'custom', reminder_time: '', reminder_minutes: 15 })
    setEditingTask(null)
  }

  const handleSave = () => {
    if (!form.title.trim()) return
    const now = new Date().toISOString()
    // 提醒数据
    const reminderData = form.reminder_enabled ? {
      reminder_enabled: true,
      reminder_mode: form.reminder_mode,
      reminder_time: form.reminder_time || null,
      reminder_minutes: form.reminder_minutes,
      reminder_triggered: false,  // 保存时重置触发状态
    } : { reminder_enabled: false, reminder_time: null, reminder_mode: 'custom', reminder_triggered: false }

    if (editingTask) {
      updateTask(editingTask.id, {
        title: form.title,
        content: form.content,
        priority: form.priority,
        tags: form.tags,
        subtasks: form.subtasks,
        reward_poin: form.reward_poin,
        ...reminderData
      })
      if (user) {
        const updatedTask = {
          ...editingTask,
          title: form.title,
          content: form.content,
          priority: form.priority,
          tags: form.tags,
          subtasks: form.subtasks,
          reward_poin: form.reward_poin,
          ...reminderData,
          updated_at: now
        }
        syncUpsert('tasks', user.id, updatedTask, taskToDb).then(r => {
          if (!r.success) console.error('[Todo] Failed to sync update task:', r.error)
        })
      }
    } else {
      const newTask: Task = {
        id: generateUUID(),
        user_id: user?.id || 'current-user',
        title: form.title,
        content: form.content,
        priority: form.priority,
        tags: form.tags,
        subtasks: form.subtasks,
        is_completed: false,
        completed_at: null,
        is_archived: false,
        archived_at: null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
        reward_poin: form.reward_poin,
        ...reminderData
      }
      addTask(newTask)
      if (user) {
        syncUpsert('tasks', user.id, newTask, taskToDb).then(r => {
          if (!r.success) console.error('[Todo] Failed to sync add task:', r.error)
        })
      }
    }
    setShowAddModal(false)
    resetForm()
  }

  const handleDelete = (task: Task) => {
    deleteTask(task.id)
    addItem({ id: task.id, type: 'task', title: task.title, data: task })
    if (user) {
      syncDelete('tasks', task.id, user.id).then(r => {
        if (!r.success) console.error('[Todo] Failed to hard delete from cloud:', r.error)
      })
    }
    setConfirmDelete(null)
  }

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const updatedSubtasks = task.subtasks.map(s =>
      s.id === subtaskId ? { ...s, is_completed: !s.is_completed } : s
    )
    const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.is_completed)
    const now = new Date().toISOString()
    updateTask(taskId, { subtasks: updatedSubtasks, is_completed: allCompleted, completed_at: allCompleted ? now : null })
    // 即时同步子任务变更
    if (user) {
      const updatedTask = { ...task, subtasks: updatedSubtasks, is_completed: allCompleted, completed_at: allCompleted ? now : null, updated_at: now }
      syncUpsert('tasks', user.id, updatedTask, taskToDb).then(r => {
        if (!r.success) console.error('[Todo] Failed to sync subtask toggle:', r.error)
      })
    }
    // Poin 奖励：子任务全部完成 / 取消完成时联动触发或撤回
    const poinConfig = usePoinStore.getState().config
    const reward = task.reward_poin ?? 0
    if (allCompleted && !task.is_completed) {
      // 子任务全部完成，主任务从未完成变为完成，获得 Poin
      if (poinConfig.enable && reward > 0 && user) {
        earnPoin(user.id, reward, 'todo', task.id, `完成待办：${task.title}`).then(() => {
          const { addNotification } = useAppStore.getState()
          addNotification({ message: `获得 ${reward} Poin`, type: 'success' })
        }).catch(e => console.error('[Todo] Poin earn error:', e))
      }
    } else if (!allCompleted && task.is_completed) {
      // 子任务取消完成，主任务从完成变为未完成，撤回 Poin
      if (poinConfig.enable && reward > 0 && user) {
        refundPoin(user.id, 'todo', task.id, `撤回完成：${task.title}`).then(() => {
          const { addNotification } = useAppStore.getState()
          addNotification({ message: `退回 ${reward} Poin`, type: 'warning' })
        }).catch(e => console.error('[Todo] Poin refund error:', e))
      }
    }
  }

  // 主任务完成时联动所有子任务
  const handleTaskComplete = (task: Task) => {
    if (!task.is_completed) {
      // 标记完成：同时完成所有子任务
      const completedSubtasks = task.subtasks.map(s => ({ ...s, is_completed: true }))
      const now = new Date().toISOString()
      updateTask(task.id, { is_completed: true, subtasks: completedSubtasks, completed_at: now })
      if (user) {
        const updatedTask = { ...task, is_completed: true, subtasks: completedSubtasks, completed_at: now, updated_at: now }
        syncUpsert('tasks', user.id, updatedTask, taskToDb).then(r => {
          if (!r.success) console.error('[Todo] Failed to sync task completion:', r.error)
        })
      }
      // Poin 奖励：完成任务后获得 Poin
      const poinConfig = usePoinStore.getState().config
      const reward = task.reward_poin ?? 0
      if (poinConfig.enable && reward > 0 && user) {
        earnPoin(user.id, reward, 'todo', task.id, `完成待办：${task.title}`).then(() => {
          const { addNotification } = useAppStore.getState()
          addNotification({ message: `获得 ${reward} Poin`, type: 'success' })
        }).catch(e => console.error('[Todo] Poin earn error:', e))
      }
    } else {
      // 取消完成：仅取消主任务，子任务不回退
      updateTask(task.id, { is_completed: false, completed_at: null })
      if (user) {
        const updatedTask = { ...task, is_completed: false, completed_at: null, updated_at: new Date().toISOString() }
        syncUpsert('tasks', user.id, updatedTask, taskToDb).then(r => {
          if (!r.success) console.error('[Todo] Failed to sync task uncompletion:', r.error)
        })
      }
      // Poin 撤回：取消完成时退回之前获得的 Poin
      const poinConfig = usePoinStore.getState().config
      const reward = task.reward_poin ?? 0
      if (poinConfig.enable && reward > 0 && user) {
        refundPoin(user.id, 'todo', task.id, `撤回完成：${task.title}`).then(() => {
          const { addNotification } = useAppStore.getState()
          addNotification({ message: `退回 ${reward} Poin`, type: 'warning' })
        }).catch(e => console.error('[Todo] Poin refund error:', e))
      }
    }
  }

  const toggleExpand = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleArchivedMonth = (month: string) => {
    setExpandedArchivedMonths(prev => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  const handleArchiveAllCompleted = () => {
    completedTasks.forEach(task => {
      const archived = archiveTask(task.id)
      if (archived && user?.id) {
        syncUpsert('tasks', user.id, archived, taskToDb)
      }
    })
  }

  const handleExportArchived = () => {
    const json = exportArchived()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `archived-tasks-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const priorityLabel = { high: '高', medium: '中', low: '低' }
  const priorityClass = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' }

  // 根据标签名获取颜色（优先从 store 中查找，找不到用默认色）
  const getTagColor = (tagName: string): string => {
    const tag = storeTags.find(t => t.name === tagName)
    return tag?.color || '#6B7280'
  }

  // 切换标签筛选
  const toggleTagFilter = (tagName: string) => {
    setSelectedTagFilter(prev => prev === tagName ? null : tagName)
  }

  // 添加自定义标签到 store
  const handleAddCustomTag = (tagName: string) => {
    const trimmed = tagName.trim()
    if (!trimmed) return
    // 如果 store 中不存在同名标签，创建一个自定义标签
    if (!storeTags.some(t => t.name === trimmed)) {
      const colors = ['#4B3FE3', '#1DC981', '#EFAA17', '#E8463A', '#8B5CF6', '#F97316', '#EC4899', '#27D2BF']
      const newTag: Tag = {
        id: generateUUID(),
        name: trimmed,
        color: colors[storeTags.length % colors.length],
        is_builtin: false,
        created_at: new Date().toISOString()
      }
      addTag(newTag)
    }
  }

  const renderTaskCard = (task: Task, isCompleted = false) => (
    <motion.div
      key={task.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="card-hover"
    >
      <div className="flex items-start gap-2 md:gap-3">
        <button
          onClick={() => handleTaskComplete(task)}
          className={`mt-0.5 w-6 h-6 lg:w-5 lg:h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            task.is_completed
              ? 'bg-primary-600 border-primary-600'
              : 'border-[var(--border-color)] hover:border-primary-600'
          }`}
        >
          {task.is_completed && <Check size={12} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm md:text-sm font-medium min-w-0 break-words ${isCompleted ? 'line-through text-[var(--text-tertiary)] opacity-60' : 'text-[var(--text-primary)]'}`}>
              {task.title}
            </span>
            {/* 优先级标签：受 todoPriority 开关控制 */}
            {flags.todoPriority !== false && (
              <span className={`tag-pill ${priorityClass[task.priority]}`}>
                {priorityLabel[task.priority]}
              </span>
            )}
            {/* Poin 奖励标注 */}
            {usePoinStore.getState().config.enable && (task.reward_poin ?? 0) > 0 && (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                isCompleted ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
              }`}>
                <Coins size={10} /> +{task.reward_poin}
              </span>
            )}
          </div>

          {task.content && (
            <p className={`text-xs mt-1 line-clamp-2 ${isCompleted ? 'text-[var(--text-tertiary)] opacity-60' : 'text-[var(--text-secondary)]'}`}>
              {task.content}
            </p>
          )}

          <div className="flex items-center gap-1.5 md:gap-2 mt-1.5 md:mt-2 flex-wrap">
            {/* 标签显示：受 todoTags 开关控制 */}
            {flags.todoTags !== false && task.tags.map(tag => (
              <span
                key={tag}
                className="tag-pill text-xs"
                style={{ background: `${getTagColor(tag)}15`, color: getTagColor(tag), borderColor: `${getTagColor(tag)}30` }}
              >
                {tag}
              </span>
            ))}
            {/* 子任务计数：受 todoSubtasks 开关控制 */}
            {flags.todoSubtasks !== false && task.subtasks.length > 0 && (
              <button
                onClick={() => toggleExpand(task.id)}
                className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-primary-600"
              >
                {expandedTasks.has(task.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {task.subtasks.filter(s => s.is_completed).length}/{task.subtasks.length}
              </button>
            )}
          </div>

          {/* 子任务展开：受 todoSubtasks 开关控制 */}
          <AnimatePresence>
            {flags.todoSubtasks !== false && expandedTasks.has(task.id) && task.subtasks.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 pl-2 space-y-1 border-l-2 border-[var(--border-color)]">
                  {task.subtasks.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 py-1">
                      <button
                        onClick={() => toggleSubtask(task.id, sub.id)}
                        className={`w-5 h-5 lg:w-4 lg:h-4 rounded border flex items-center justify-center ${
                          sub.is_completed ? 'bg-primary-600 border-primary-600' : 'border-[var(--border-color)]'
                        }`}
                      >
                        {sub.is_completed && <Check size={10} className="text-white" />}
                      </button>
                      <span className={`text-xs ${sub.is_completed ? 'line-through opacity-50' : 'text-[var(--text-secondary)]'}`}>
                        {sub.title}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isCompleted && (
            <button
              onClick={() => {
                const now = new Date().toISOString()
                const restoredTask = { ...task, is_completed: false, completed_at: null, updated_at: now }
                updateTask(task.id, { is_completed: false, completed_at: null })
                if (user) {
                  syncUpsert('tasks', user.id, restoredTask, taskToDb).then(r => {
                    if (!r.success) console.error('[Todo] Failed to sync restore task:', r.error)
                  })
                }
              }}
              className="p-2 lg:p-1.5 min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-primary-600"
              title="恢复"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {!isCompleted && (
            <button
              onClick={() => {
                setEditingTask(task)
                setForm({
                  title: task.title,
                  content: task.content,
                  priority: task.priority,
                  tags: [...task.tags],
                  tagInput: '',
                  subtasks: [...task.subtasks],
                  reward_poin: task.reward_poin ?? 0,
                  reminder_enabled: task.reminder_enabled ?? false,
                  reminder_mode: task.reminder_mode ?? 'custom',
                  reminder_time: task.reminder_time || '',
                  reminder_minutes: task.reminder_minutes ?? 15
                })
                setShowAddModal(true)
              }}
              className="p-2 lg:p-1.5 min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <Edit size={14} />
            </button>
          )}
          <button
            onClick={() => {
              const archived = archiveTask(task.id)
              if (archived && user?.id) {
                syncUpsert('tasks', user.id, archived, taskToDb)
              }
            }}
            className="p-2 lg:p-1.5 min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            title="归档"
          >
            <Archive size={14} />
          </button>
          <button
            onClick={() => setConfirmDelete(task.id)}
            className="p-2 lg:p-1.5 min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center rounded-button hover:bg-red-50 dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-danger"
          >
            <Trash size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  )

  return (
    <div className="page-container">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-6">
          <div>
            <h1 className="page-title mb-1">任务待办</h1>
            <p className="hidden md:block text-xs md:text-sm text-[var(--text-secondary)]">
              {activeTasks.length} 个待完成 · {completedTasks.length} 个已完成
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3 overflow-x-auto pb-1 md:overflow-visible md:flex-wrap [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {/* 优先级筛选：受 todoPriority 开关控制 */}
            {flags.todoPriority !== false && (
              <div className="flex bg-[var(--bg-secondary)] rounded-button p-0.5 md:p-1 border border-[var(--border-color)] flex-shrink-0">
                {(['all', 'high', 'medium', 'low'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setFilter(p)}
                    className={`px-2 md:px-3 py-1 text-xs font-medium rounded-button transition-all ${
                      filter === p
                        ? 'bg-primary-600 text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {p === 'all' ? '全部' : priorityLabel[p]}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowArchive(!showArchive)} className="btn-secondary text-xs md:text-sm whitespace-nowrap flex-shrink-0">
              {showArchive ? '隐藏归档' : '查看归档'}
            </button>
            <button onClick={() => { resetForm(); setShowAddModal(true) }} className="btn-primary text-xs md:text-sm flex items-center gap-1.5 flex-shrink-0">
              <Plus size={14} />
              新建
            </button>
          </div>
        </div>

        {/* 标签筛选栏：受 todoTags 开关控制 */}
        {flags.todoTags !== false && allUsedTags.length > 0 && (
          <div className="flex items-center gap-2 md:gap-2 mb-3 md:mb-4 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            <button
              onClick={() => setSelectedTagFilter(null)}
              className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${
                !selectedTagFilter
                  ? 'bg-primary-600 text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              全部
            </button>
            {allUsedTags.map(tagName => {
              const color = getTagColor(tagName)
              const isActive = selectedTagFilter === tagName
              return (
                <button
                  key={tagName}
                  onClick={() => toggleTagFilter(tagName)}
                  className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all flex items-center gap-1.5 ${
                    isActive ? 'text-white' : 'border'
                  }`}
                  style={
                    isActive
                      ? { background: color }
                      : { background: `${color}10`, color, borderColor: `${color}30` }
                  }
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: isActive ? 'white' : color }} />
                  {tagName}
                </button>
              )
            })}
          </div>
        )}

        {/* 任务列表 */}
        <div className="space-y-2 md:space-y-3">
          <AnimatePresence>
            {filteredTasks.map((task) => renderTaskCard(task))}
          </AnimatePresence>

          {filteredTasks.length === 0 && (
            <div className="empty-state">
              <CheckSquare size={32} className="text-[var(--text-tertiary)] mb-2" />
              <p className="text-sm text-[var(--text-secondary)]">暂无待办任务</p>
            </div>
          )}
        </div>

        {/* 已完成区域 */}
        {completedTasks.length > 0 && (
          <div className="mt-4 md:mt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 mb-2 md:mb-3">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {showCompleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                已完成 ({completedTasks.length})
              </button>
              <button
                onClick={handleArchiveAllCompleted}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <Archive size={14} />
                归档已完成
              </button>
            </div>
            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-2 md:space-y-3 overflow-hidden"
                >
                  <AnimatePresence>
                    {completedTasks.map(task => renderTaskCard(task, true))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 归档记录 */}
        <AnimatePresence>
          {showArchive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 md:mt-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-4">
                <h2 className="section-title">归档记录</h2>
                <button
                  onClick={handleExportArchived}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Download size={14} />
                  导出归档数据
                </button>
              </div>

              <div className="space-y-2 md:space-y-3">
                {Object.keys(groupedArchived).sort((a, b) => b.localeCompare(a)).map(month => (
                  <div key={month} className="border border-[var(--border-color)] rounded-card overflow-hidden">
                    <button
                      onClick={() => toggleArchivedMonth(month)}
                      className="w-full flex items-center justify-between px-3 md:px-4 py-2 md:py-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium text-[var(--text-primary)]">
                        {expandedArchivedMonths.has(month) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        {formatMonth(month)}
                      </div>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {groupedArchived[month].length} 个任务
                      </span>
                    </button>
                    <AnimatePresence>
                      {expandedArchivedMonths.has(month) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-2 md:p-3 space-y-1.5 md:space-y-2">
                            {groupedArchived[month].map(task => (
                              <div key={task.id} className="flex items-center justify-between px-2.5 md:px-3 py-1.5 md:py-2 rounded-button bg-[var(--bg-primary)] border border-[var(--border-color)]">
                                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                  <Check size={14} className="text-success flex-shrink-0" />
                                  <span className="text-xs md:text-sm line-through text-[var(--text-secondary)] truncate">
                                    {task.title}
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    const restored = unarchiveTask(task.id)
                                    if (restored && user?.id) {
                                      syncUpsert('tasks', user.id, restored, taskToDb)
                                    }
                                  }}
                                  className="ml-2 text-xs text-primary-600 hover:underline flex-shrink-0"
                                >
                                  恢复
                                </button>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                {archivedTasks.length === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-4">暂无归档任务</p>
                )}
              </div>

              {/* 年度清理提示 */}
              <div className="mt-3 md:mt-4 p-3 md:p-4 rounded-card bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                <p className="text-xs text-[var(--text-tertiary)] mb-2 md:mb-3">
                  免费版每年自动清理一次超过一年的归档数据
                </p>
                <button
                  onClick={() => clearOldArchived()}
                  className="btn-secondary text-xs"
                >
                  立即清理旧数据
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 新建/编辑弹窗 */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm() }}
        title={editingTask ? '编辑任务' : '新建任务'}
        footer={
          <>
            <button onClick={() => { setShowAddModal(false); resetForm() }} className="btn-secondary flex-1 md:flex-none">
              取消
            </button>
            <button onClick={handleSave} className="btn-primary flex-1 md:flex-none">
              {editingTask ? '保存' : '创建'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">标题</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="任务标题"
              className="input-dark"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">详情</label>
            <textarea
              value={form.content}
              onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="任务详情（可选）"
              rows={3}
              className="input-dark resize-none"
            />
          </div>
          {/* 优先级选择器：受 todoPriority 开关控制 */}
          {flags.todoPriority !== false && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">优先级</label>
              <div className="flex gap-2">
                {(['high', 'medium', 'low'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setForm(prev => ({ ...prev, priority: p }))}
                    className={`px-4 py-2 rounded-button text-sm font-medium transition-all ${
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
          )}
          {/* 标签输入：受 todoTags 开关控制 */}
          {flags.todoTags !== false && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">标签</label>
              {/* 已选标签 */}
              {form.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {form.tags.map(tag => {
                    const color = getTagColor(tag)
                    return (
                      <span
                        key={tag}
                        className="tag-pill flex items-center gap-1 text-xs"
                        style={{ background: `${color}15`, color, borderColor: `${color}30` }}
                      >
                        {tag}
                        <button onClick={() => setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}>
                          <X size={12} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              {/* 预设标签快捷选择 */}
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {storeTags.map(tag => {
                  const selected = form.tags.includes(tag.name)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => {
                        if (selected) {
                          setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag.name) }))
                        } else {
                          setForm(prev => ({ ...prev, tags: [...prev.tags, tag.name] }))
                        }
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                        selected ? 'text-white' : 'border'
                      }`}
                      style={
                        selected
                          ? { background: tag.color }
                          : { background: `${tag.color}10`, color: tag.color, borderColor: `${tag.color}30` }
                      }
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: selected ? 'white' : tag.color }} />
                      {tag.name}
                    </button>
                  )
                })}
              </div>
              {/* 自定义标签输入 */}
              <input
                type="text"
                value={form.tagInput}
                onChange={e => setForm(prev => ({ ...prev, tagInput: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && form.tagInput.trim()) {
                    e.preventDefault()
                    const newTag = form.tagInput.trim()
                    if (!form.tags.includes(newTag)) {
                      setForm(prev => ({ ...prev, tags: [...prev.tags, newTag], tagInput: '' }))
                      handleAddCustomTag(newTag)
                    } else {
                      setForm(prev => ({ ...prev, tagInput: '' }))
                    }
                  }
                }}
                placeholder="输入自定义标签回车添加"
                className="input-dark text-sm py-1.5 px-3 w-full"
              />
            </div>
          )}
          {/* 子任务区域：受 todoSubtasks 开关控制 */}
          {flags.todoSubtasks !== false && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">子任务</label>
              <div className="space-y-2">
                {form.subtasks.map((sub, idx) => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sub.title}
                      onChange={e => {
                        const updated = [...form.subtasks]
                        updated[idx] = { ...sub, title: e.target.value }
                        setForm(prev => ({ ...prev, subtasks: updated }))
                      }}
                      className="input-dark text-sm flex-1"
                    />
                    <button
                      onClick={() => setForm(prev => ({ ...prev, subtasks: prev.subtasks.filter((_, i) => i !== idx) }))}
                      className="p-1.5 text-[var(--text-tertiary)] hover:text-danger"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setForm(prev => ({
                    ...prev,
                    subtasks: [...prev.subtasks, { id: generateUUID(), title: '', is_completed: false }]
                  }))}
                  className="text-sm text-primary-600 hover:underline flex items-center gap-1"
                >
                  <Plus size={14} /> 添加子任务
                </button>
              </div>
            </div>
          )}

          {/* Poin 奖励设置：仅在 Poin 系统开启时显示 */}
          {usePoinStore.getState().config.enable && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5 flex items-center gap-1.5">
                <Coins size={14} className="text-primary-600" />
                完成奖励 Poin
              </label>
              <input
                type="number"
                min={0}
                value={form.reward_poin || ''}
                onChange={e => setForm(prev => ({ ...prev, reward_poin: Math.max(0, Number(e.target.value) || 0) }))}
                className="input-dark"
              />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">完成此待办时自动获得指定数量的 Poin</p>
            </div>
          )}

          {/* 提醒设置 */}
          <ReminderSettings
            enabled={form.reminder_enabled}
            mode={form.reminder_mode}
            customTime={form.reminder_time}
            minutes={form.reminder_minutes}
            itemType="task"
            onChange={val => setForm(prev => ({
              ...prev,
              reminder_enabled: val.enabled,
              reminder_mode: val.mode,
              reminder_time: val.customTime,
              reminder_minutes: val.minutes,
            }))}
          />
        </div>
      </Modal>

      {/* 删除确认 */}
      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const task = tasks.find(t => t.id === confirmDelete)
            if (task) handleDelete(task)
          }}
          title="确认删除"
          message="删除后内容将进入回收站，7天后自动永久清除。"
          type="danger"
        />
      )}
    </div>
  )
}

export default Todo


