import { useState, useEffect } from 'react'

export type DeviceType = 'phone' | 'tablet' | 'desktop'
export type Orientation = 'portrait' | 'landscape'

export interface DeviceInfo {
  device: DeviceType
  orientation: Orientation
  isTouch: boolean
  isPhone: boolean
  isTablet: boolean
  isDesktop: boolean
  isMobile: boolean          // 手机或平板竖屏（使用移动布局）
  useMobileLayout: boolean   // 是否使用移动端布局
  screenWidth: number
  screenHeight: number
  isLandscape: boolean
  isPortrait: boolean
  breakpoint: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  safeAreaTop: number
  safeAreaBottom: number
  isNative: boolean
  isElectron: boolean
  isPWA: boolean
  isAndroid: boolean
  isIOS: boolean
  minScreenDimension: number
  devicePixelRatio: number
}

/**
 * 设备检测 Hook
 * 
 * 布局切换逻辑：
 * - 屏幕宽度 < 1024px → 移动端布局（手机 + 平板竖屏）
 * - 屏幕宽度 >= 1024px → 桌面端布局（桌面 + 平板横屏）
 * 
 * 设备类型检测：
 * - 触摸设备 + 最小维度 < 768px → phone
 * - 触摸设备 + 最小维度 >= 768px → tablet
 * - 非触摸设备 → desktop
 */
export function useDevice(): DeviceInfo {
  const getDeviceInfo = (): DeviceInfo => {
    if (typeof window === 'undefined') {
      return {
        device: 'desktop', orientation: 'landscape', isTouch: false,
        isPhone: false, isTablet: false, isDesktop: true,
        isMobile: false, useMobileLayout: false,
        screenWidth: 1920, screenHeight: 1080,
        isLandscape: true, isPortrait: false,
        breakpoint: 'xl', safeAreaTop: 0, safeAreaBottom: 0,
        isNative: false, isElectron: false, isPWA: false,
        isAndroid: false, isIOS: false,
        minScreenDimension: 1080, devicePixelRatio: 1,
      }
    }

    const width = window.innerWidth
    const height = window.innerHeight
    const dpr = window.devicePixelRatio || 1
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    const isLandscape = width > height
    const isPortrait = !isLandscape
    const minDim = Math.min(width, height)
    const ua = navigator.userAgent || ''

    // 断点
    let breakpoint: DeviceInfo['breakpoint'] = 'sm'
    if (width >= 1536) breakpoint = '2xl'
    else if (width >= 1280) breakpoint = 'xl'
    else if (width >= 1024) breakpoint = 'lg'
    else if (width >= 768) breakpoint = 'md'
    else breakpoint = 'sm'

    // 设备类型检测
    let device: DeviceType = 'desktop'
    let isPhone = false
    let isTablet = false
    let isDesktop = false

    if (isTouch || /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) {
      if (minDim < 768) {
        device = 'phone'
        isPhone = true
      } else {
        device = 'tablet'
        isTablet = true
      }
    } else {
      device = 'desktop'
      isDesktop = true
    }

    // 移动布局判定：< 1024px 使用移动端布局
    const useMobileLayout = width < 1024
    const isMobile = isPhone || isTablet

    // Safe area
    const rootStyle = getComputedStyle(document.documentElement)
    const safeAreaTop = parseInt(rootStyle.getPropertyValue('--sat') || '0', 10) || 0
    const safeAreaBottom = parseInt(rootStyle.getPropertyValue('--sab') || '0', 10) || 0

    // 环境检测
    const isElectron = !!(window as any).electronAPI
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  (navigator as any).standalone === true
    const isAndroid = /Android/i.test(ua)
    const isIOS = /iPad|iPhone|iPod/.test(ua) || 
                  (/Macintosh/.test(ua) && isTouch)

    return {
      device,
      orientation: isLandscape ? 'landscape' : 'portrait',
      isTouch,
      isPhone,
      isTablet,
      isDesktop,
      isMobile,
      useMobileLayout,
      screenWidth: width,
      screenHeight: height,
      isLandscape,
      isPortrait,
      breakpoint,
      safeAreaTop,
      safeAreaBottom,
      isNative: isElectron,
      isElectron,
      isPWA,
      isAndroid,
      isIOS,
      minScreenDimension: minDim,
      devicePixelRatio: dpr,
    }
  }

  const [info, setInfo] = useState<DeviceInfo>(getDeviceInfo)

  useEffect(() => {
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setInfo(getDeviceInfo()))
    }

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      cancelAnimationFrame(raf)
    }
  }, [])

  return info
}

export function useDeviceType(): DeviceType {
  const { device } = useDevice()
  return device
}

/**
 * 简单的移动布局检测：不需要 Hook 的场景使用
 */
export function shouldUseMobileLayout(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 1024
}
