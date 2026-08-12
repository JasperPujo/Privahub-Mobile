import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { APP_VERSION } from '@/store'
import {
  Download, Check, AlertCircle, RefreshCw
} from '@/utils/icons'

declare global {
  interface Window {
    electronAPI?: {
      openExternal: (url: string) => Promise<void>
      checkForUpdate: () => Promise<void>
      downloadUpdate: () => Promise<void>
      quitAndInstall: () => Promise<void>
      directDownload: (url: string) => Promise<void>
      runInstaller: () => Promise<void>
      onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => void
      onDownloadProgress: (cb: (progress: { percent: number; transferred: number; total: number; speed: number }) => void) => void
      onUpdateDownloaded: (cb: (info: { version: string }) => void) => void
      onUpdateError: (cb: (err: { message: string }) => void) => void
    }
  }
}

interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

const changelog: ChangelogEntry[] = [
  {
    version: 'V2.3.0',
    date: '2026-08-11',
    changes: [
      '新增：单设备登录限制——同一账号同一时间只能在一台电脑设备登录，新登录会自动顶下旧设备弹出提示（不影响手机端与电脑端同时登录）',
      '修复：Priva专注悬浮窗无法暂停/继续、点击不跳转专注页面的问题',
      '优化：随心贴动画效果——移除 layout 属性减少重排卡顿，改用 spring 弹性动画和 popLayout 模式',
      '新增：Poin余额变动记录支持手动撤回——在收支明细中可反向操作余额变动以应对极少情况下的计算异常',
    ]
  },
  {
    version: 'V2.2.9',
    date: '2026-08-09',
    changes: [
      '修复：重新登录后归档任务恢复为已完成状态——mergeRecords 状态字段从单向保护改为双向保护，基于 completed_at/archived_at 时间戳判断状态变更先后',
      '修复：已完成的待办同步后变为未完成——增加推送阶段状态回归保护，远程已完成/已归档的记录不会被本地旧数据覆盖',
      '修复：clearAllDataStores 只修改 localStorage 未更新 Zustand 内存状态，导致 lastSyncTime 残留旧值',
      '修复：setData 回调期间 store 订阅可能触发额外同步，增加 setDataGuard 保护标志',
    ]
  },
  {
    version: 'V2.2.8',
    date: '2026-08-09',
    changes: [
      '修复：更新重装后归档任务恢复为已完成状态的问题',
      '修复：已完成的待办在同步后变为未完成的问题',
      '修复：mergeRecords 状态字段单向保护改为双向保护，防止旧数据覆盖新状态',
      '修复：fullSync 中 per-table 增量判断，避免空表使用增量模式漏拉数据',
      '修复：clearAllDataStores 后 lastSyncTimeRef 不重置导致增量同步用旧时间戳',
      '优化：防抖同步时间从 5 秒缩短到 3 秒，关键操作更快同步',
      '优化：同步冷却期从 10 秒延长到 15 秒，减少 setData 回写循环',
    ]
  },

  {
    version: 'V2.2.5',
    date: '2026-08-07',
    changes: [
      '修复：检查更新后跳转网页显示 404——优化下载链接查找逻辑，优先从 latest 标签获取安装包',
      '修复：应用内直接下载安装失败——改进 HTTPS 下载器，处理相对重定向、添加 User-Agent 头',
    ]
  },
  {
    version: 'V2.2.4',
    date: '2026-08-07',
    changes: [
      '优化：提醒设置的自定义时间选择器改为先选择后确认——选择日期时间后需点击"添加"按钮才生效，避免调整过程中误触发',
    ]
  },
  {
    version: 'V2.2.3',
    date: '2026-08-06',
    changes: [
      '修复：设置提醒后同步又消失——移除有缺陷的交集合并策略，改为 winner-takes-all（updated_at 更新的一方决定提醒数据）',
      '修复：删除提醒后同步又复活——同步流程从 push-then-pull 改为 pull-merge-push，推送时跳过远程已更新的记录，防止旧数据覆盖新数据',
      '修复：reminder_enabled 与 reminder_time 状态不一致——合并后自动同步两个字段',
      '重要：需要执行数据库 SQL 脚本修复 updated_at 触发器，否则多设备同步时提醒仍可能异常',
    ]
  },
  {
    version: 'V2.2.2',
    date: '2026-08-06',
    changes: [
      '修复：版本号到处不一致的问题——将 package.json 设为唯一版本来源，通过 Vite 编译时注入，所有页面自动同步',
      '修复：About 页面版本号不随更新刷新——改为使用编译时常量替代 localStorage 持久化值',
    ]
  },
  {
    version: 'V2.2.1',
    date: '2026-08-06',
    changes: [
      '修复：打开软件时仍弹出过期提醒——改用 lastCheckTime 时间窗口机制，彻底解决数据同步时序导致的漏跳问题',
    ]
  },
  {
    version: 'V2.2.0',
    date: '2026-08-06',
    changes: [
      '修复：提醒弹窗现在必须手动关闭，不再 10 秒后自动消失',
      '修复：取消的提醒时间同步后不再复活——采用交集合并策略，删除操作始终生效',
      '修复：日程提醒弹窗时间显示错误——改用字符串解析避免时区转换问题',
      '修复：打开软件时不再弹出已过期的提醒——首次检查跳过所有过期提醒',
      '修复：版本号不随更新刷新——改为从应用状态动态读取',
    ]
  },
  {
    version: 'V2.1.8',
    date: '2026-08-06',
    changes: [
      '修复：删除提醒时间后同步又恢复的问题——移除 mergeRecords 中有缺陷的提醒字段保护逻辑',
      '修复：syncUpsert 缺少缺失列重试逻辑，导致单条推送失败时云端保留旧数据',
    ]
  },
  {
    version: 'V2.1.7',
    date: '2026-08-06',
    changes: [
      '修复：提醒同步问题——数据库缺少 reminder 列时推送被静默丢弃，导致已设提醒时间丢失或已删提醒复活',
      '修复：合并逻辑增加提醒字段保护，防止远程空值覆盖本地有效数据',
      '修复：关闭提醒时未清空 reminder_time，导致重新开启提醒时旧时间复活',
      '优化：错过的提醒不再弹出——关闭软件期间过期的提醒，重新打开后不再弹出弹窗',
      '优化：syncPush 重试次数从 2 提升至 6，足以处理所有 reminder_* 列缺失场景',
    ]
  },
  {
    version: 'V2.1.6',
    date: '2026-08-06',
    changes: [
      '修复：所有白噪音播放失败的问题——修复 Electron 打包后音频文件路径无法解析',
      '修复：4 个缺失音频文件（水滴、篝火、海浪、翻书声）已补全生成',
      '修复：音频格式从 .aac 统一为 .wav，提升 Chromium 兼容性',
      '修复：播放失败时 UI 按钮状态不同步的问题',
    ]
  },
  {
    version: 'V2.1.5',
    date: '2026-08-06',
    changes: [
      '修复：软件内更新下载失败的问题——重写下载机制，使用直接 HTTPS 下载替代 autoUpdater',
      '修复：更新检查时 "Please check update first" 错误——修复 React 闭包过期导致浏览器回退失效',
      '优化：下载失败时自动回退到浏览器下载，确保用户始终能获取更新',
    ]
  },
  {
    version: 'V2.1.4',
    date: '2026-08-06',
    changes: [
      '新增：提醒支持设置多个时间段，可添加任意数量的提醒时间',
      '新增：桌面通知系统——提醒弹窗在屏幕右下角弹出，软件最小化也能收到提醒',
      '优化：通知弹窗 UI 重新设计，左侧彩色条标识类型，毛玻璃效果，更精致的视觉风格',
      '优化：移除应用内提醒弹窗，统一使用系统级桌面通知',
    ]
  },
  {
    version: 'V2.1.3',
    date: '2026-08-05',
    changes: [
      '重构：提醒设置重新设计——智能预设+自定义融合，预设即完整配置，一键即用',
      '新增：习惯提醒改为每日重复模式（time 选择器），支持每天定时提醒，次日自动重置',
      '优化：日程提醒预设整合为单行按钮（开始时/开始前15分/开始前30分/结束时/结束前15分/结束前30分），点击即设好全部参数',
      '优化：提醒设置顶部新增摘要行，自然语言描述当前提醒配置',
      '优化：待办提醒快捷预设始终可见，datetime 选择器常驻',
    ]
  },
  {
    version: 'V2.1.2',
    date: '2026-08-05',
    changes: [
      '优化：提醒设置重新设计，融合预设与自定义（新增开始时/结束时模式，分钟快捷预设，自定义时间快捷选项）',
      '修复：软件内更新检查失败的问题（修复autoUpdater时序错误）',
    ]
  },
  {
    version: 'V2.1.1',
    date: '2026-08-05',
    changes: [
      '修复：进入专注模式未开始计时时最小化窗口不应出现悬浮窗',
    ]
  },
  {
    version: 'V2.1.0',
    date: '2026-08-05',
    changes: [
      '修复：提醒功能无法设置的问题（修复时区转换导致编辑时提醒时间显示错误）',
      '新增：Priva专注页面添加计时结束提醒设置（提示音/弹窗提醒开关）',
      '优化：移除系统设置中的通知部分，提醒设置已分发到各功能/项目/习惯的编辑页面中',
      '修复：版本号显示问题（v2.0.9安装后仍显示v2.0.8）',
    ]
  },
  {
    version: 'V2.0.9',
    date: '2026-08-05',
    changes: [
      '修复：完成所有子任务后主任务自动完成时不触发Poin奖励的问题',
      '修复：已完成任务仍需显示Poin奖惩标注',
      '新增：豁免券系统支持绑定实时打卡项目（与习惯分开选择）',
      '新增：豁免券名称支持自动生成（绑定习惯/打卡时选填，未绑定时必填）',
      '修复：随心墙数据消失问题（note_walls 表纳入同步配置）',
      '修复：首页随心贴卡片在墙无内容时不再显示内容',
      '优化：弹窗保存按钮固定底部，无需下滑即可看到',
      '修复：随心墙"选择一个主题墙开始"UI居中显示',
      '修复：软件内更新功能恢复（优先autoUpdater下载，失败自动回退浏览器下载）',
    ]
  },
  {
    version: 'V2.0.8',
    date: '2026-08-05',
    changes: [
      '修复：点击"立即更新"后显示"检查更新失败"的问题（autoUpdater 后台检查错误覆盖 API 检查结果）',
      '修复：更新日志显示乱码的问题（移除 autoUpdater 的空 releaseNotes 覆盖 API 正确内容）',
      '优化：移除 autoUpdater 自动后台检查，改为 About 页面通过 Gitee API 主动检查',
    ]
  },
  {
    version: 'V2.0.4',
    date: '2026-08-04',
    changes: [
      '修复：Poin 商城内置设置（允许透支、留存日志）在更新或重新加载后被恢复的问题',
      '修复：savePoinConfig 云端保存失败时的错误处理和本地回滚机制',
      '优化：fetchPoinConfig 在云端无记录时保留本地完整配置，不再用默认值覆盖',
      '优化：PoinShop 初始化时避免重复拉取配置，防止覆盖用户修改',
    ]
  },

  {
    version: 'V2.0.3',
    date: '2026-08-04',
    changes: [
      '修复：Poin 体系在更新或重新登录后被自动关闭的问题',
      '优化：页面切换动画改为淡入+微缩放，更流畅自然',
      '优化：全局过渡性能提升，减少不必要的 transition-all 开销',
      '优化：卡片hover、按钮交互添加 GPU 加速提示',
      '优化：侧边栏动画改用 spring 物理曲线',
      '优化：首页列表入场动画改用弹性物理效果',
      '修复：首页实时记录卡片标签显示问题',
      '优化：首页卡片无数据时显示灰色"暂无数据"提示',
    ]
  },

  {
    version: 'V2.0.2',
    date: '2026-08-04',
    changes: [
      '修复：Poin 体系在更新或重新登录后被自动关闭的问题',
      '修复：首页实时记录卡片标签显示问题',
      '优化：首页卡片无数据时显示灰色"暂无数据"提示',
    ]
  },

  {
    version: 'V2.0.1',
    date: '2026-08-04',
    changes: [
      '修复：首页实时记录卡片标签显示问题',
      '优化：首页卡片无数据时显示灰色"暂无数据"提示',
    ]
  },

  {
    version: 'V2.0.0',
    date: '2026-08-04',
    changes: [
      '重构：桌面端与移动端代码完全分离，移除所有移动端相关代码',
      '修复：登录页记住密码和自动登录勾选框不显示的问题',
      '修复：Priva专注页面模式选择在桌面端改为横向排列',
      '修复：习惯打卡删除的记录偶尔被同步恢复的问题',
      '优化：代码全面清理，移除冗余依赖和配置',
    ]
  },
  {
    version: 'V1.9.4',
    date: '2026-08-01',
    changes: [
      '移除：循环任务功能（与习惯打卡功能重叠），简化待办模块',
      '优化：清理循环任务相关代码，提升应用整体性能',
    ]
  },
  {
    version: 'V2.0.0',
    date: '2026-08-01',
    changes: [
      '修复：撤销完成待办/撤销习惯打卡时 Poin 未回退导致重复领取的问题',
      '新增：PWA 支持，可在 iOS/Android 浏览器中"添加到主屏幕"作为独立应用使用',
      '优化：syncPull 增加排序和数量限制，防止大数据量拉取超时',
    ]
  },
  {
    version: 'V1.9.2',
    date: '2026-08-04',
    changes: [
      '优化：数据同步性能大幅提升——移除 JSON.stringify 全量序列化比较，改用快速 updated_at 检测',
      '优化：移除同步中的双重合并逻辑，单次合并即可正确处理冲突',
      '优化：syncPush 批量 upsert 分批处理（每批 500 条），避免大数据量超时',
      '优化：消除 syncPush 与 fullSync 的重复硬删除操作',
      '优化：自动同步防抖从 2 秒增至 5 秒，定时同步从 3 分钟增至 5 分钟，减少不必要的同步',
      '修复：Poin 数值输入框值为 0 时输入数字出现前导零（如输入 10 变成 010）的问题',
    ]
  },
  {
    version: 'V1.9.1',
    date: '2026-08-04',
    changes: [
      '修复：Poin 系统数据库表 user_id 类型不匹配导致 SQL 执行报错（text 改为 uuid）',
      '修复：开启 Poin 系统后被同步自动关闭的问题（fetchPoinConfig 不再覆盖本地已开启的配置）',
      '修复：打卡积极习惯未获得 Poin 的问题（Habit 页面缺少 addNotification 引用）',
      '修复：所有编辑/新建弹窗点击外部遮罩即关闭导致内容丢失的问题',
      '修复：重新安装后卡在"正在检查登录状态"无法进入的问题（版本更新分支遗漏 setCheckingSession）',
      '修复：重新安装后仍自动登录的问题（版本更新时强制登出 Supabase 残留 session）',
      '优化：Poin 商城移除"Poin 系统启用状态"显示，改为内置设置按钮',
      '优化：设置页 Poin 区域只保留开启开关，允许透支和留存日志移至 Poin 商城内置设置',
      '优化：未开启 Poin 系统时侧边栏不显示 Poin 商城入口',
      '新增：兑换次数限制支持自定义每日次数',
      '新增：Poin 商城设置弹窗内置重置按钮，可一键清空余额、商店、背包、记录恢复初始状态',
    ]
  },
  {
    version: 'V1.9.0',
    date: '2026-08-04',
    changes: [
      '新增：Poin 货币系统——完成任务、正向习惯打卡获得 Poin，消极习惯打卡扣除 Poin',
      '新增：Poin 商城——可创建通用奖励和习惯豁免券，用 Poin 兑换',
      '新增：Poin 背包——兑换的奖励和豁免券存放于此，豁免券可抵消消极习惯扣分',
      '新增：收支明细——查看所有 Poin 收支记录',
      '新增：设置页 Poin 配置——开启/关闭体系、允许透支、留存收支日志',
      '新增：顶栏 Poin 余额快捷入口（开启 Poin 体系后显示）',
      '新增：待办任务可设置完成奖励 Poin 数量',
      '新增：习惯打卡可设置获得/扣除 Poin 数量',
    ]
  },
  {
    version: 'V1.8.1',
    date: '2026-08-04',
    changes: [
      '优化："未来待办"更名为"循环待办"，名称更直观',
      '修复：更新或重新安装后自动登录问题，新版本只保留账号，密码需重新输入',
    ]
  },
  {
    version: 'V1.8.0',
    date: '2026-08-04',
    changes: [
      '重构：重复待办系统，同一循环任务最多出现 2 个实例（1当前 + 1未来）',
      '新增：创建重复任务时立即生成未来待办，灰色显示且不可点击',
      '新增：未来待办到期后自动变为可执行，旧实例自动归档',
      '新增：重复任务组ID（repeat_group_id），精确管理同一循环的实例',
      '优化：完成重复任务不再立即生成新任务，未来待办已提前存在',
      '优化：向后兼容旧版数据，自动分配组ID并清理多余实例',
    ]
  },
  {
    version: 'V1.7.9',
    date: '2026-08-04',
    changes: [
      '优化：重复待办完成后立即生成下一周期任务，放入"未来待办"分类',
      '优化：未来待办显示为灰色且不可点击，到期后自动变为可执行',
      '优化：任务卡片清晰标注下次执行日期（明天/后天/M月D日）',
      '优化：头部计数器显示未来待办数量',
    ]
  },
  {
    version: 'V1.7.8',
    date: '2026-08-04',
    changes: [
      '修复：重复待办日期显示"8/0"问题，改为友好格式（今天/明天/后天/M月D日）',
      '修复：完成每日重复待办后立即生成下一个任务的问题，改为到期日自动生成',
      '优化：重复待办卡片显示"下次：明天"明确标注下次执行时间',
      '优化：表单预览同步使用友好日期格式',
    ]
  },
  {
    version: 'V1.7.7',
    date: '2026-07-30',
    changes: [
      '新增：任务待办支持按标签筛选，标签栏显示所有已使用标签',
      '新增：任务待办和日程日历均支持预设标签（工作、学习、会议等）和自定义标签',
      '新增：标签带颜色显示，支持点击快捷选择和输入自定义标签',
      '新增：日程日历支持标签功能，新建/编辑日程时可选择标签',
      '优化：个性化设置收进可折叠子菜单，各板块独立展开',
      '修复：开机自启动按钮切换无效问题',
      '修复：自动登录功能失效问题',
    ]
  },
  {
    version: 'V1.7.6',
    date: '2026-07-30',
    changes: [
      '新增：任务待办支持重复设置——可选择每天、每周（可多选星期）或按执行间隔天数重复',
      '新增：完成重复待办后自动生成下一个周期任务，并提示下次执行日期',
      '新增：任务卡片显示重复标记和下次执行日期',
    ]
  },
  {
    version: 'V1.7.5',
    date: '2026-07-29',
    changes: [
      '修复：待办任务完成后被同步复原的根本问题（服务器时钟偏差+mergeRecords竞态）',
      '修复：同步逻辑全面加固——先推送后拉取，防止旧数据覆盖本地最新状态',
      '修复：mergeRecords增加状态字段单向保护（完成/归档/置顶不被远程旧数据覆盖）',
      '修复：时钟偏差补偿——lastSyncTime减去60秒偏移，宽容期从5秒提升到30秒',
      '新增：所有模块状态变更操作即时同步到云端',
      '新增：Priva专注切换页面后不中断，变为mini悬浮窗显示',
      '优化：随心贴置顶按钮移至右上角角标样式',
    ]
  },

  {
    version: 'V1.7.4',
    date: '2026-07-25',
    changes: [
      '修复：同步时排序恢复原顺序问题',
      '修复：打卡数据被同步覆盖问题',
      '修复：全屏模式点击返回不再退出全屏',
      '优化：同步改为硬删除已删除记录，减少数据库占用',
      '优化：移除习惯统计中无区分度的热力图',
      '优化：记录历史无备注时不再显示已记录标签',
    ]
  },
  {
    version: 'V1.7.2',
    date: '2026-07-25',
    changes: [
      '新增：开机自启动功能（设置页可开关，开机后静默到托盘）',
    ]
  },
  {
    version: 'V1.7.1',
    date: '2026-07-25',
    changes: [
      '优化：排班弹窗支持设置本月及后三个月的排班',
      '修复：排班弹窗日期网格星期对齐，日期与星期列正确对应',
      '修复：月视图排班标记（班/休/公）正确显示',
    ]
  },
  {
    version: 'V1.7.0',
    date: '2026-07-24',
    changes: [
      '新增：排班功能 - 日历页可按月设置排班（上班/休息/公休）',
      '新增：日历日期上显示排班标记（彩色圆圈+文字）',
      '新增：首页排班倒计时卡片（距离下次休息日天数+连续休息天数）',
      '新增：排班数据云端同步',
    ]
  },
  {
    version: 'V1.6.0',
    date: '2026-07-24',
    changes: [
      '新增：实时记录分类、习惯打卡支持拖拽排序',
      '新增：设置页个性化功能区，可开关各板块可选功能',
      '新增：待办任务可关闭优先级/子任务/标签',
      '新增：日程可关闭全天事件',
      '新增：习惯可关闭消极习惯/打卡备注',
      '新增：实时记录可关闭备注/热力图/单位',
      '新增：随心贴可关闭主题墙',
      '新增：规划可关闭落地日程',
    ]
  },
  {
    version: 'V1.5.9',
    date: '2026-07-23',
    changes: [
      '修复：实时记录卡片不再显示已删除分类的记录（避免显示"未分类"）',
    ]
  },
  {
    version: 'V1.5.8',
    date: '2026-07-23',
    changes: [
      '优化：消极习惯统计独立设计，雷达图改为避免率+间隔天数（越长越好）',
      '新增：消极习惯打卡间隔趋势折线图，直观展示间隔变化',
    ]
  },
  {
    version: 'V1.5.7',
    date: '2026-07-23',
    changes: [
      '优化：实时记录卡片增加最小高度，内容居中，间距调大',
    ]
  },
  {
    version: 'V1.5.6',
    date: '2026-07-22',
    changes: [
      '修复：删除按钮点击无反应（移除 store 中的 immediateSyncDelete 动态导入）',
      '修复：合并时本地已删除记录不会被远程未删除状态覆盖',
    ]
  },
  {
    version: 'V1.5.5',
    date: '2026-07-22',
    changes: [
      '修复：删除操作立即同步 deleted_at 到 Supabase，不再等全量同步',
      '修复：合并时本地已删除记录不会被远程未删除状态覆盖',
      '优化：实时记录日期改为两行显示（日期+时间分开），更清晰',
    ]
  },
  {
    version: 'V1.5.4',
    date: '2026-07-22',
    changes: [
      '修复：随心贴 content 渲染崩溃（兼容 string 和对象格式）',
      '修复：用户名不显示（Login setUser 字段名 name→username）',
      '修复：设置页版本号未同步更新',
      '优化：首页时间日期移到右侧，减少滚动',
      '优化：习惯卡片改为今日专注时长',
      '优化：实时记录卡片添加标题',
      '优化：登录页标题改为 PrivaHub 渐变动画',
    ]
  },
  {
    version: 'V1.5.2',
    date: '2026-07-20',
    changes: [
      '修复：删除数据显式二次推送 deleted_at，确保删除状态写入数据库',
      '修复：mergeRecords 删除状态优先，防止已删除记录被复活',
      '新增：settings 同步到 Supabase，换设备登录自动恢复设置',
      '优化：随心贴轮播主题墙选择改为下拉多选',
      '优化：修复自动登录分支，用户名正确显示',
    ]
  },
  {
    version: 'V1.4.4',
    date: '2026-07-20',
    changes: [
      '优化：主页新增随心贴轮播卡片，替代原习惯统计卡片',
      '新增：随心贴轮播支持齿轮按钮设置（秒数输入 + 主题墙多选）',
      '优化：轮播卡片显示4行内容、记录时间、主题墙名称',
    ]
  },
  {
    version: 'V1.4.3',
    date: '2026-07-20',
    changes: [
      '修复：mergeRecords 增加删除状态优先逻辑，防止已删除记录被复活',
      '修复：同步增加并发锁，防止多线程同步导致数据冲突',
      '优化：登录背景图更新',
    ]
  },
  {
    version: 'V1.4.2',
    date: '2026-07-20',
    changes: [
      '修复：改回先 pull 再 push 的同步策略，配合 mergeRecords >= 确保删除数据正确同步到云端',
      '修复：任务栏和托盘图标正确替换为 PrivaHub 新 logo',
      '修复：登录页 logo 同步更新',
    ]
  },
  {
    version: 'V1.4.1',
    date: '2026-07-20',
    changes: [
      '优化：彻底移除顶部栏重复标题，只保留侧边栏 logo',
      '优化：替换全新应用图标',
      '优化：替换登录页背景图',
      '优化：消极习惯独立统计图表，积极/消极并排对比展示',
      '优化：主题墙删除按钮移至编辑弹窗内',
    ]
  },
  {
    version: 'V1.4.0',
    date: '2026-07-20',
    changes: [
      '修复：删除数据被同步回来的问题（syncPull 过滤已删除记录）',
      '优化：习惯打卡备注支持全文展示，记录历史改为全量',
      '优化：习惯统计区分积极/消极习惯',
      '新增：设置页支持修改昵称和密码',
      '新增：设置页显示头像和完整个人信息',
      '优化：替换应用图标，隐藏重复的顶部标题',
      '优化：主题墙删除按钮改为低调样式',
    ]
  },
  {
    version: 'V1.3.3',
    date: '2026-07-20',
    changes: [
      '修复：同步时本地修改被远程旧数据覆盖的问题（改为先 push 再 pull）',
      '修复：mergeRecords 冲突解决策略，相等时优先保留本地',
    ]
  },
  {
    version: 'V1.3.2',
    date: '2026-07-20',
    changes: [
      '修复：彻底修复多账号数据交叉污染问题（清除内存状态 + 使用真实 user_id）',
      '修复：Tracker deleteEntry 改为软删除，避免同步后复活',
      '修复：trackerEntryToDb 补充 updated_at 字段',
      '修复：syncDelete 增加 user_id 过滤',
    ]
  },
  {
    version: 'V1.3.1',
    date: '2026-07-20',
    changes: [
      '新增：主题墙支持删除功能',
    ]
  },
  {
    version: 'V1.3.0',
    date: '2026-07-20',
    changes: [
      '修复：切换账号后旧账号数据泄漏到新账号的问题',
      '优化：注册成功提示由原生 alert 改为内嵌通知',
    ]
  },
  {
    version: 'V1.2.9',
    date: '2026-07-20',
    changes: [
      '修复：新设备首次登录同步无法拉取云端已有数据的问题',
    ]
  },
  {
    version: 'V1.2.8',
    date: '2026-07-20',
    changes: [
      '修复：数据同步失败的关键 Bug（syncPull 缺少查询执行导致所有表拉取异常）',
    ]
  },
  {
    version: 'V1.2.7',
    date: '2026-07-19',
    changes: [
      '优化：专注计时全屏模式下显示任务待办、白噪音控制',
      '新增：全屏模式支持按 Esc 退出全屏',
      '优化：全屏时返回按钮靠左、全屏按钮靠右布局',
    ]
  },
  {
    version: 'V1.2.6',
    date: '2026-07-19',
    changes: [
      '优化：版本号更新至 V1.2.6',
    ]
  },
  {
    version: 'V1.2.0',
    date: '2026-07-16',
    changes: [
      '新增：习惯统计完成率折线图、专注统计折线图/箱型图/时段趋势面积图',
      '优化：随心贴卡片高度自适应、纯图片支持',
      '优化：留言展示优化（默认3条+查看更多Modal）',
      '优化：文字换行和日期溢出处理',
      '优化：设置页精简，关于页整合检查更新功能',
      '修复：版本号更新至 V1.2.0',
    ]
  },
  {
    version: 'V1.1.1',
    date: '2026-07-10',
    changes: [
      '新增：Priva 专注计时功能模块',
      '新增：注册登录页帮助入口',
      '新增：关于页面更新日志',
      '优化：登录页图标替换为软件正式图标',
      '优化：全天日程在首页显示为「全天」',
      '优化：随心贴默认展示第一个主题墙',
      '优化：主任务完成时自动联动子任务完成',
      '优化：侧边栏导航顺序（首页置顶，设置置底）',
      '优化：实时记录图标库扩充',
      '修复：头像持久化保存问题',
      '修复：自动登录功能',
    ]
  },
  {
    version: 'V1.0.0',
    date: '2025-07-09',
    changes: [
      '初始版本发布',
      '包含任务待办、日历日程、宏观规划、习惯打卡、随心贴、实时记录六大核心模块',
      '支持云端同步与本地加密缓存',
    ]
  }
]

