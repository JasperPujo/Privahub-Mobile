import { useState, useCallback, useRef } from 'react'

/**
 * 通用拖拽排序 Hook（基于 HTML5 Drag and Drop API）
 * 用法：
 * const { dragIndex, draggedOver, handleDragStart, handleDragOver, handleDragEnd, handleDrop } = useDragReorder(items, onReorder)
 * 
 * 在列表项上：
 * <div draggable onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDrop={() => handleDrop(index)} onDragEnd={handleDragEnd}>
 */
export function useDragReorder<T extends { id: string }>(items: T[], onReorder: (newOrder: string[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [draggedOver, setDraggedOver] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
    dragIndexRef.current = index
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
      setDraggedOver(index)
    }
  }, [])

  const handleDrop = useCallback((index: number) => {
    const from = dragIndexRef.current
    if (from === null || from === index) {
      reset()
      return
    }
    const newItems = [...items]
    const [moved] = newItems.splice(from, 1)
    newItems.splice(index, 0, moved)
    onReorder(newItems.map(i => i.id))
    reset()
  }, [items, onReorder])

  const handleDragEnd = useCallback(() => {
    reset()
  }, [])

  const reset = () => {
    setDragIndex(null)
    setDraggedOver(null)
    dragIndexRef.current = null
  }

  return {
    dragIndex,
    draggedOver,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  }
}
