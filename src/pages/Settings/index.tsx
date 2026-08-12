import React, { useState } from 'react'
import { useAppStore, usePoinStore, APP_VERSION } from '@/store'
import { motion, AnimatePresence } from 'framer-motion'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { savePoinConfig } from '@/lib/poin'
import {
  Moon, Lock, Unlock,
  ChevronRight, ChevronDown, ChevronUp, LogOut, User, Clock, Info, Edit, StickyNote, Coins,
} from '@/utils/icons'
import type { FeatureFlags } from '@/types'

const SettingsPage: React.FC = () => {
  const navigate = useNavigate()
  const {
    user,
    settings,
    updateSettings,
    theme,
    toggleTheme,
    logout,
    setLockScreen,
    addNotification,
    setUser,
    modules
  } = useAppStore()
  const { config: poinConfig, balance: poinBalance } = usePoinStore()

  const [showLockPassword, setShowLockPassword] = useState(false)
  const [lockPassword, setLockPassword] = useState('')
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [showEditName, setShowEditName] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(false)
  // 个性化设置折叠状态：整体默认折叠，各板块独立展开
  const [showPersonalization, setShowPersonalization] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  

  // 图标映射
  // 初始化：读取当前开机自启动状态
  React.useEffect(() => {
    const api = (window as any).electronAPI
    if (api?.getAutoLaunch) {
      api.getAutoLaunch().then((enabled: boolean) => setAutoLaunch(enabled))
    }
  }, [])

  // 切换开机自启动
  const toggleAutoLaunch = async () => {
    const api = (window as any).electronAPI
    if (!api?.setAutoLaunch) {
      addNotification({ message: '当前环境不支持开机自启动设置', type: 'warning' })
      return
    }
    const next = !autoLaunch
    // 乐观更新：立即切换 UI 状态
    setAutoLaunch(next)
    try {
      const result = await api.setAutoLaunch(next)
      // 如果 API 返回值与预期不同，回退
      if (result !== next) {
        setAutoLaunch(result)
        addNotification({ message: result ? '已开启开机自启动' : '已关闭开机自启动', type: 'success' })
      } else {
        addNotification({ message: next ? '已开启开机自启动' : '已关闭开机自启动', type: 'success' })
      }
    } catch {
      // 失败时回退
      setAutoLaunch(!next)
      addNotification({ message: '设置开机自启动失败，请重试', type: 'error' })
    }
  }
  const [newUsername, setNewUsername] = useState('')
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handleSetLockPassword = () => {
    if (!lockPassword.trim()) return
    const hashed = btoa(lockPassword)
    setLockScreen({
      passwordHash: hashed,
      isLocked: false,
      failedAttempts: 0,
      lockUntil: null
    })
    updateSettings({ lockScreenEnabled: true })
    setShowLockPassword(false)
    setLockPassword('')
    addNotification({ message: '锁屏密码已设置', type: 'success' })
  }

  const handleRemoveLock = () => {
    setLockScreen({
      passwordHash: '',
      isLocked: false,
      failedAttempts: 0,
      lockUntil: null
    })
    updateSettings({ lockScreenEnabled: false })
    addNotification({ message: '锁屏密码已移除', type: 'success' })
  }

  const handleSaveUsername = async () => {
    if (!newUsername.trim()) return
    if (!user) return
    try {
      // 更新 supabase users 表
      const { error } = await supabase
        .from('users')
        .update({ username: newUsername.trim() })
        .eq('id', user.id)
      if (error) throw error
      // 更新本地 store
      setUser({ ...user, username: newUsername.trim() })
      addNotification({ message: '昵称修改成功', type: 'success' })
      setShowEditName(false)
    } catch {
      addNotification({ message: '昵称修改失败，请重试', type: 'error' })
    }
  }

  const handleChangePassword = async () => {
    setPasswordError('')
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('请填写所有密码字段')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码至少需要6个字符')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }
    try {
      // 先用旧密码验证用户身份
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: oldPassword,
      })
      if (signInError) {
        setPasswordError('旧密码不正确')
        return
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      addNotification({ message: '密码修改成功', type: 'success' })
      setShowChangePassword(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setPasswordError('密码修改失败，请重试')
    }
  }

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className="relative min-h-[44px] min-w-[44px] flex items-center justify-center p-2"
    >
      <span className={`relative block w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-[var(--border-color)]'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )

  // 个性化功能：当前功能开关取值（未配置时默认空对象，开关读取时再兜底为 true）
  const featureFlags: FeatureFlags = settings.featureFlags || {}
  // 更新单个功能开关：合并已有 featureFlags 后整体写入 settings
  const updateFlag = (key: keyof FeatureFlags, value: boolean) =>
    updateSettings({ featureFlags: { ...settings.featureFlags, [key]: value } })

  // Poin 配置更新
  const handlePoinConfigChange = async (key: 'enable' | 'allow_overdraft' | 'save_log', value: boolean) => {
    const newConfig = { ...poinConfig, [key]: value }
    if (user) {
      try {
        // savePoinConfig 内部会乐观更新本地，失败时自动回滚
        await savePoinConfig(user.id, newConfig)
      } catch (e: any) {
        addNotification({ message: 'Poin 设置保存失败，请检查网络后重试', type: 'error' })
        console.error('[Settings] savePoinConfig failed:', e)
      }
    }
  }

  // 切换板块展开/折叠
  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  // 个性化功能分组配置：每个板块包含若干开关
  const featureSections: { title: string; flags: { key: keyof FeatureFlags; label: string }[] }[] = [
    {
      title: '待办任务',
      flags: [
        { key: 'todoPriority', label: '优先级' },
        { key: 'todoSubtasks', label: '子任务' },
        { key: 'todoTags', label: '标签' },
        { key: 'todoDueDate', label: '截止日期' },
      ],
    },
    {
      title: '日程',
      flags: [
        { key: 'scheduleAllDay', label: '全天事件' },
        { key: 'scheduleRepeat', label: '重复' },
        { key: 'scheduleLocation', label: '地点' },
      ],
    },
    {
      title: '习惯打卡',
      flags: [
        { key: 'habitNegative', label: '消极习惯' },
        { key: 'habitCheckinNote', label: '打卡备注' },
      ],
    },
    {
      title: '实时记录',
      flags: [
        { key: 'trackerNote', label: '记录备注' },
        { key: 'trackerHeatmap', label: '热力图' },
        { key: 'trackerUnit', label: '单位' },
      ],
    },
    {
      title: '随心贴',
      flags: [
        { key: 'notesWalls', label: '主题墙' },
      ],
    },
    {
      title: '规划',
      flags: [
        { key: 'planSchedule', label: '落地日程' },
      ],
    },
  ]

  const settingsGroups = [
    {
      title: '外观',
      items: [
        {
          icon: Moon,
          label: '暗色模式',
          action: toggleTheme,
          toggle: true,
          toggleValue: theme === 'dark'
        }
      ]
    },
    {
      title: '安全',
      items: [
        {
          icon: settings.lockScreenEnabled ? Lock : Unlock,
          label: '锁屏密码',
          value: settings.lockScreenEnabled ? '已启用' : '未启用',
          action: () => {
            if (settings.lockScreenEnabled) handleRemoveLock()
            else setShowLockPassword(true)
          },
          toggle: false
        },
        {
          icon: Clock,
          label: '自动锁定',
          value: settings.autoLockEnabled ? `${settings.autoLockTimeout}分钟后锁定` : '已关闭',
          action: () => updateSettings({ autoLockEnabled: !settings.autoLockEnabled }),
          toggle: true,
          toggleValue: settings.autoLockEnabled
        }
      ]
    },
    {
      title: '登录',
      items: [
        {
          icon: User,
          label: '自动登录',
          value: settings.autoLogin ? '已开启' : '已关闭',
          action: () => {
            const next = !settings.autoLogin
            // 自动登录开启时自动开启记住密码
            if (next) {
              updateSettings({ autoLogin: true, rememberPassword: true })
              localStorage.setItem('privahub_auto_login', 'true')
              localStorage.setItem('privahub_remember_password', 'true')
            } else {
              updateSettings({ autoLogin: false })
              localStorage.setItem('privahub_auto_login', 'false')
            }
          },
          toggle: true,
          toggleValue: settings.autoLogin
        },
        {
          icon: User,
          label: '记住密码',
          value: settings.rememberPassword ? '已开启' : '已关闭',
          action: () => {
            const next = !settings.rememberPassword
            updateSettings({ rememberPassword: next })
            localStorage.setItem('privahub_remember_password', String(next))
            // 关闭记住密码时同时关闭自动登录
            if (!next) {
              updateSettings({ autoLogin: false })
              localStorage.setItem('privahub_auto_login', 'false')
              localStorage.removeItem('privahub_saved_password')
            }
          },
          toggle: true,
          toggleValue: settings.rememberPassword
        }
      ]
    },
    {
      title: '通用',
      items: [
        {
          icon: Clock,
          label: '开机自启动',
          value: autoLaunch ? '已开启' : '已关闭',
          action: () => toggleAutoLaunch(),
          toggle: true,
          toggleValue: autoLaunch
        }
      ]
    },
    {
      title: 'Poin 货币系统',
      items: [
        {
          icon: Coins,
          label: '开启 Poin 体系',
          value: poinConfig.enable ? `余额 ${poinBalance}` : '未开启',
          action: () => handlePoinConfigChange('enable', !poinConfig.enable),
          toggle: true,
          toggleValue: poinConfig.enable
        }
      ]
    }
  ]

  return (
    <div className="page-container">
      <div className="max-w-2xl mx-auto">
        <h1 className="page-title">设置</h1>

        {/* 用户信息卡片 */}
        <div className="card mb-6">
          <div className="flex items-center gap-4">
            {user?.avatar ? (
              <img src={user.avatar} alt="头像" className="w-14 h-14 rounded-card object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-card bg-primary-600/10 flex items-center justify-center">
                <User size={24} className="text-primary-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">{user?.username || '用户'}</h2>
              <p className="text-sm text-[var(--text-secondary)]">{user?.email || ''}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { setNewUsername(user?.username || ''); setShowEditName(true) }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 md:py-2 text-sm rounded-button border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors min-h-[44px]"
            >
              <Edit size={14} />
              修改昵称
            </button>
            <button
              onClick={() => { setOldPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); setShowChangePassword(true) }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 md:py-2 text-sm rounded-button border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors min-h-[44px]"
            >
              <Lock size={14} />
              修改密码
            </button>
          </div>
        </div>

        {/* 设置列表 */}
        <div className="space-y-6">
          {settingsGroups.map((group, idx) => (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={group.title === '通用' ? 'hidden md:block' : ''}
            >
              <h2 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2 px-1">
                {group.title}
              </h2>
              <div className="card divide-y divide-[var(--border-color)]">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className="flex items-center justify-between py-3.5 px-2 md:px-1 min-h-[52px]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon size={18} className="text-[var(--text-secondary)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                        {item.toggle ? (
                          <div className="flex items-center gap-2">
                            {item.label === '自动锁定' && item.toggleValue && (
                              <select
                                value={settings.autoLockTimeout}
                                onChange={e => updateSettings({ autoLockTimeout: Number(e.target.value) })}
                                onClick={e => e.stopPropagation()}
                                className="text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1.5 md:py-1 text-[var(--text-primary)] min-h-[36px]"
                              >
                                <option value={5}>5分钟</option>
                                <option value={10}>10分钟</option>
                                <option value={15}>15分钟</option>
                                <option value={30}>30分钟</option>
                                <option value={60}>1小时</option>
                              </select>
                            )}
                            <ToggleSwitch checked={item.toggleValue!} onChange={item.action} />
                          </div>
                        ) : (
                          <>
                            <span className="text-sm text-[var(--text-tertiary)]">{item.value}</span>
                            <button onClick={item.action} className="p-2 md:p-1 hover:bg-[var(--bg-tertiary)] rounded min-h-[44px] md:min-h-0 min-w-[44px] flex items-center justify-center">
                              <ChevronRight size={16} className="text-[var(--text-tertiary)]" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          ))}

          {/* 个性化功能 —— 可折叠子菜单 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: settingsGroups.length * 0.05 }}
          >
            <div className="card shadow-card overflow-hidden">
              {/* 折叠头部 */}
              <button
                onClick={() => setShowPersonalization(!showPersonalization)}
                className="w-full flex items-center justify-between px-4 py-4 md:py-3.5 hover:bg-[var(--bg-tertiary)] transition-colors min-h-[52px]"
              >
                <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">个性化功能</span>
                {showPersonalization
                  ? <ChevronDown size={16} className="text-[var(--text-tertiary)]" />
                  : <ChevronRight size={16} className="text-[var(--text-tertiary)]" />}
              </button>

              {/* 展开内容 */}
              <AnimatePresence>
                {showPersonalization && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-[var(--border-color)] border-t border-[var(--border-color)]">
                      {featureSections.map((section) => {
                        const isExpanded = expandedSections.has(section.title)
                        return (
                          <div key={section.title}>
                            {/* 子菜单头部 */}
                            <button
                              onClick={() => toggleSection(section.title)}
                              className="w-full flex items-center justify-between px-4 py-3 md:py-2.5 hover:bg-[var(--bg-tertiary)] transition-colors min-h-[48px]"
                            >
                              <span className="text-sm text-[var(--text-primary)] font-medium">{section.title}</span>
                              {isExpanded
                                ? <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
                                : <ChevronRight size={14} className="text-[var(--text-tertiary)]" />}
                            </button>
                            {/* 子菜单内容 */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-3 space-y-1">
                                    {section.flags.map((flag) => {
                                      const checked = featureFlags[flag.key] !== false
                                      return (
                                        <div key={flag.key} className="flex items-center justify-between min-h-[44px] py-1">
                                          <span className="text-sm text-[var(--text-secondary)]">{flag.label}</span>
                                          <ToggleSwitch
                                            checked={checked}
                                            onChange={() => updateFlag(flag.key, !checked)}
                                          />
                                        </div>
                                      )
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

                {/* 关于 PrivaHub */}
        <div className="mt-2">
          <div className="card">
            <button
              onClick={() => navigate('/about')}
              className="w-full flex items-center justify-between p-3 md:p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left min-h-[52px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Info size={18} className="text-[var(--text-secondary)] flex-shrink-0" />
                <span className="text-sm text-[var(--text-primary)]">关于 PrivaHub</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[var(--text-tertiary)]">v{APP_VERSION}</span>
                <ChevronRight size={16} className="text-[var(--text-tertiary)]" />
              </div>
            </button>
          </div>
        </div>

        {/* 退出登录 */}
        <button
          onClick={() => setConfirmLogout(true)}
          className="w-full mt-6 py-3 md:py-3 rounded-button bg-danger/10 text-danger font-medium text-sm hover:bg-danger/20 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
        >
          <LogOut size={16} />
          退出登录
        </button>
      </div>

      {/* 锁屏密码弹窗 */}
      {showLockPassword && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 overflow-y-auto">
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">设置锁屏密码</h3>
              <input
                type="password"
                value={lockPassword}
                onChange={e => setLockPassword(e.target.value)}
                placeholder="输入4位以上密码"
                className="input-dark mb-4"
                autoFocus
              />
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => { setShowLockPassword(false); setLockPassword('') }} className="btn-secondary">
                  取消
                </button>
                <button onClick={handleSetLockPassword} className="btn-primary">
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 修改昵称弹窗 */}
      {showEditName && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 overflow-y-auto">
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">修改昵称</h3>
              <input
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="输入新昵称"
                className="input-dark mb-4"
                autoFocus
              />
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setShowEditName(false)} className="btn-secondary">
                  取消
                </button>
                <button onClick={handleSaveUsername} className="btn-primary">
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showChangePassword && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-4 overflow-y-auto">
              <h3 className="text-lg font-medium text-[var(--text-primary)]">修改密码</h3>
              <div>
                <label className="block text-sm font-medium mb-1.5">旧密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  placeholder="输入当前密码"
                  className="input-dark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="输入新密码（至少6位）"
                  className="input-dark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="input-dark"
                />
              </div>
              {passwordError && (
                <p className="text-xs text-danger">{passwordError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setShowChangePassword(false)} className="btn-secondary">
                  取消
                </button>
                <button onClick={handleChangePassword} className="btn-primary">
                  确认修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 退出确认 */}
      <ConfirmDialog
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          logout()
          setConfirmLogout(false)
        }}
        title="确认退出登录"
        message="退出后需要重新登录才能使用工作台。"
        type="warning"
      />
    </div>
  )
}

export default SettingsPage


