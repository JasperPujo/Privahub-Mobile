import type { FC, ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'

const ChartCard: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
    <h3 className="text-sm font-semibold text-[#222] mb-3">{title}</h3>
    {children}
  </div>
)

// 空状态提示
const EmptyChart: FC<{ message?: string; height?: string }> = ({ message = '暂无数据，开始记录后将自动生成图表', height = '220px' }) => (
  <div className="flex items-center justify-center" style={{ height }}>
    <p className="text-sm text-[#999]">{message}</p>
  </div>
)

interface StatsCardProps {
  title: string
  data: { date: string; value: number }[]
  type?: 'line' | 'bar' | 'pie'
  color?: string
}

export const StatsCard: FC<StatsCardProps> = ({ title, data, type = 'line', color = '#7C6BC4' }) => {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart />
      </ChartCard>
    )
  }

  const dates = data.map(d => d.date)
  const values = data.map(d => d.value)

  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10, color: '#999' },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#f5f5f5' } },
    },
    series: [{
      data: values,
      type: type,
      smooth: true,
      itemStyle: { color },
      areaStyle: type === 'line' ? { color: `${color}20` } : undefined,
      barWidth: '60%',
    }],
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '200px' }} />
    </ChartCard>
  )
}

// 汇总数字卡片
export const SummaryCard: FC<{ label: string; value: string | number; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
    <p className="text-2xl font-bold text-[#7C6BC4]">{value}</p>
    <p className="text-xs text-[#777] mt-1">{label}</p>
    {sub && <p className="text-[10px] text-[#aaa] mt-0.5">{sub}</p>}
  </div>
)

// 环形饼图
export const PieChart: FC<{
  title: string
  data: { name: string; value: number }[]
  color?: string[]
}> = ({ title, data, color }) => {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart height="260px" />
      </ChartCard>
    )
  }

  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
      data: data,
      color: color,
    }],
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '260px' }} />
    </ChartCard>
  )
}

// 面积图
export const AreaChart: FC<{
  title: string
  data: { date: string; value: number }[]
  color?: string
}> = ({ title, data, color = '#7C6BC4' }) => {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart />
      </ChartCard>
    )
  }

  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: data.map(d => d.date), boundaryGap: false, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [{
      data: data.map(d => d.value), type: 'line', smooth: true,
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '05' }] } },
      itemStyle: { color }, lineStyle: { width: 2 },
    }],
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '220px' }} />
    </ChartCard>
  )
}

// 纯折线图（无面积填充）
export const LineChart: FC<{
  title: string
  data: { date: string; value: number }[]
  color?: string
}> = ({ title, data, color = '#7C6BC4' }) => {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart />
      </ChartCard>
    )
  }

  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: data.map(d => d.date), boundaryGap: false, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [{
      data: data.map(d => d.value), type: 'line', smooth: true,
      itemStyle: { color }, lineStyle: { width: 2 },
    }],
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '220px' }} />
    </ChartCard>
  )
}

// 散点图
export const ScatterChart: FC<{
  title: string
  data: { x: number; y: number; name?: string }[]
  xName?: string
  yName?: string
}> = ({ title, data, xName, yName }) => {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart />
      </ChartCard>
    )
  }

  const option = {
    tooltip: { trigger: 'item' },
    grid: { left: '10%', right: '10%', bottom: '10%', top: '10%', containLabel: true },
    xAxis: { type: 'value', name: xName || '', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: yName || '', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 10 } },
    series: [{ type: 'scatter', data: data.map(d => [d.x, d.y]), symbolSize: 10, itemStyle: { color: '#7C6BC4', opacity: 0.7 } }],
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '220px' }} />
    </ChartCard>
  )
}

// 箱型图
export const BoxPlotChart: FC<{
  title: string
  data: number[]
}> = ({ title, data }) => {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart />
      </ChartCard>
    )
  }

  const sorted = [...data].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0
  const q2 = sorted[Math.floor(sorted.length * 0.5)] || 0
  const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0
  const min = sorted[0] || 0
  const max = sorted[sorted.length - 1] || 0

  const option = {
    tooltip: { trigger: 'item' },
    grid: { left: '10%', right: '10%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: ['数据分布'] },
    yAxis: { type: 'value' },
    series: [{
      type: 'boxplot',
      data: [[min, q1, q2, q3, max]],
      itemStyle: { color: '#7C6BC4', borderColor: '#5a3f85' },
    }],
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '220px' }} />
    </ChartCard>
  )
}

// 雷达图
export const RadarChart: FC<{
  title: string
  indicators: { name: string; max: number }[]
  data: { name: string; value: number[] }[]
  color?: string | string[]
}> = ({ title, indicators, data, color }) => {
  if (data.length === 0 || indicators.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart height="260px" />
      </ChartCard>
    )
  }

  const defaultColors = ['#7C6BC4', '#9B7EC9', '#B8A0DC']
  const resolvedColors: string[] = typeof color === 'string'
    ? data.map((_, i) => color)
    : Array.isArray(color) && color.length > 0
      ? color
      : defaultColors

  const option = {
    tooltip: { trigger: 'item' },
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 4,
      axisName: { color: '#666', fontSize: 11 },
      splitLine: { lineStyle: { color: '#eee' } },
      splitArea: { areaStyle: { color: ['#fafafa', '#fff'] } },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    series: [{
      type: 'radar',
      data: data.map((d, i) => ({
        value: d.value,
        name: d.name,
        itemStyle: { color: resolvedColors[i % resolvedColors.length] },
        areaStyle: { opacity: 0.2 },
      })),
    }],
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '260px' }} />
    </ChartCard>
  )
}

// 热力图
export const HeatMapChart: FC<{
  title: string
  data: [number, number, number][]
  xLabels?: string[]
  yLabels?: string[]
}> = ({ title, data, xLabels, yLabels }) => {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart height="260px" />
      </ChartCard>
    )
  }

  const option = {
    tooltip: { position: 'top' },
    grid: { left: '10%', right: '10%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: xLabels || [], splitArea: { show: true }, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category', data: yLabels || [], splitArea: { show: true }, axisLabel: { fontSize: 10 } },
    visualMap: { min: 0, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#f5f5f5', '#7C6BC4'] } },
    series: [{ type: 'heatmap', data: data, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } } }],
  }

  return (
    <ChartCard title={title}>
      <ReactECharts option={option} style={{ height: '260px' }} />
    </ChartCard>
  )
}
