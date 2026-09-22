import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Bold KPI-card accent: a colored left/start border in one of the
// validated categorical chart hues (see src/app/globals.css), kept as
// literal class strings so Tailwind's scanner can see them (a template
// string like `border-s-chart-${n}` would not be picked up at build time).
const ACCENT_BORDER: Record<'blue' | 'aqua' | 'violet' | 'yellow', string> = {
  blue: 'border-s-chart-1',
  aqua: 'border-s-chart-2',
  violet: 'border-s-chart-3',
  yellow: 'border-s-chart-4',
}

const ACCENT_ICON_BG: Record<'blue' | 'aqua' | 'violet' | 'yellow', string> = {
  blue: 'bg-chart-1/10 text-chart-1',
  aqua: 'bg-chart-2/10 text-chart-2',
  violet: 'bg-chart-3/10 text-chart-3',
  yellow: 'bg-chart-4/10 text-chart-4',
}

export function KpiCard({
  title,
  value,
  subtitle,
  deltaPct,
  deltaLabel,
  accent,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle?: string
  deltaPct?: number | null
  deltaLabel?: string
  accent: 'blue' | 'aqua' | 'violet' | 'yellow'
  icon?: LucideIcon
}) {
  const hasDelta = typeof deltaPct === 'number'
  const isUp = hasDelta && deltaPct! > 0
  const isDown = hasDelta && deltaPct! < 0

  return (
    <Card className={cn('gap-0 overflow-hidden border-s-4 py-0', ACCENT_BORDER[accent])}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
          {hasDelta ? (
            <div className="mt-1.5 flex items-center gap-1 text-xs">
              <span
                className={cn(
                  'flex items-center gap-0.5 font-medium',
                  isUp && 'text-critical',
                  isDown && 'text-success',
                  !isUp && !isDown && 'text-muted-foreground',
                )}
              >
                {isUp ? <ArrowUp className="size-3" /> : isDown ? <ArrowDown className="size-3" /> : null}
                {Math.abs(deltaPct!).toFixed(1)}%
              </span>
              {deltaLabel ? <span className="text-muted-foreground">{deltaLabel}</span> : null}
            </div>
          ) : subtitle ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {Icon ? (
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', ACCENT_ICON_BG[accent])}>
            <Icon className="size-4.5" aria-hidden="true" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
