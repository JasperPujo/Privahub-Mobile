import { supabase } from './supabase'

/**
 * 单设备登录限制工具
 *
 * 策略：利用 users 表的 settings JSONB 字段存储 active_desktop_device_id
 * - 登录时写入当前设备 ID
 * - 通过 Supabase Realtime 监听 users 表变更
 * - 如果 active_desktop_device_id 变为其他设备，弹出"被顶下线"提示
 * - 仅限制桌面端（Electron），不影响移动端
 */

const DEVICE_ID_KEY = 'privahub_device_id'

/** 获取或创建设备唯一 ID */
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = `desktop-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

/**
 * 注册桌面设备会话：将当前设备 ID 写入 users.settings.active_desktop_device_id
 * 如果另一台桌面设备已登录，此操作会覆盖其设备 ID，触发对方的 Realtime 监听
 */
export async function registerDesktopSession(userId: string): Promise<void> {
  const deviceId = getOrCreateDeviceId()
  try {
    const { data, error } = await supabase
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.warn('[DeviceAuth] Failed to fetch user settings:', error.message)
      return
    }

    const currentSettings = (data?.settings && typeof data.settings === 'object') ? data.settings : {}

    const { error: updateError } = await supabase
      .from('users')
      .update({
        settings: {
          ...currentSettings,
          active_desktop_device_id: deviceId,
          active_desktop_login_at: new Date().toISOString(),
        }
      })
      .eq('id', userId)

    if (updateError) {
      console.warn('[DeviceAuth] Failed to register desktop session:', updateError.message)
    } else {
      console.log('[DeviceAuth] Desktop session registered:', deviceId)
    }
  } catch (e: any) {
    console.warn('[DeviceAuth] registerDesktopSession exception:', e.message)
  }
}

/**
 * 订阅桌面设备会话变更
 * 当另一台桌面设备登录时（active_desktop_device_id 变为不同的值），触发回调
 *
 * @returns 取消订阅函数
 */
export function subscribeToDesktopSessionChanges(
  userId: string,
  onKicked: () => void
): () => void {
  const currentDeviceId = getOrCreateDeviceId()

  const channel = supabase
    .channel(`device-session-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`,
      },
      (payload: any) => {
        const newSettings = payload.new?.settings
        if (!newSettings) return

        const activeDeviceId = newSettings.active_desktop_device_id
        if (activeDeviceId && activeDeviceId !== currentDeviceId) {
          console.log('[DeviceAuth] Kicked by another device:', activeDeviceId)
          onKicked()
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * 清除桌面设备会话（登出时调用）
 */
export async function clearDesktopSession(userId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single()

    const currentSettings = (data?.settings && typeof data.settings === 'object') ? data.settings : {}

    delete currentSettings.active_desktop_device_id
    delete currentSettings.active_desktop_login_at

    await supabase
      .from('users')
      .update({ settings: currentSettings })
      .eq('id', userId)
  } catch (e: any) {
    console.warn('[DeviceAuth] clearDesktopSession exception:', e.message)
  }
}
