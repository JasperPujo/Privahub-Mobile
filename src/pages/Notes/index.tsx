import React, { useState, useRef } from 'react'
import { useNoteStore, useAppStore } from '@/store'
import { syncDelete, syncUpsert, noteToDb, noteWallToDb } from '@/lib/sync'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '@/components/Modal/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  Plus, StickyNote, Pin, Trash, Trash2, Edit, Send, ImageIcon, X, Volume2
} from '@/utils/icons'
import type { NoteWall, Note } from '@/types'
import { generateUUID } from '@/lib/utils'

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const canEditNote = (note: Note) => {
  const created = new Date(note.created_at).getTime()
  return Date.now() - created < 2 * 60 * 60 * 1000
}

const NotesPage: React.FC = () => {
  /* Desktop-only */

  const { walls, notes, addWall, updateWall, deleteWall, reorderWalls, addNote, updateNote, deleteNote, pinNote, reorderNotes, addComment, deleteComment } = useNoteStore()
  const { user, settings } = useAppStore()
  // 获取各板块功能开关
  const flags = settings.featureFlags || {}
  // 默认展示第一个主题墙
  const defaultWallId = walls.filter(w => !w.deleted_at).sort((a, b) => a.sort_order - b.sort_order)[0]?.id || null
  const [activeWallId, setActiveWallId] = useState<string | null>(defaultWallId)
  const [showWallModal, setShowWallModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [editingWall, setEditingWall] = useState<NoteWall | null>(null)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [confirmDeleteWall, setConfirmDeleteWall] = useState<string | null>(null)
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentNoteId, setCommentNoteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [showAllComments, setShowAllComments] = useState<string | null>(null) // 存 note id
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const [dragWallIdx, setDragWallIdx] = useState<number | null>(null)
  const [dropWallIdx, setDropWallIdx] = useState<number | null>(null)
  const [dragNoteIdx, setDragNoteIdx] = useState<number | null>(null)
  const [dropNoteIdx, setDropNoteIdx] = useState<number | null>(null)

  const [wallForm, setWallForm] = useState({ name: '', description: '' })
  const [noteForm, setNoteForm] = useState({
    content: '',
    color: '#1A1759',
    background: '#F2F7FF',
    images: [] as string[],
    audios: [] as string[]
  })

  // Modal 中添加留言的输入
  const [modalCommentText, setModalCommentText] = useState('')

  const activeWall = walls.find(w => w.id === activeWallId)
  const wallNotes = notes
    .filter(n => n.wall_id === activeWallId && !n.deleted_at)
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)
      return (a.sort_order || 0) - (b.sort_order || 0)
    })

  const resetWallForm = () => {
    setWallForm({ name: '', description: '' })
    setEditingWall(null)
  }

  const resetNoteForm = () => {
    setNoteForm({ content: '', color: '#1A1759', background: '#F2F7FF', images: [], audios: [] })
    setEditingNote(null)
  }

  const handleSaveWall = () => {
    if (!wallForm.name.trim()) return
    if (editingWall) {
      const updatedWall = { ...editingWall, name: wallForm.name, description: wallForm.description, updated_at: new Date().toISOString() }
      updateWall(editingWall.id, { name: wallForm.name, description: wallForm.description })
      if (user) {
        syncUpsert('note_walls', user.id, updatedWall, noteWallToDb).then(r => {
          if (!r.success) console.error('[Notes] Failed to sync wall:', r.error)
        })
      }
    } else {
      const newWall: NoteWall = {
        id: generateUUID(),
        user_id: user?.id || 'current-user',
        name: wallForm.name,
        description: wallForm.description,
        sort_order: walls.filter(w => !w.deleted_at).length,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      addWall(newWall)
      if (user) {
        syncUpsert('note_walls', user.id, newWall, noteWallToDb).then(r => {
          if (!r.success) console.error('[Notes] Failed to sync wall:', r.error)
        })
      }
      if (!activeWallId) setActiveWallId(newWall.id)
    }
    setShowWallModal(false)
    resetWallForm()
  }

  // noteForm 验证：允许只有图片、只有音频或图文混排
  const handleSaveNote = () => {
    if ((!noteForm.content.trim() && noteForm.images.length === 0 && noteForm.audios.length === 0) || !activeWallId) return
    if (editingNote) {
      const updatedNoteData = {
        content: { text: noteForm.content },
        color: noteForm.color,
        background: noteForm.background,
        image_ids: noteForm.images,
        audio_ids: noteForm.audios
      }
      const updatedNote = { ...editingNote, ...updatedNoteData, updated_at: new Date().toISOString() }
      updateNote(editingNote.id, updatedNoteData)
      if (user) {
        syncUpsert('notes', user.id, updatedNote, noteToDb).then(r => {
          if (!r.success) console.error('[Notes] Failed to sync note:', r.error)
        })
      }
    } else {
      const newNote = {
        id: generateUUID(),
        user_id: user?.id || 'current-user',
        wall_id: activeWallId,
        content: { text: noteForm.content },
        image_ids: noteForm.images,
        audio_ids: noteForm.audios,
        color: noteForm.color,
        background: noteForm.background,
        position: notes.filter(n => n.wall_id === activeWallId).length,
        sort_order: notes.filter(n => n.wall_id === activeWallId).length,
        is_pinned: false,
        comments: [],
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      addNote(newNote)
      if (user) {
        syncUpsert('notes', user.id, newNote, noteToDb).then(r => {
          if (!r.success) console.error('[Notes] Failed to sync note:', r.error)
        })
      }
    }
    setShowNoteModal(false)
    resetNoteForm()
  }

  const handleAddComment = () => {
    if (!commentText.trim() || !commentNoteId) return
    addComment(commentNoteId, {
      id: generateUUID(),
      text: commentText,
      created_at: new Date().toISOString()
    })
    setCommentText('')
    setCommentNoteId(null)
  }

  // Modal 中添加留言
  const handleModalAddComment = () => {
    if (!modalCommentText.trim() || !showAllComments) return
    addComment(showAllComments, {
      id: generateUUID(),
      text: modalCommentText,
      created_at: new Date().toISOString()
    })
    setModalCommentText('')
  }

  // 图片上传处理
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      if (noteForm.images.length >= 4) return // 最多4张图

      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result as string
        if (result) {
          setNoteForm(prev => ({ ...prev, images: [...prev.images, result] }))
        }
      }
      reader.readAsDataURL(file)
    })

    // 清空 input 以便重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (index: number) => {
    setNoteForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
  }

  // 音频上传处理
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const isAudio = file.type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(ext)
      if (!isAudio) return
      if (noteForm.audios.length >= 3) return // 最多3个音频

      const reader = new FileReader()
      reader.onload = (event) => {
        let result = event.target?.result as string
        if (result) {
          // 修正 MIME type：如果系统未识别音频类型，根据扩展名强制修正
          const mimeMap: Record<string, string> = {
            mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
            aac: 'audio/aac', m4a: 'audio/mp4', flac: 'audio/flac'
          }
          const mime = mimeMap[ext]
          if (mime && (!result.startsWith('data:audio/') || result.startsWith('data:application/octet-stream'))) {
            result = result.replace(/^data:[^;]+/, 'data:' + mime)
          }
          setNoteForm(prev => ({ ...prev, audios: [...prev.audios, result] }))
        }
      }
      reader.readAsDataURL(file)
    })

    // 清空 input 以便重复选择同一文件
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  const removeAudio = (index: number) => {
    setNoteForm(prev => ({
      ...prev,
      audios: prev.audios.filter((_, i) => i !== index)
    }))
  }

  const colorPresets = [
    { color: '#1A1759', background: '#F2F7FF', name: '紫蓝' },
    { color: '#0F766E', background: '#EAFBF8', name: '青绿' },
    { color: '#92400E', background: '#FEF3C7', name: '暖黄' },
    { color: '#9F1239', background: '#FFE4E6', name: '粉红' },
    { color: '#1E3A5F', background: '#DBEAFE', name: '深蓝' },
    { color: '#3F6212', background: '#ECFCCB', name: '草绿' },
  ]

  // 提取卡片渲染函数
  const renderNoteCard = (note: Note, idx: number) => {
    const hasText = !!note.content.text
    const hasImages = note.image_ids && note.image_ids.length > 0
    const hasAudios = note.audio_ids && note.audio_ids.length > 0
    const commentCount = note.comments.length
    // 根据内容决定卡片大小类
    let sizeClass = ''
    if (commentCount > 5) sizeClass = 'py-5 px-4'
    else if (commentCount > 2) sizeClass = 'py-4 px-4'
    else sizeClass = 'py-3 px-3'

    return (
      <motion.div
        key={note.id}
        draggable
        onDragStart={() => setDragNoteIdx(idx)}
        onDragOver={(e) => {
          e.preventDefault()
          if (dragNoteIdx !== idx) setDropNoteIdx(idx)
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragNoteIdx !== null && dropNoteIdx !== null && dragNoteIdx !== dropNoteIdx && activeWallId) {
            const newOrder = wallNotes.map(n => n.id)
            const [removed] = newOrder.splice(dragNoteIdx, 1)
            newOrder.splice(dropNoteIdx, 0, removed)
            reorderNotes(activeWallId, newOrder)
          }
          setDragNoteIdx(null)
          setDropNoteIdx(null)
        }}
        onDragEnd={() => {
          setDragNoteIdx(null)
          setDropNoteIdx(null)
        }}
        initial={{ opacity: 0, scale: 0.85, y: 10 }}
        animate={{ opacity: dragNoteIdx === idx ? 0.4 : 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: -10 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className={`rounded-card relative group ${sizeClass} ${dropNoteIdx === idx && dragNoteIdx !== idx ? 'ring-2 ring-primary-600 ring-offset-2' : ''}`}
        style={{
          backgroundColor: note.background,
          color: note.color,
        }}
      >
        {/* 置顶按钮：常驻显示，已置顶时高亮 */}
        <button
          onClick={() => {
            const pinTarget = notes.find(n => n.id === note.id)
            if (pinTarget) {
              pinNote(note.id)
              if (user) {
                const updated = { ...pinTarget, is_pinned: !pinTarget.is_pinned, updated_at: new Date().toISOString() }
                syncUpsert('notes', user.id, updated, noteToDb).then(r => {
                  if (!r.success) console.error('[Notes] Failed to sync pin note:', r.error)
                })
              }
            }
          }}
          className={`absolute top-2 right-2 z-10 p-2.5 rounded-full transition-all flex items-center justify-center ${
            note.is_pinned
              ? 'bg-primary-500 text-white shadow-md'
              : 'bg-white/50 text-[var(--text-tertiary)] hover:bg-white/80 opacity-70 lg:opacity-0 lg:group-hover:opacity-100'
          }`}
          title={note.is_pinned ? '取消置顶' : '置顶'}
        >
          <Pin size={14} />
        </button>

        {/* 其他操作按钮：移动端常驻显示，桌面端 hover 显示 */}
        <div className="absolute top-2 right-12 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity flex gap-1">
          {canEditNote(note) && (
            <button
              onClick={() => {
                setEditingNote(note)
                setNoteForm({
                  content: note.content.text,
                  color: note.color,
                  background: note.background,
                  images: [...note.image_ids],
                  audios: [...(note.audio_ids || [])]
                })
                setShowNoteModal(true)
              }}
              className="p-2 lg:p-1 rounded bg-white/50 hover:bg-white/80 flex items-center justify-center"
            >
              <Edit size={14} />
            </button>
          )}
          <button
            onClick={() => setCommentNoteId(note.id)}
            className="p-2 lg:p-1 rounded bg-white/50 hover:bg-white/80 flex items-center justify-center"
          >
            <Send size={14} />
          </button>
          <button
            onClick={() => setConfirmDeleteNote(note.id)}
            className="p-2 lg:p-1 rounded bg-white/50 hover:bg-white/80 text-danger flex items-center justify-center"
          >
            <Trash size={14} />
          </button>
        </div>

        {/* 正文 */}
        {hasText ? (
          <p className="text-sm whitespace-pre-wrap break-all leading-relaxed overflow-hidden" style={{ maxWidth: 'none' }}>{note.content.text}</p>
        ) : null}

        {/* 日期不再 absolute，改为正常流 */}
        <p className="text-xs opacity-40 mt-2">{formatTime(note.created_at)}</p>

        {/* 图片展示 */}
        {hasImages && (
          <div className={`mt-3 grid gap-1 ${note.image_ids.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {note.image_ids.map((img, imgIdx) => (
              <div key={imgIdx} className="relative rounded overflow-hidden cursor-pointer" onClick={() => setPreviewImage(img)}>
                <img
                  src={img}
                  alt={`图片${imgIdx + 1}`}
                  className="w-full object-cover rounded"
                  style={{ maxHeight: note.image_ids.length === 1 ? '400px' : '250px' }}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}

        {/* 音频播放区域 */}
        {hasAudios && (
          <div className="mt-3 space-y-2">
            {note.audio_ids!.map((audio, audioIdx) => {
              try {
                // base64 -> Blob URL，避免 data URL 在 Electron 中的兼容问题
                const mimeType = (audio.match(/^data:([^;]+)/) || [])[1] || 'audio/mpeg'
                const base64 = audio.split(',')[1]
                if (!base64) return <div key={audioIdx} className="text-xs opacity-50">音频数据无效</div>
                const byteChars = atob(base64)
                const bytes = new Uint8Array(byteChars.length)
                for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
                const blob = new Blob([bytes], { type: mimeType })
                const blobUrl = URL.createObjectURL(blob)
                return (
                  <audio
                    key={audioIdx}
                    controls
                    src={blobUrl}
                    className="w-full"
                    style={{ height: '36px' }}
                    preload="metadata"
                  />
                )
              } catch (e) {
                console.error('[Audio] Failed to load audio:', e)
                return <div key={audioIdx} className="text-xs opacity-50">音频加载失败</div>
              }
            })}
          </div>
        )}

        {/* 留言区域 */}
        {note.comments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-current/10 space-y-1.5">
            {[...note.comments]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 3)
              .map(c => (
                <div key={c.id} className="text-xs opacity-70 flex items-start justify-between gap-2 group/comment">
                  <span className="flex-1 break-all overflow-hidden">{c.text}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs opacity-50 whitespace-nowrap">{formatTime(c.created_at)}</span>
                    <button
                      onClick={() => deleteComment(note.id, c.id)}
                      className="lg:opacity-0 lg:group-hover/comment:opacity-100 opacity-70 transition-opacity p-1 hover:bg-white/50 rounded flex items-center justify-center"
                    >
                      <Trash size={11} />
                    </button>
                  </div>
                </div>
              ))}
            {note.comments.length > 3 && (
              <button
                onClick={() => { setShowAllComments(note.id); setModalCommentText('') }}
                className="text-xs text-primary-600 hover:underline mt-1"
              >
                查看更多留言（共{note.comments.length}条）
              </button>
            )}
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <div className="page-container">
      <div className="max-w-6xl mx-auto h-full flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* 主题墙列表：受 notesWalls 开关控制 */}
        {flags.notesWalls !== false && (
        <div className="w-full lg:w-56 flex-shrink-0">
          <div className="flex flex-row items-center justify-between gap-3 mb-3 lg:mb-6">
            <h2 className="section-title mb-0">主题墙</h2>
            <button
              onClick={() => { resetWallForm(); setShowWallModal(true) }}
              className="p-2.5 rounded-button hover:bg-[var(--bg-tertiary)] text-primary-600 flex-shrink-0"
            >
              <Plus size={18} />
            </button>
          </div>
          {/* 移动端：水平滚动标签栏；桌面端：纵向列表 */}
          <div className="flex lg:flex-col gap-2 lg:gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
            {walls
              .filter(w => !w.deleted_at)
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map((wall, idx) => (
                <div key={wall.id} className="relative flex-shrink-0 lg:flex-shrink">
                  {dropWallIdx === idx && dragWallIdx !== idx && (
                    <div className="absolute -top-0.5 left-0 right-0 h-0.5 bg-primary-600 rounded-full z-10 hidden lg:block" />
                  )}
                  <button
                    draggable
                    onDragStart={() => setDragWallIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragWallIdx !== idx) setDropWallIdx(idx)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragWallIdx !== null && dropWallIdx !== null && dragWallIdx !== dropWallIdx) {
                        const sortedWalls = walls
                          .filter(w => !w.deleted_at)
                          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                        const newOrder = sortedWalls.map(w => w.id)
                        const [removed] = newOrder.splice(dragWallIdx, 1)
                        newOrder.splice(dropWallIdx, 0, removed)
                        reorderWalls(newOrder)
                      }
                      setDragWallIdx(null)
                      setDropWallIdx(null)
                    }}
                    onDragEnd={() => {
                      setDragWallIdx(null)
                      setDropWallIdx(null)
                    }}
                    onClick={() => setActiveWallId(wall.id)}
                    className={`w-auto lg:w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-button text-sm whitespace-nowrap transition-all ${
                      activeWallId === wall.id
                        ? 'bg-primary-600 text-white'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    } ${dragWallIdx === idx ? 'opacity-40' : ''}`}
                  >
                    <span className="truncate">{wall.name}</span>
                    <span className="text-xs opacity-60">
                      {notes.filter(n => n.wall_id === wall.id && !n.deleted_at).length}
                    </span>
                  </button>
                </div>
              ))}
          </div>
        </div>
        )}

        {/* 贴纸区域 */}
        <div className="flex-1 min-w-0">
          {activeWall ? (
            <>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 lg:mb-6">
                <div>
                  <h1 className="page-title mb-0">{activeWall.name}</h1>
                  {activeWall.description && (
                    <p className="text-sm text-[var(--text-secondary)]">{activeWall.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
                  {/* 编辑墙信息按钮：受 notesWalls 开关控制 */}
                  {flags.notesWalls !== false && (
                  <button
                    onClick={() => { resetWallForm(); setEditingWall(activeWall); setWallForm({ name: activeWall.name, description: activeWall.description }); setShowWallModal(true) }}
                    className="btn-secondary text-sm"
                  >
                    编辑墙信息
                  </button>
                  )}
                  <button
                    onClick={() => { resetNoteForm(); setShowNoteModal(true) }}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={16} />
                    新建贴纸
                  </button>
                </div>
              </div>

              {/* 贴纸 masonry 布局 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                {wallNotes.map((note, idx) => renderNoteCard(note, idx))}
                </AnimatePresence>
              </div>

              {wallNotes.length === 0 && (
                <div className="empty-state">
                  <StickyNote size={48} className="text-[var(--text-tertiary)] mb-3" />
                  <p className="text-[var(--text-secondary)]">墙上还没有贴纸</p>
                  <button onClick={() => { resetNoteForm(); setShowNoteModal(true) }} className="btn-primary mt-4">
                    创建第一张
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
              <StickyNote size={48} className="text-[var(--text-tertiary)] mb-3" />
              <p className="text-[var(--text-secondary)]">选择一个主题墙开始</p>
            </div>
          )}
        </div>
      </div>

      {/* 墙弹窗 */}
      <Modal
        isOpen={showWallModal}
        onClose={() => { setShowWallModal(false); resetWallForm() }}
        title={editingWall ? '编辑主题墙' : '新建主题墙'}
        footer={
          <>
            <button onClick={() => { setShowWallModal(false); resetWallForm() }} className="btn-secondary">取消</button>
            <button onClick={handleSaveWall} className="btn-primary">{editingWall ? '保存' : '创建'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">名称</label>
            <input type="text" value={wallForm.name} onChange={e => setWallForm(prev => ({ ...prev, name: e.target.value }))} placeholder="主题墙名称" className="input-dark" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">描述</label>
            <textarea value={wallForm.description} onChange={e => setWallForm(prev => ({ ...prev, description: e.target.value }))} placeholder="描述（可选）" rows={2} className="input-dark resize-none" />
          </div>
          {editingWall && (
            <div className="pt-2 border-t border-[var(--border-color)]">
              <button
                onClick={() => {
                  setShowWallModal(false)
                  resetWallForm()
                  setConfirmDeleteWall(editingWall.id)
                }}
                className="text-xs text-danger/60 hover:text-danger transition-colors"
              >
                删除此主题墙
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* 贴纸弹窗 - 支持图片和音频上传 */}
      <Modal
        isOpen={showNoteModal}
        onClose={() => { setShowNoteModal(false); resetNoteForm() }}
        title={editingNote ? '编辑贴纸' : '新建贴纸'}
        footer={
          <>
            <button onClick={() => { setShowNoteModal(false); resetNoteForm() }} className="btn-secondary">取消</button>
            <button onClick={handleSaveNote} className="btn-primary">{editingNote ? '保存' : '创建'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">内容（可选，支持纯图片或纯音频）</label>
            <textarea
              value={noteForm.content}
              onChange={e => setNoteForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="写下你的想法..."
              rows={4}
              className="input-dark resize-none"
            />
          </div>

          {/* 图片上传 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              图片（最多4张）
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              {/* 已上传图片预览 */}
              {noteForm.images.map((img, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border-color)]">
                  <img src={img} alt={`预览${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-0.5 right-0.5 p-1 lg:p-0.5 bg-black/50 rounded-full text-white hover:bg-black/70 flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {/* 添加图片按钮 */}
              {noteForm.images.length < 4 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-[var(--border-color)] flex flex-col items-center justify-center gap-1 text-[var(--text-tertiary)] hover:border-primary-600 hover:text-primary-600 transition-colors"
                >
                  <ImageIcon size={20} />
                  <span className="text-xs">添加图片</span>
                </button>
              )}
            </div>
          </div>

          {/* 音频上传 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              音频（最多3个，支持 MP3 / WAV / OGG）
            </label>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.aac"
              multiple
              onChange={handleAudioUpload}
              className="hidden"
            />
            <div className="space-y-2">
              {/* 已上传音频列表 */}
              {noteForm.audios.map((audio, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                  <Volume2 size={16} className="text-primary-600 shrink-0" />
                  <span className="text-sm text-[var(--text-secondary)] flex-1 truncate">音频 {idx + 1}</span>
                  <button
                    onClick={() => removeAudio(idx)}
                    className="p-1.5 lg:p-1 hover:bg-black/10 rounded text-[var(--text-tertiary)] flex items-center justify-center"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              {/* 添加音频按钮 */}
              {noteForm.audios.length < 3 && (
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full h-11 lg:h-10 rounded-lg border-2 border-dashed border-[var(--border-color)] flex items-center justify-center gap-1.5 text-[var(--text-tertiary)] hover:border-primary-600 hover:text-primary-600 transition-colors"
                >
                  <Volume2 size={18} />
                  <span className="text-sm">添加音频</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">颜色主题</label>
            <div className="flex gap-2 flex-wrap">
              {colorPresets.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => setNoteForm(prev => ({ ...prev, color: preset.color, background: preset.background }))}
                  className={`w-11 h-11 lg:w-10 lg:h-10 rounded-button border-2 transition-all ${
                    noteForm.background === preset.background ? 'border-primary-600 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: preset.background }}
                  title={preset.name}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 留言弹窗（快捷添加） */}
      <Modal
        isOpen={!!commentNoteId}
        onClose={() => { setCommentNoteId(null); setCommentText('') }}
        title="添加留言"
        footer={
          <>
            <button onClick={() => { setCommentNoteId(null); setCommentText('') }} className="btn-secondary">取消</button>
            <button onClick={handleAddComment} className="btn-primary">发送</button>
          </>
        }
      >
        <div>
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="写下你的留言..."
            rows={3}
            className="input-dark resize-none"
          />
        </div>
      </Modal>

      {confirmDeleteWall && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDeleteWall(null)}
          onConfirm={() => {
            const wall = walls.find(w => w.id === confirmDeleteWall)
            if (wall) {
              deleteWall(wall.id)
              if (user) {
                syncDelete('note_walls', wall.id, user.id).then(r => {
                  if (!r.success) console.error('[Notes] Failed to delete wall from cloud:', r.error)
                })
              }
              if (activeWallId === wall.id) setActiveWallId(null)
            }
            setConfirmDeleteWall(null)
          }}
          title="确认删除主题墙"
          message="删除后墙及所有贴纸将进入回收站。"
          type="danger"
        />
      )}

      {confirmDeleteNote && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDeleteNote(null)}
          onConfirm={() => {
            const note = notes.find(n => n.id === confirmDeleteNote)
            if (note) {
              deleteNote(note.id)
              if (user) {
                syncDelete('notes', note.id, user.id).then(r => {
                  if (!r.success) console.error('[Notes] Failed to delete note from cloud:', r.error)
                })
              }
            }
            setConfirmDeleteNote(null)
          }}
          title="确认删除贴纸"
          message="删除后贴纸将进入回收站。"
          type="danger"
        />
      )}

      {/* 留言详情 Modal - 全屏 */}
      {showAllComments && (() => {
        const note = notes.find(n => n.id === showAllComments)
        if (!note) return null
        const sortedComments = [...note.comments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        return (
          <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4" onClick={() => setShowAllComments(null)}>
            <div className="bg-[var(--bg-primary)] rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[85vh] mx-0 md:mx-4 flex flex-col shadow-xl" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {/* 移动端拖拽指示条 */}
              <div className="flex justify-center pt-2 pb-1 md:hidden">
                <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
              </div>
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">留言详情</h3>
                <button onClick={() => setShowAllComments(null)} className="p-1.5 rounded-button hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  <X size={18} />
                </button>
              </div>

              {/* 正文区域 - 更大字号 */}
              <div className="p-5 border-b border-[var(--border-color)]">
                {note.content.text ? (
                  <p className="text-lg text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words overflow-wrap break-words">{note.content.text}</p>
                ) : null}
                {note.image_ids && note.image_ids.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {note.image_ids.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        className="w-24 h-24 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewImage(img)}
                      />
                    ))}
                  </div>
                )}
                {/* 音频播放区域 */}
                {note.audio_ids && note.audio_ids.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {note.audio_ids.map((audio, i) => {
                      try {
                        const mimeType = (audio.match(/^data:([^;]+)/) || [])[1] || 'audio/mpeg'
                        const base64 = audio.split(',')[1]
                        if (!base64) return <div key={i} className="text-xs opacity-50">音频数据无效</div>
                        const byteChars = atob(base64)
                        const bytes = new Uint8Array(byteChars.length)
                        for (let j = 0; j < byteChars.length; j++) bytes[j] = byteChars.charCodeAt(j)
                        const blob = new Blob([bytes], { type: mimeType })
                        const blobUrl = URL.createObjectURL(blob)
                        return (
                          <audio
                            key={i}
                            controls
                            src={blobUrl}
                            className="w-full"
                            style={{ height: '36px' }}
                            preload="metadata"
                          />
                        )
                      } catch (e) {
                        console.error('[Audio Modal] Failed to load audio:', e)
                        return <div key={i} className="text-xs opacity-50">音频加载失败</div>
                      }
                    })}
                  </div>
                )}
                <p className="text-sm text-[var(--text-tertiary)] mt-3">{formatTime(note.created_at)}</p>
              </div>

              {/* 留言列表 */}
              <div className="flex-1 overflow-y-auto p-5">
                <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">全部留言 ({note.comments.length})</h4>
                <div className="space-y-3">
                  {sortedComments.map(comment => (
                    <div key={comment.id} className="flex gap-3 group/comment">
                      <div className="w-8 h-8 rounded-full bg-[#6B4C9A] flex items-center justify-center text-white text-xs shrink-0 select-none">
                        匿
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-medium text-[var(--text-primary)]">匿名</span>
                          <span className="text-xs text-[var(--text-tertiary)]">{formatTime(comment.created_at)}</span>
                        </div>
                        <p className="text-base text-[var(--text-secondary)] mt-1 break-words overflow-wrap break-words">{comment.text}</p>
                      </div>
                      <button
                        onClick={() => deleteComment(note.id, comment.id)}
                        className="text-[var(--text-tertiary)] hover:text-danger lg:opacity-0 lg:group-hover/comment:opacity-100 opacity-70 transition-opacity p-1.5 shrink-0 flex items-center justify-center"
                        title="删除留言"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {sortedComments.length === 0 && (
                    <p className="text-sm text-[var(--text-tertiary)] text-center py-8">暂无留言</p>
                  )}
                </div>
              </div>

              {/* 底部输入框 */}
              <div className="p-4 border-t border-[var(--border-color)]">
                <div className="flex gap-2">
                  <textarea
                    value={modalCommentText}
                    onChange={e => setModalCommentText(e.target.value)}
                    placeholder="写下你的留言..."
                    rows={2}
                    className="input-dark resize-none flex-1"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleModalAddComment()
                      }
                    }}
                  />
                  <button
                    onClick={handleModalAddComment}
                    disabled={!modalCommentText.trim()}
                    className="btn-primary self-end px-3 disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 图片预览 Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setPreviewImage(null)}>
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10 flex items-center justify-center"
          >
            <X size={24} />
          </button>
          <img
            src={previewImage}
            alt="图片预览"
            className="max-w-[92vw] max-h-[85vh] md:max-w-[90vw] md:max-h-[90vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

export default NotesPage

