import { useEffect, useRef } from 'react'
import { useFocusStore } from '@/store/focusStore'

/**
 * 全局专注计时器
 * 在 App.tsx 中调用一次，计时器独立于 Focus 页面组件运行
 * 即使切换到其他页面，计时器也不会停止
 *
 * 优化点：
 * 1. interval 只依赖 isRunning，避免因 mode/isRest/targetDuration 变化导致 interval 重建
 * 2. 移除 setElapsed 更新函数内的副作用（setRunning），改用独立 effect 处理自动停止
 * 3. 添加番茄钟模式自动停止逻辑（原来只在 Focus 页面 useEffect 中，离开页面后会失效）
 * 4. 使用 ref 存储 mode，避免在 auto-stop effect 中引入额外依赖
 */
export function useGlobalFocusTimer() {
  const isRunning = useFocusStore((s) => s.isRunning)
  const mode = useFocusStore((s) => s.mode)
  const targetDuration = useFocusStore((s) => s.targetDuration)
  const elapsed = useFocusStore((s) => s.elapsed)
  const setElapsed = useFocusStore((s) => s.setElapsed)
  const setRunning = useFocusStore((s) => s.setRunning)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 使用 ref 存储 mode，auto-stop effect 中通过 ref 读取，避免将其加入依赖数组
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  // 计时器 interval：只依赖 isRunning，确保 interval 不会因其他状态变化而被重建
  useEffect(() => {
    if (!isRunning) return

    timerRef.current = setInterval(() => {
      // 仅递增 elapsed，不在此处做任何副作用
      setElapsed((prev: number) => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRunning, setElapsed])

  // 自动停止：倒计时和番茄钟模式达到目标时自动暂停
  // 独立于 Focus 页面，即使离开页面也能正常停止
  useEffect(() => {
    if (!isRunning) return
    if (targetDuration <= 0) return
    // 正计时模式不自动停止
    if (modeRef.current === 'countUp') return

    if (elapsed >= targetDuration) {
      setRunning(false)
    }
  }, [isRunning, elapsed, targetDuration, setRunning])
}
