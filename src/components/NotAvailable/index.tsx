import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

interface NotAvailableProps {
  title?: string
  description?: string
  icon?: React.ReactNode
}

/**
 * 「暂未开放」页面组件
 * 用于在移动端标记暂未移植的桌面端功能
 */
const NotAvailable: React.FC<NotAvailableProps> = ({
  title = '暂未开放',
  description = '此功能正在移动端适配中，请暂时在电脑端使用。',
  icon,
}) => {
  const navigate = useNavigate()

  return (
    <div className="flex-1 flex items-center justify-center p-6 page-container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center max-w-sm"
      >
        {/* 图标 */}
        <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-[var(--bg-tertiary)] flex items-center justify-center">
          {icon || (
            <svg
              className="w-10 h-10 text-[var(--text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.412 15.655L9.75 21.75l3.745-4.012M9.257 13.5H3.75l2.659-2.849m2.048-2.194L14.25 2.25 12 10.5h8.25l-4.323 4.323M12 18A6 6 0 1 0 12 6a6 6 0 0 0 0 12Z"
              />
            </svg>
          )}
        </div>

        {/* 标题 */}
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">{title}</h2>

        {/* 描述 */}
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
          {description}
        </p>

        {/* 返回按钮 */}
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary px-6 py-2.5"
        >
          返回上页
        </button>
      </motion.div>
    </div>
  )
}

export default NotAvailable
