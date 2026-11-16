import type { ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { ChartCard } from '../chartCard'
import { formatTzs } from '../../utils/format'

export type Bucket = { label: string; count: number; amount: number; color: string }

const compact = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })

type BucketChartProps = {
  title: string
  subtitle?: string
  buckets: Bucket[]
  /** line shown under the chart, e.g. a total */
  footer?: ReactNode
}

export function BucketChart({ title, subtitle, buckets, footer }: BucketChartProps) {
  const option: EChartsOption = {
    animationDuration: 350,
    grid: { top: 12, right: 12, bottom: 36, left: 48 },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const point = Array.isArray(params) ? params[0] : params
        if (!point) return ''
        const bucket = buckets[point.dataIndex]
        if (!bucket) return ''
        const label = escapeHtml(bucket.label)
        const loanLabel = bucket.count === 1 ? 'loan' : 'loans'
        return `<div style="font-weight:600;color:#495057">${label}</div><div style="color:#868e96">${bucket.count} ${loanLabel}</div><div style="color:#343a40">${formatTzs(bucket.amount)}</div>`
      },
      backgroundColor: '#fff',
      borderColor: '#e9ecef',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.12); border-radius: 6px;',
    },
    xAxis: {
      type: 'category',
      data: buckets.map((bucket) => bucket.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { fontSize: 11, color: '#868e96' },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        fontSize: 11,
        color: '#868e96',
        formatter: (value: number) => compact(value),
      },
      splitLine: { lineStyle: { color: '#e9ecef', type: 'dashed' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 44,
        data: buckets.map((bucket) => ({
          value: bucket.amount,
          itemStyle: { color: bucket.color, borderRadius: [4, 4, 0, 0] },
        })),
      },
    ],
  }

  return (
    <ChartCard title={title} subtitle={subtitle} footer={footer} cardHeight={224}>
      {(height) => (
        <ReactECharts
          option={option}
          style={{ height, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      )}
    </ChartCard>
  )
}