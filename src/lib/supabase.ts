import { createClient } from '@supabase/supabase-js'

// 环境变量优先，fallback 到硬编码
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ntzatzwvahaewjyuxkbr.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50emF0end2YWhhZXdqeXV4a2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MTIxNzUsImV4cCI6MjA5OTA4ODE3NX0.OehZdSv5HEgoPqKRNPN1-wASB9CpSd6opHrExgQmNKc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,  // 不在本地存储 session，每次启动都需要重新登录
    autoRefreshToken: false
  }
})
