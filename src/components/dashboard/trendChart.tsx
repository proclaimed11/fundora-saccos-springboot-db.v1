import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { ChartCard } from '../chartCard'
import { StatFooter, type FooterStat } from './statFooter'
import { formatTzs } from '../../utils/format'
import { useAppTheme } from '../../theme/themeContext'

export type TrendPoint = { month: string; disbursed: number; collected: number }

// 1500000 -> "1.5M"
const compact = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const sum = (list: number[]) => list.reduce((s, n) => s + n, 0)

// percent change from the previous value to the current one
const pctChange = (current: number, previous: number) =>
  previous === 0 ? 0 : ((current - previous) / previous) * 100

type TrendChartProps = {
  data: TrendPoint[]
}

export function TrendChart({ data }: TrendChartProps) {
  const { surfaceColors } = useAppTheme()

  /* ---------- footer numbers, all worked out from the chart data ---------- */

  const first = data[0]
  const last = data[data.length - 1]
  const prev = data[data.length - 2]

  const totalDisbursed = sum(data.map((p) => p.disbursed))
  const totalCollected = sum(data.map((p) => p.collected))
  // share of the money lent out that has come back
  const collectionRate = totalDisbursed > 0 ? (totalCollected / totalDisbursed) * 100 : 0
  // lent out and not collected back yet
  const netLentOut = totalDisbursed - totalCollected

  // the same measures for one month, used for the change arrows
  const monthRate = (p: TrendPoint) => (p.disbursed > 0 ? (p.collected / p.disbursed) * 100 : 0)
  const monthNet = (p: TrendPoint) => p.disbursed - p.collected

  const footerStats: FooterStat[] =
    last && prev
      ? [
          {
            label: 'Total Disbursed',
            value: formatTzs(totalDisbursed),
            change: pctChange(last.disbursed, prev.disbursed),
            upIs: 'good',
          },
          {
            label: 'Total Collected',
            value: formatTzs(totalCollected),
            change: pctChange(last.collected, prev.collected),
            upIs: 'good',
          },
          {
            label: 'Collection Rate',
            value: `${collectionRate.toFixed(1)}%`,
            change: monthRate(last) - monthRate(prev),
            unit: 'pts',
            upIs: 'good',
          },
          {
            // more money out is not good or bad on its own, so it stays gray
            label: 'Net Lent Out',
            value: formatTzs(netLentOut),
            change: pctChange(monthNet(last), monthNet(prev)),
            upIs: 'neutral',
          },
        ]
      : []

  const option: EChartsOption = {
    animationDuration: 350,
    grid: { top: 12, right: 12, bottom: 48, left: 48 },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { fontSize: 12, color: '#495057' },
    },
    tooltip: {
      trigger: 'axis',
      padding: [4, 8],
      textStyle: { fontSize: 11, lineHeight: 14 },
      valueFormatter: (value) => formatTzs(Number(value)),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((point) => point.month),
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
        name: 'Disbursed',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: data.map((point) => point.disbursed),
        lineStyle: { width: 2, color: '#45bdfc' },
        itemStyle: { color: '#45bdfc' },
      },
      {
        name: 'Collected',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: data.map((point) => point.collected),
        lineStyle: { width: 2, color: surfaceColors.primary },
        itemStyle: { color: surfaceColors.primary },
      },
    ],
  }

  return (
    <ChartCard
      title="Portfolio Performance"
      subtitle="Monthly amounts disbursed compared with repayments collected"
      className="lg:col-span-2"
      cardHeight={256}
      footer={
        footerStats.length > 0 ? (
          <StatFooter
            stats={footerStats}
            caption={`Totals for ${first.month} to ${last.month} · arrows compare ${last.month} with ${prev.month}`}
          />
        ) : undefined
      }
    >
      {(height) => (
        <ReactECharts
          option={option}
          notMerge
          style={{ height, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      )}
    </ChartCard>
  )
}