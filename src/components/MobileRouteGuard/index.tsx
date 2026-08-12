import React, { useState, useEffect } from 'react'
import NotAvailable from '@/components/NotAvailable'

interface MobileRouteGuardProps {
  children: React.ReactNode
  title?: string
  description?: string
}

/**
 * 移动端路由守卫
 * 在移动端（屏幕宽度 < 1024px）时显示「暂未开放」页面，桌面端正常显示内容
 */
const MobileRouteGuard: React.FC<MobileRouteGuardProps> = ({
  children,
  title = '暂未开放',
  description = '此功能正在移动端适配中，请暂时在电脑端使用。',
}) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1024
  })

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (isMobile) {
    return <NotAvailable title={title} description={description} />
  }

  return <>{children}</>
}

export default MobileRouteGuard
