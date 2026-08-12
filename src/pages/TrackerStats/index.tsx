import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrackerStore } from '@/store'
import { SummaryCard, AreaChart, PieChart, ScatterChart, BoxPlotChart, HeatMapChart } from '@/components/Statistics'
import { ChevronLeft } from '@/utils/icons'

const TrackerStatsPage: React.FC = () => {
  const navigate = useNavigate()
  const { categories, entries } = useTrackerStore()
  const activeCategories = categories.filter(c => !c.deleted_at)
  const [selectedTracker, setSelectedTracker] = useState<string>('all')

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 根据 selectedTracker 过滤数据
  const filteredEntries = useMemo(() => {
    const validEntries = entries.filter(e => !e.deleted_at)
    if (selectedTracker === 'all') return validEntries
    return validEntries.filter(e => e.category_id === selectedTracker)
  }, [entries, selectedTracker])

  const filteredCategories = useMemo(() => {
    if (selectedTracker === 'all') return activeCategories
    return activeCategories.filter(c => c.id === selectedTracker)
  }, [activeCategories, selectedTracker])

  const stats = useMemo(() => {
    // 总记录数
    const totalEntries = filteredEntries.length

    // 今日记录数
    const todayCount = filteredEntries.filter(e => {
      const d = new Date(e.timestamp)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return ds === todayStr
    }).length

    // 记录项数
    const categoryCount = filteredCategories.length

    // 近7天总计
    let weekTotal = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      weekTotal += filteredEntries.filter(e => {
        const ed = new Date(e.timestamp)
        const eds = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`
        return eds === ds
      }).length
    }

    // 近30天记录趋势
    const last30DaysData: { date: string; value: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const count = filteredEntries.filter(e => {
        const ed = new Date(e.timestamp)
        const eds = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`
        return eds === ds
      }).length
      last30DaysData.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, value: count })
    }

    // 各记录项占比（饼图）
    const categoryPieData = filteredCategories
      .map(cat => ({
        name: cat.name,
        value: filteredEntries.filter(e => e.category_id === cat.id).length
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)

    // 散点图：记录时间 vs 记录量
    // x: 一天中的小时(0-23), y: 该小时的记录数
    const hourCountMap: Record<number, number> = {}
    filteredEntries.forEach(e => {
      const hour = new Date(e.timestamp).getHours()
      hourCountMap[hour] = (hourCountMap[hour] || 0) + 1
    })
    const scatterData = Object.entries(hourCountMap).map(([h, c]) => ({
      x: Number(h), y: c, name: `${h}时`
    }))

    // 箱型图：每日记录数量分布
    const dailyCounts: number[] = []
    const dateSet = new Set<string>()
    filteredEntries.forEach(e => {
      const d = new Date(e.timestamp)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dateSet.add(ds)
    })
    dateSet.forEach(ds => {
      const count = filteredEntries.filter(e => {
        const d = new Date(e.timestamp)
        const eds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return eds === ds
      }).length
      dailyCounts.push(count)
    })

    return { totalEntries, todayCount, categoryCount, weekTotal, last30DaysData, categoryPieData, scatterData, dailyCounts }
  }, [filteredEntries, filteredCategories, todayStr])

  // 计算热力图数据：每日时段记录频率
  const heatmapData = useMemo(() => {
    const xLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const yLabels = ['0-3时', '4-7时', '8-11时', '12-15时', '16-19时', '20-23时']
    const matrix: [number, number, number][] = []

    for (let h = 0; h < yLabels.length; h++) {
      for (let d = 0; d < xLabels.length; d++) {
        matrix.push([d, h, 0])
      }
    }

    filteredEntries.forEach(entry => {
      const date = new Date(entry.timestamp || entry.created_at)
      const dayOfWeek = (date.getDay() + 6) % 7  // 周一=0
      const hour = date.getHours()
      const slot = Math.floor(hour / 4)
      const idx = slot * 7 + dayOfWeek
      if (matrix[idx]) matrix[idx][2]++
    })

    return { data: matrix, xLabels, yLabels }
  }, [filteredEntries])

  return (
    <div className="page-container">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-[#6B4C9A] mb-4">
          <ChevronLeft size={16} />
          <span>返回</span>
        </button>

        <h1 className="page-title mb-6">记录数据统计</h1>

        {activeCategories.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">暂无记录数据</div>
        ) : (
          <div className="space-y-4">
            {/* 记录项选择器 */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setSelectedTracker('all')}
                className={`px-3 py-1.5 rounded-full text-xs ${selectedTracker === 'all' ? 'bg-[#6B4C9A] text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                全部
              </button>
              {activeCategories.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTracker(t.id)}
                  className={`px-3 py-1.5 rounded-full text-xs ${selectedTracker === t.id ? 'bg-[#6B4C9A] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* 4个汇总卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="总记录数" value={stats.totalEntries} />
              <SummaryCard label="今日记录" value={stats.todayCount} />
              <SummaryCard label="记录项数" value={stats.categoryCount} />
              <SummaryCard label="近7天总计" value={stats.weekTotal} />
            </div>

            {/* 近30天记录趋势（面积图） */}
            <AreaChart title="近30天记录趋势" data={stats.last30DaysData} color="#3B82F6" />

            {/* 各记录项占比（饼图）—— 仅在查看全部记录项时展示 */}
            {selectedTracker === 'all' && (
              <PieChart title="各记录项占比" data={stats.categoryPieData} />
            )}

            {/* 散点图：记录时间 vs 记录量 */}
            <ScatterChart title="记录时间分布" data={stats.scatterData} xName="小时" yName="记录数" />

            {/* 箱型图：每日记录数量分布 */}
            <BoxPlotChart title="每日记录数量分布" data={stats.dailyCounts} />

            {/* 记录时段热力图 */}
            <HeatMapChart
              title="记录时段热力图"
              data={heatmapData.data}
              xLabels={heatmapData.xLabels}
              yLabels={heatmapData.yLabels}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default TrackerStatsPage