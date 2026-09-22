'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { formatCurrency, formatNumber } from '@/lib/format'
import type { CostBySite } from '@/lib/queries/dashboard'

export function CostBySiteChart({ data }: { data: CostBySite[] }) {
  const { t, locale } = useTranslation()

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('dashboard.chart.noData')}</p>
  }

  const chartData = data.map((d) => ({
    name: locale === 'ar' ? d.nameAr : (d.nameEn ?? d.nameAr),
    totalGross: d.totalGross,
  }))
  const height = Math.max(220, chartData.length * 34)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatNumber(v, locale)}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fontSize: 12, fill: 'var(--foreground)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)' }}
          contentStyle={{
            background: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
          }}
          formatter={(value) => [formatCurrency(Number(value), locale), t('records.col.totalGross')]}
        />
        <Bar dataKey="totalGross" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}