const About: React.FC = () => {
  // 版本号直接使用编译时常量，不读 localStorage 持久化值
  // 确保 About 页面始终显示与应用真实版本一致，不会因 localStorage 旧值导致版本号不刷新
  const appVersion = APP_VERSION
  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      alert('邮箱已复制到剪贴板')
    })
  }

  // ===== 检查更新相关状态和逻辑 =====
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date' | 'browser-download'>('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateTransferred, setUpdateTransferred] = useState(0)
  const [updateTotal, setUpdateTotal] = useState(0)
  const [updateSpeed, setUpdateSpeed] = useState(0)
  const [updateErrorMsg, setUpdateErrorMsg] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  // Ref 始终保存最新的 downloadUrl，避免 useEffect 闭包过期
  const downloadUrlRef = useRef('')
  // 标记是否正在使用 autoUpdater 下载（用于区分错误来源，避免后台错误覆盖 API 检查结果）
  const isAutoDownloading = useRef(false)
  // autoUpdater 超时回退定时器
  const fallbackTimer = useRef<number | null>(null)

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const checkForUpdate = async () => {
    setUpdateStatus('checking')
    setUpdateErrorMsg('')
    setDownloadUrl('')
    downloadUrlRef.current = ''
    try {
      // 使用 releases 列表接口，过滤出 semver 版本号标签（排除 "latest" 等非版本标签）
      const response = await fetch('https://gitee.com/api/v5/repos/jasper228/Privahub-Windows/releases?per_page=100')
      const releases = await response.json()
      const currentVersion = appVersion
      const compareVersions = (a: string, b: string) => {
        const partsA = a.split('.').map(Number)
        const partsB = b.split('.').map(Number)
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const va = partsA[i] || 0
          const vb = partsB[i] || 0
          if (va > vb) return 1
          if (va < vb) return -1
        }
        return 0
      }
      // 过滤出格式为 vX.Y.Z 的版本标签
      const versionReleases = releases.filter((r: { tag_name: string }) => /^v\d+\.\d+\.\d+$/.test(r.tag_name))
      if (versionReleases.length === 0) {
        setUpdateStatus('up-to-date')
        return
      }
      // 找到最高版本
      const latestRelease = versionReleases.sort((a: { tag_name: string }, b: { tag_name: string }) =>
        compareVersions(b.tag_name.replace('v', ''), a.tag_name.replace('v', ''))
      )[0]
      const latestVersion = latestRelease.tag_name.replace('v', '')
      if (compareVersions(latestVersion, currentVersion) > 0) {
        setUpdateVersion(latestVersion)
        setReleaseNotes(latestRelease.body || '')
        // 从版本标签 release 的 assets 中查找 .exe 文件
        let exeAsset = latestRelease.assets?.find((asset: { name?: string; browser_download_url?: string }) => asset.name?.endsWith('.exe'))
        // 如果版本标签没有 .exe，尝试从 latest 标签 release 中查找
        // （上传时可能只把 .exe 传到了 latest 标签）
        if (!exeAsset) {
          const latestTagRelease = releases.find((r: { tag_name: string }) => r.tag_name === 'latest')
          exeAsset = latestTagRelease?.assets?.find((asset: { name?: string; browser_download_url?: string }) => asset.name?.endsWith('.exe'))
        }
        // 构建下载 URL：优先用 asset 的 browser_download_url，回退到 latest 标签 URL（更可靠）
        const url = exeAsset?.browser_download_url
          || `https://gitee.com/jasper228/Privahub-Windows/releases/download/latest/PrivaHub-Setup-${latestVersion}.exe`
        setDownloadUrl(url)
        downloadUrlRef.current = url
        setUpdateStatus('available')
      } else {
        setUpdateStatus('up-to-date')
      }
    } catch {
      setUpdateStatus('error')
      setUpdateErrorMsg('无法连接到服务器，请检查网络')
    }
  }

  const startDownloadAndInstall = async () => {
    if (!window.electronAPI) {
      // 非 Electron 环境，直接浏览器下载
      if (downloadUrlRef.current) {
        window.open(downloadUrlRef.current, '_blank')
        setUpdateStatus('browser-download')
      }
      return
    }

    // 使用直接 HTTPS 下载（绕过 autoUpdater，更可靠）
    setUpdateStatus('downloading')
    setUpdateProgress(0)
    setUpdateErrorMsg('')

    try {
      await window.electronAPI.directDownload(downloadUrlRef.current)
      // 下载完成 — 'update-downloaded' 事件会设置状态为 'downloaded'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // 直接下载失败，回退到浏览器下载
      console.warn('[Update] 直接下载失败，回退到浏览器下载:', msg)
      if (downloadUrlRef.current) {
        window.electronAPI?.openExternal?.(downloadUrlRef.current)
        setUpdateStatus('browser-download')
      } else {
        setUpdateErrorMsg(msg || '下载失败，请稍后重试')
        setUpdateStatus('error')
      }
    }
  }

  const handleQuitAndInstall = () => {
    if (!window.electronAPI) return
    window.electronAPI.runInstaller()
  }

  useEffect(() => {
    if (!window.electronAPI) return

    // 下载进度（由直接下载和 autoUpdater 共用）
    window.electronAPI.onDownloadProgress((progress) => {
      setUpdateProgress(progress.percent)
      setUpdateTransferred(progress.transferred)
      setUpdateTotal(progress.total)
      setUpdateSpeed(progress.speed)
      setUpdateStatus('downloading')
    })

    // 下载完成（由直接下载和 autoUpdater 共用）
    window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateVersion(info.version || updateVersion)
      setUpdateStatus('downloaded')
    })

    // autoUpdater 后台错误（仅记录日志，不干扰直接下载流程）
    window.electronAPI.onUpdateError((err) => {
      console.warn('[Update] autoUpdater background error:', err.message)
    })
  }, [])

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4 md:space-y-6 page-container">
      {/* 品牌视觉区 */}
      <div className="text-center py-6">
        <img src="./icon.png" alt="PrivaHub" className="w-16 h-16 rounded-2xl mx-auto mb-3" />
        <h1 className="text-2xl font-bold text-[#222]">PrivaHub</h1>
        <p className="text-sm text-[#777] mt-1">您的私人工作台</p>
        <div className="border-b border-gray-200 mt-4" />
      </div>

      {/* 软件信息卡片 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-[#222] mb-3">软件信息</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#777]">当前版本</span>
            <span className="text-[#222] font-medium">V{appVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#777]">构建日期</span>
            <span className="text-[#222]">2026-08-07</span>
          </div>
          <p className="text-xs text-[#aaa] mt-2 pt-2 border-t border-gray-50">
            Electron + Supabase 云端同步 | 本地加密缓存
          </p>
        </div>
      </div>

      {/* 产品简介卡片 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-[#222] mb-3">关于 PrivaHub</h2>
        <p className="text-sm text-[#555] leading-relaxed">
          PrivaHub 是专为单人打造的私密个人工作台，整合任务待办、日历日程、长期宏观规划、习惯打卡、随心贴灵感画布五大核心功能。
        </p>
        <p className="text-sm text-[#555] leading-relaxed mt-2">
          全程数据隔离保护，依托行级安全策略（RLS）实现专属数据隔离，本地缓存加密存储，卸载仅靠账号同步恢复数据，兼顾离线使用与多端云端互通。
        </p>
      </div>

      {/* 更新日志 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-[#222] mb-3">更新日志</h2>
        <div className="space-y-3">
          {changelog.slice(0, 3).map((entry, idx) => (
            <details key={entry.version} className="group" open={idx === 0}>
              <summary className="flex items-center justify-between cursor-pointer list-none py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[#222]">{entry.version}</span>
                  <span className="text-xs text-[#aaa]">{entry.date}</span>
                </div>
                <span className="text-xs text-[#6B4C9A] group-open:rotate-180 transition-transform">&#9660;</span>
              </summary>
              <ul className="space-y-1.5 pb-2 pl-2">
                {entry.changes.map((change, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[#555]">
                    <span className="text-[#6B4C9A] mt-0.5 flex-shrink-0">&#8226;</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>

      {/* 联系我卡片 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-[#222] mb-3">联系我</h2>
        <p className="text-sm text-[#555] leading-relaxed mb-3">
          如果你有功能建议、BUG 异常、UI 优化想法，欢迎提交反馈，我会持续迭代优化软件体验。
        </p>
        <div
          className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
          onClick={() => handleCopyEmail('pgwoo_228@outlook.com')}
        >
          <span className="text-sm text-[#555]">商务 / 开发 / 反馈专用邮箱：</span>
          <span className="text-sm font-medium text-[#6B4C9A]">pgwoo_228@outlook.com</span>
          <span className="text-xs text-[#aaa]">（点击复制）</span>
        </div>
        <p className="text-xs text-[#aaa] mt-2">邮件建议标注来意，如「PrivaHub 反馈」，我会尽快回复</p>
      </div>

      {/* 数据安全说明卡片 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-[#222] mb-3">数据安全说明</h2>
        <ul className="space-y-2 text-sm text-[#555] leading-relaxed">
          <li className="flex gap-2">
            <span className="text-[#6B4C9A] mt-0.5">&#8226;</span>
            <span>所有云端数据启用行级安全 RLS，仅本人账号可读写专属内容；</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#6B4C9A] mt-0.5">&#8226;</span>
            <span>删除内容自动进入回收站，保留 7 天支持恢复，到期永久清除；</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#6B4C9A] mt-0.5">&#8226;</span>
            <span>本地缓存仅本机存储，无自动本地备份，重装仅通过登录云端恢复；</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#6B4C9A] mt-0.5">&#8226;</span>
            <span>不收集任何无关用户行为数据，无第三方数据共享。</span>
          </li>
        </ul>
        <button className="mt-3 text-sm text-[#6B4C9A] hover:underline">
          《完整隐私政策》
        </button>
      </div>

      {/* 检查更新卡片 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-[#222] mb-3">检查更新</h2>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-[#555]">当前版本 V{appVersion}</span>
          <button
            onClick={checkForUpdate}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'browser-download'}
            className="px-4 py-1.5 text-xs bg-[#6B4C9A] text-white rounded-lg hover:bg-[#5a3f85] disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            {updateStatus === 'checking' ? '检查中...' : updateStatus === 'downloading' ? '下载中...' : '检查更新'}
          </button>
        </div>

        {/* 检查中 */}
        {updateStatus === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-[#6B4C9A] rounded-full" />
            正在检查更新...
          </div>
        )}

        {/* 已是最新 */}
        {updateStatus === 'up-to-date' && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check size={16} />
            当前已是最新版本
          </div>
        )}

        {/* 发现新版本 */}
        {updateStatus === 'available' && (
          <div className="mt-2 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Download size={16} className="text-blue-600" />
              <p className="text-sm font-medium text-blue-700">发现新版本 v{updateVersion}</p>
            </div>
            {releaseNotes && (
              <pre className="text-xs text-gray-600 mt-2 whitespace-pre-wrap max-h-24 overflow-y-auto">{releaseNotes}</pre>
            )}
            <button
              onClick={startDownloadAndInstall}
              className="mt-2 px-4 py-1.5 text-xs bg-[#6B4C9A] text-white rounded-lg hover:bg-[#5a3f85] transition-colors"
            >
              立即更新
            </button>
          </div>
        )}

        {/* 下载中 - 进度条 */}
        {updateStatus === 'downloading' && (
          <div className="mt-2 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full" />
                <span className="text-sm text-blue-700">正在下载更新...</span>
              </div>
              <span className="text-sm font-medium text-blue-700">{updateProgress}%</span>
            </div>
            <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#6B4C9A] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${updateProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
              <span>{formatBytes(updateTransferred)} / {formatBytes(updateTotal)}</span>
              {updateSpeed > 0 && <span>{formatBytes(updateSpeed)}/s</span>}
            </div>
          </div>
        )}

        {/* 下载完成 */}
        {updateStatus === 'downloaded' && (
          <div className="mt-2 p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Check size={16} className="text-green-600" />
              <p className="text-sm font-medium text-green-700">更新已下载完成 (v{updateVersion})</p>
            </div>
            <button
              onClick={handleQuitAndInstall}
              className="px-4 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              立即重启安装
            </button>
          </div>
        )}

        {/* 浏览器下载已打开 */}
        {updateStatus === 'browser-download' && (
          <div className="mt-2 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Download size={16} className="text-blue-600" />
              <p className="text-sm font-medium text-blue-700">已打开浏览器下载 v{updateVersion}</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              下载完成后，运行安装程序即可自动覆盖安装（无需卸载旧版本）。安装完成后重新登录即可。
            </p>
            {downloadUrl && (
              <p className="text-xs text-[#6B4C9A] mt-2 break-all">
                <a href={downloadUrl} onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal?.(downloadUrl) }} className="hover:underline cursor-pointer">
                  如果浏览器未自动打开，点击此处手动下载
                </a>
              </p>
            )}
          </div>
        )}

        {/* 错误 */}
        {updateStatus === 'error' && (
          <div className="mt-2 p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-500" />
              <p className="text-sm text-red-600">检查更新失败</p>
            </div>
            <p className="text-xs text-red-500 mt-1">{updateErrorMsg || '请稍后重试'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default About

