// ===== 用户相关 =====
export interface User {
  id: string
  username: string
  email: string
  avatar?: string
  settings: UserSettings
  created_at: string
  updated_at: string
}

export interface UserSettings {
  theme: 'light' | 'dark'
  autoLogin: boolean
  rememberPassword: boolean
  lockScreenEnabled: boolean
  lockScreenPassword?: string
  soundEnabled: boolean
  scheduleReminderEnabled: boolean
  autoLockEnabled: boolean
  autoLockTimeout: number // 分钟：5, 10, 15, 30, 60
  defaultHomePage: string
  hiddenModules: string[]
  moduleOrder: string[]
  homeShortcuts: string[] // 首页快捷操作项ID列表
  mobileBottomTabs?: string[] // 手机端底部栏自定义功能项ID列表（首页固定，不包含 home）
  username?: string
  featureFlags?: FeatureFlags
  appVersion?: string
}

// 各板块功能开关，用户可自行决定记录复杂度
export interface FeatureFlags {
  // 待办任务
  todoPriority: boolean      // 优先级
  todoSubtasks: boolean      // 子任务
  todoTags: boolean          // 标签
  todoDueDate: boolean       // 截止日期
  // 日程
  scheduleAllDay: boolean    // 全天事件
  scheduleRepeat: boolean    // 重复
  scheduleLocation: boolean  // 地点
  // 习惯打卡
  habitNegative: boolean     // 消极习惯
  habitCheckinNote: boolean  // 打卡备注
  // 实时记录
  trackerNote: boolean       // 记录备注
  trackerHeatmap: boolean    // 热力图
  trackerUnit: boolean       // 单位
  // 随心贴
  notesWalls: boolean        // 主题墙
  // 规划
  planSchedule: boolean      // 落地日程
}

// ===== 任务待办 =====
export interface Task {
  id: string
  user_id: string
  title: string
  content: string
  priority: 'high' | 'medium' | 'low'
  tags: string[]
  subtasks: Subtask[]
  is_completed: boolean
  completed_at: string | null
  is_archived: boolean
  archived_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  reward_poin?: number   // 完成本待办获得的 Poin 数量
  // 提醒
  reminder_enabled?: boolean
  reminder_mode?: 'custom' | 'at_start' | 'before_start' | 'at_end' | 'before_end'
  reminder_time?: string | null   // custom 模式下的具体时间
  reminder_minutes?: number       // before_start/before_end 模式下的提前分钟数
  reminder_triggered?: boolean    // 是否已触发（防重复）
}

export interface Subtask {
  id: string
  title: string
  is_completed: boolean
}

// ===== 日历日程 =====
export interface Schedule {
  id: string
  user_id: string
  title: string
  content: string
  start_time: string
  end_time: string
  is_all_day: boolean
  repeat_rule: RepeatRule | null
  is_reminder: boolean
  reminder_type: 'popup' | 'system' | 'both' | null
  plan_id: string | null
  tags: string[]
  deleted_at: string | null
  created_at: string
  updated_at: string
  // 扩展提醒
  reminder_mode?: 'custom' | 'at_start' | 'before_start' | 'at_end' | 'before_end'
  reminder_time?: string | null
  reminder_minutes?: number
  reminder_triggered?: boolean
}

export interface RepeatRule {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  interval: number
  endDate?: string
  daysOfWeek?: number[]
  daysOfMonth?: number[]
  monthsOfYear?: number[]
}

// ===== 排班 =====
export type ShiftType = 'work' | 'rest' | 'public_rest'  // 上班 / 休息日 / 公休

