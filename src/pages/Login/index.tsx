import React, { useState, useEffect } from 'react'
import { useAppStore, clearAllDataStores, usePoinStore } from '@/store'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Mail, Lock, Eye, EyeOff } from '@/utils/icons'
import type { LoginForm, RegisterForm } from '@/types'
import loginBg from '@/assets/login-bg.jpg'
import appIcon from '@/assets/app-icon.png'
import { supabase } from '@/lib/supabase'
import { fetchPoinConfig, fetchBalance } from '@/lib/poin'
import { registerDesktopSession } from '@/lib/deviceAuth'

const Login: React.FC = () => {
  const { setUser, updateSettings, settings, addNotification } = useAppStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [loginForm, setLoginForm] = useState<LoginForm>({
    username: '',
    password: '',
    rememberPassword: false,
    autoLogin: false
  })
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // 读取登录信息：检测版本更新，更新后清除密码但保留邮箱
  useEffect(() => {
    const savedEmail = localStorage.getItem('privahub_last_email')
    const savedBuildId = localStorage.getItem('privahub_build_id')
    const isNewBuild = __APP_BUILD_ID__ !== savedBuildId

    if (isNewBuild || !savedBuildId) {
      // 版本更新/重装：清除密码和勾选状态，但保留邮箱
      localStorage.removeItem('privahub_saved_password')
      localStorage.removeItem('privahub_remember_password')
      localStorage.removeItem('privahub_auto_login')
      localStorage.setItem('privahub_build_id', __APP_BUILD_ID__)
      if (savedEmail) {
        setLoginForm({ username: savedEmail, password: '', rememberPassword: false, autoLogin: false })
      }
    } else {
      // 正常启动：恢复邮箱、密码（如果之前勾选了记住密码）、勾选状态
      const savedRemember = localStorage.getItem('privahub_remember_password')
      const savedAutoLogin = localStorage.getItem('privahub_auto_login')
      if (savedEmail) {
        const savedPwd = savedRemember === 'true' ? (localStorage.getItem('privahub_saved_password') || '') : ''
        setLoginForm({
          username: savedEmail,
          password: savedPwd,
          rememberPassword: savedRemember === 'true',
          autoLogin: savedAutoLogin === 'true',
        })
      }
      // 首次运行，记录 build id
      if (!savedBuildId) {
        localStorage.setItem('privahub_build_id', __APP_BUILD_ID__)
      }
    }
  }, [])

  const validateLogin = () => {
    const errs: Record<string, string> = {}
    if (!loginForm.username.trim()) errs.username = '请输入邮箱'
    if (!loginForm.password) errs.password = '请输入密码'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateRegister = () => {
    const errs: Record<string, string> = {}
    if (!registerForm.username.trim()) errs.username = '请输入用户名'
    if (!registerForm.email.trim()) errs.email = '请输入邮箱'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email)) errs.email = '邮箱格式不正确'
    if (!registerForm.password) errs.password = '请输入密码'
    else if (registerForm.password.length < 6) errs.password = '密码至少6位'
    if (registerForm.password !== registerForm.confirmPassword) errs.confirmPassword = '两次密码不一致'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleLogin = async () => {
    if (!validateLogin()) return
    setIsSubmitting(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginForm.username,
      password: loginForm.password,
    })

    if (error) {
      const errorMap: Record<string, string> = {
        'Invalid login credentials': '邮箱或密码错误',
        'Email not confirmed': '邮箱未验证，请先确认邮箱',
        'Too many requests': '请求过于频繁，请稍后再试',
        'User already registered': '该邮箱已注册',
        'Password should be at least 6 characters.': '密码至少需要6个字符',
        'Unable to validate email address: invalid format': '邮箱格式不正确',
      }
      const msg = errorMap[error.message] || error.message
      addNotification({ message: msg, type: 'error' })
      setIsSubmitting(false)
      return
    }

    // 登录成功后获取用户信息
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()

    // 如果 public.users 表中没有记录，自动创建
    if (!userData) {
      const newRecord = {
        id: data.user.id,
        email: data.user.email || loginForm.username,
        username: loginForm.username.split('@')[0],
        name: loginForm.username.split('@')[0],
        role: 'user',
      }
      const { error: insertErr } = await supabase.from('users').upsert(newRecord)
      if (insertErr) {
        console.error('[Login] Failed to create user record:', insertErr.message, insertErr.code)
      } else {
        console.log('[Login] User record created successfully')
      }
    }

    // 从 localStorage 读取备用头像
    const cachedAvatar = localStorage.getItem('user_avatar_' + data.user.id)

    // 切换账号：清除旧账号的本地数据（已删项目已在云端硬删除，不会被拉回）
    clearAllDataStores()

    setUser({
      id: data.user.id,
      username: userData?.username || userData?.name || loginForm.username.split('@')[0],
      email: data.user.email || loginForm.username,
      avatar: userData?.avatar || cachedAvatar || null,
      created_at: userData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    // 如果远端有 settings，合并到本地
    if (userData?.settings && typeof userData.settings === 'object') {
      const currentSettings = useAppStore.getState().settings
      updateSettings({ ...currentSettings, ...userData.settings })
    }

    // 恢复 Poin 配置和余额（clearAllDataStores 会重置为默认值，需从云端重新拉取）
    try {
      const poinCfg = await fetchPoinConfig(data.user.id)
      usePoinStore.getState().setConfig(poinCfg)
      if (poinCfg.enable) {
        const bal = await fetchBalance(data.user.id)
        usePoinStore.getState().setBalance(bal)
      }
    } catch (e) {
      console.warn('[Login] Failed to restore Poin config:', e)
    }

    // 保存登录信息
    localStorage.setItem('privahub_last_email', loginForm.username)
    localStorage.setItem('privahub_remember_password', String(loginForm.rememberPassword))
    localStorage.setItem('privahub_auto_login', String(loginForm.autoLogin))
    if (loginForm.rememberPassword) {
      localStorage.setItem('privahub_saved_password', loginForm.password)
    } else {
      localStorage.removeItem('privahub_saved_password')
    }

    if (loginForm.rememberPassword || loginForm.autoLogin) {
      updateSettings({ rememberPassword: loginForm.rememberPassword, autoLogin: loginForm.autoLogin })
    }

    registerDesktopSession(data.user.id)
    addNotification({ message: '登录成功', type: 'success' })
    setIsSubmitting(false)
  }

  const handleRegister = async () => {
    if (!validateRegister()) return
    setIsSubmitting(true)

    try {
      console.log('开始注册，邮箱:', registerForm.email)
      console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)
      
      const { data, error } = await supabase.auth.signUp({
        email: registerForm.email,
        password: registerForm.password,
      })

      console.log('注册结果 data:', JSON.stringify(data))
      console.log('注册结果 error:', error)

      if (error) {
        const errorMap: Record<string, string> = {
          'Invalid login credentials': '邮箱或密码错误',
          'Email not confirmed': '邮箱未验证，请先确认邮箱',
          'Too many requests': '请求过于频繁，请稍后再试',
          'User already registered': '该邮箱已注册',
          'Password should be at least 6 characters.': '密码至少需要6个字符',
          'Unable to validate email address: invalid format': '邮箱格式不正确',
        }
        const msg = errorMap[error.message] || error.message
        addNotification({ message: msg, type: 'error' })
        setIsSubmitting(false)
        return
      }

      const userId = data.user?.id || data.session?.user?.id

      if (userId) {
        const { error: insertError } = await supabase.from('users').insert({
          id: userId,
          username: registerForm.username,
          email: registerForm.email,
        })
        console.log('users insert error:', insertError)

        if (data.session) {
          // 切换账号：清除旧账号的本地数据
          clearAllDataStores()

          setUser({
            id: userId,
            username: registerForm.username,
            email: registerForm.email,
            settings: { ...settings },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          addNotification({ message: '注册成功，已自动登录', type: 'success' })
        } else {
          addNotification({ message: '注册成功，请查看邮箱验证后登录', type: 'success' })
          setLoginForm(prev => ({ ...prev, username: registerForm.email }))
          setMode('login')
        }
      } else {
        addNotification({ message: '注册请求已发送，但未收到用户ID，请检查 Supabase 配置', type: 'error' })
      }
    } catch (e: any) {
      console.error('Register exception:', e)
      addNotification({ message: '注册出错：' + (e.message || '未知错误'), type: 'error' })
    }

    setIsSubmitting(false)
  }

  return (
    <div
      className="h-full w-screen flex items-center justify-center"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 md:p-8 w-full max-w-md md:max-w-lg mx-4 relative">
        {/* 帮助入口 */}
        <button
          onClick={() => setShowHelp(true)}
          className="absolute top-4 right-4 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          遇到问题？
        </button>

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={appIcon} alt="PrivaHub" className="w-16 h-16 rounded-card mb-4 shadow-glow" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-purple-400 bg-clip-text text-transparent animate-pulse">
            PrivaHub
          </h1>
        </div>

        {/* 切换标签 */}
        <div className="flex bg-[var(--bg-secondary)] rounded-button p-1 mb-6 border border-[var(--border-color)]">
          <button
            onClick={() => { setMode('login'); setErrors({}) }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-button transition-all ${
              mode === 'login'
                ? 'bg-primary-600 text-white shadow-soft'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => { setMode('register'); setErrors({}) }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-button transition-all ${
              mode === 'register'
                ? 'bg-primary-600 text-white shadow-soft'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            注册
          </button>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'login' ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="请输入邮箱"
                    className="input-dark pl-11"
                  />
                </div>
                {errors.username && <p className="text-xs text-danger mt-1 ml-1">{errors.username}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="密码"
                    className="input-dark pl-11 pr-11"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-danger mt-1 ml-1">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={loginForm.rememberPassword}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setLoginForm(prev => ({ ...prev, rememberPassword: checked, autoLogin: checked ? prev.autoLogin : false }))
                      if (!checked) {
                        setLoginForm(prev => ({ ...prev, password: '' }))
                      }
                    }}
                    className="w-4 h-4 rounded border-[var(--border-color)] text-primary-600 focus:ring-primary-600"
                  />
                  记住密码
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={loginForm.autoLogin}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, autoLogin: e.target.checked, rememberPassword: e.target.checked ? true : prev.rememberPassword }))}
                    className="w-4 h-4 rounded border-[var(--border-color)] text-primary-600 focus:ring-primary-600"
                  />
                  自动登录
                </label>
              </div>

              <button
                onClick={handleLogin}
                disabled={isSubmitting}
                className="btn-primary w-full py-3"
              >
                {isSubmitting ? '登录中...' : '登录'}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={registerForm.username}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="用户名"
                    className="input-dark pl-11"
                  />
                </div>
                {errors.username && <p className="text-xs text-danger mt-1 ml-1">{errors.username}</p>}
              </div>

              <div>
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="邮箱（将作为登录账号）"
                    className="input-dark pl-11"
                  />
                </div>
                {errors.email && <p className="text-xs text-danger mt-1 ml-1">{errors.email}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="密码（至少6位）"
                    className="input-dark pl-11 pr-11"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-danger mt-1 ml-1">{errors.password}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="password"
                    value={registerForm.confirmPassword}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="确认密码"
                    className="input-dark pl-11"
                  />
                </div>
                {errors.confirmPassword && <p className="text-xs text-danger mt-1 ml-1">{errors.confirmPassword}</p>}
              </div>

              <button
                onClick={handleRegister}
                disabled={isSubmitting}
                className="btn-primary w-full py-3"
              >
                {isSubmitting ? '注册中...' : '注册'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 帮助弹窗 */}
        <AnimatePresence>
          {showHelp && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
              onClick={() => setShowHelp(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-3">遇到问题？</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  如果您在登录或注册过程中遇到任何问题，欢迎联系开发者获取帮助。
                </p>
                <div className="bg-[var(--bg-secondary)] rounded-lg p-3 mb-4">
                  <p className="text-xs text-[var(--text-tertiary)] mb-1">联系邮箱</p>
                  <div className="flex items-center justify-between">
                    <code className="text-sm text-[var(--text-primary)]">pgwoo_228@outlook.com</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('pgwoo_228@outlook.com')
                        addNotification({ message: '邮箱已复制', type: 'success' })
                      }}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      复制
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setShowHelp(false)}
                  className="btn-primary w-full py-2.5"
                >
                  知道了
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default Login
