'use client'

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { formatCurrency, formatNumber, monthName } from '@/lib/format'
import type { CostTrendPoint, ZoneRow } from '@/lib/queries/dashboard'

// Series order follows the validated categorical palette (dataviz skill):
// total gets the brand blue (slot 1); zones take the next slots in a fixed
// order so a given zone always keeps the same color across renders.
const ZONE_COLORS = ['var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function CostTrendChart({ points, zones }: { points: CostTrendPoint[]; zones: ZoneRow[] }) {
  const { t, locale } = useTranslation()

  if (points.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('dashboard.chart.noData')}</p>
  }

  const chartData = points.map((p) => ({
    ...p,
    label: `${monthName(p.month, locale).slice(0, 3)} ${String(p.year).slice(2)}`,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatNumber(v, locale)}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          width={64}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
          }}
          formatter={(value, name) => [formatCurrency(Number(value), locale), String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="total"
          name={t('dashboard.chart.total')}
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        {zones.map((zone, i) => (
          <Line
            key={zone.id}
            type="monotone"
            dataKey={zone.slug}
            name={locale === 'ar' ? zone.name_ar : zone.name_en}
            stroke={ZONE_COLORS[i % ZONE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