export interface Shift {
  id: string
  user_id: string
  year: number        // 哪年
  month: number       // 哪月（1-12）
  day: number         // 哪天（1-31）
  type: ShiftType     // 排班类型
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// ===== 习惯打卡 =====
export interface Habit {
  id: string
  user_id: string
  name: string
  type: 'positive' | 'negative'
  checkins: CheckinRecord[]
  sort_order?: number
  reward_poin?: number   // 正向习惯打卡获得 Poin
  deduct_poin?: number   // 消极习惯打卡扣除 Poin
  deleted_at: string | null
  created_at: string
  updated_at: string
  // 提醒
  reminder_enabled?: boolean
  reminder_mode?: 'custom' | 'at_start' | 'before_start' | 'at_end' | 'before_end'
  reminder_time?: string | null
  reminder_minutes?: number
  reminder_triggered?: boolean
}

export interface CheckinRecord {
  date: string
  note: string
  images?: string[]  // base64 图片数据 URL 数组
}

// ===== 宏观规划 =====
export interface Plan {
  id: string
  user_id: string
  title: string
  content: string
  priority: 'high' | 'medium' | 'low'
  tags: string[]
  is_scheduled: boolean
  scheduled_to: 'task' | 'schedule' | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// ===== 随心贴 =====
export interface NoteWall {
  id: string
  user_id: string
  name: string
  description: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  wall_id: string
  content: NoteContent
  image_ids: string[]
  audio_ids?: string[] // 音频文件 base64 数组
  color: string
  background: string
  position: number
  sort_order: number
  is_pinned: boolean
  comments: NoteComment[]
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface NoteContent {
  text: string
  html?: string
  format?: Record<string, unknown>
}

export interface NoteComment {
  id: string
  text: string
  created_at: string
}

// ===== 同步日志 =====
export interface SyncLog {
  id: string
  user_id: string
  device_type: 'pc' | 'tablet' | 'phone'
  sync_time: string
  status: 'success' | 'failed'
  note: string
  created_at: string
}

// ===== 通用标签 =====
export interface Tag {
  id: string
  name: string
  color: string
  is_builtin: boolean
  created_at: string
}

// ===== 模块配置 =====
export interface ModuleConfig {
  id: string
  name: string
  title: string
  icon: string
  path: string
  isVisible: boolean
}

// ===== 回收站通用项 =====
export interface RecycleBinItem {
  id: string
  type: string
  title: string
  deleted_at: string
  data: Record<string, unknown>
}

export interface TrackerCategory {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  unit: string
  sort_order?: number
  reward_poin?: number   // 每次记录奖励 Poin
  deduct_poin?: number   // 每次记录扣除 Poin
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface TrackerEntry {
  id: string
  user_id: string
  category_id: string
  timestamp: string
  note: string
  deleted_at: string | null
  created_at: string
}

// ===== 登录相关 =====
export interface LoginForm {
  username: string
  password: string
  rememberPassword: boolean
  autoLogin: boolean
}

export interface RegisterForm {
  username: string
  email: string
  password: string
  confirmPassword: string
}

export interface LockScreenState {
  isLocked: boolean
  passwordHash: string
  failedAttempts: number
  lockUntil: number | null
}

// ===== Poin 货币系统 =====

// Poin 全局配置
export interface PoinConfig {
  enable: boolean          // 是否开启 Poin 体系
  allow_overdraft: boolean // 是否允许透支（true=允许负数，false=不足时禁止打卡消极习惯）
  save_log: boolean        // 是否留存收支日志
}

// Poin 收支流水
export interface PoinRecord {
  id: string
  user_id: string
  change_num: number       // 正数=获得，负数=扣除
  type: 'todo' | 'plan' | 'habit' | 'shop' | 'tracker'  // 来源类型
  target_id: string | null // 关联待办/习惯 ID
  description: string      // 描述
  is_reversed?: boolean    // 是否已撤回
  reversed_at?: string | null // 撤回时间
  created_at: string
  updated_at: string
}

// 商城奖品类型
export type PoinShopType = 'reward' | 'exemption'  // 通用奖励 / 豁免券
export type PoinLimitRule = 'none' | 'daily' | 'weekly' | 'custom'  // 不限 / 每日限兑 / 每周限兑 / 自定义

// Poin 商城奖品
export interface PoinShopItem {
  id: string
  user_id: string
  name: string             // 奖励名称（豁免券自动生成：习惯名称 + 豁免券）
  cost_poin: number        // 兑换所需 Poin
  shop_type: PoinShopType  // 1=普通奖励, 2=豁免券
  bind_habit_id: string | null  // 绑定的消极习惯 ID（普通奖励为 null）
  bind_tracker_id: string | null  // 绑定的实时打卡分类ID（豁免券类型，绑定tracker时使用）
  limit_rule: PoinLimitRule     // 兑换次数限制
  limit_count?: number          // 自定义限制时的兑换次数（limit_rule=custom时生效）
  description: string      // 补充备注
  status: 'active' | 'inactive'  // 上架 / 下架
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// Poin 背包库存
export interface PoinBagItem {
  id: string
  user_id: string
  shop_item_id: string     // 关联商城奖品 ID
  shop_item_name: string   // 冗余存储奖品名称（防止奖品被删除后无法显示）
  bind_habit_id: string | null  // 绑定的消极习惯 ID
  bind_tracker_id: string | null  // 绑定的实时打卡分类ID
  cost_poin: number        // 兑换时消耗的 Poin（记录用）
  remain_times: number     // 剩余可用次数
  is_used: boolean         // 是否已核销
  created_at: string
  updated_at: string
}
