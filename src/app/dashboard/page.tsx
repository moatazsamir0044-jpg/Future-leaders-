import { Building2, TrendingUp, Users, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCostBySite, getCostTrend, getDashboardKpis } from '@/lib/queries/dashboard'
import { getDictionary } from '@/lib/i18n/get-dictionary'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale } from '@/lib/i18n/config'
import { cookies } from 'next/headers'
import { formatCurrency, formatNumber, periodLabel } from '@/lib/format'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { CostBySiteChart } from '@/components/dashboard/cost-by-site-chart'
import { CostTrendChart } from '@/components/dashboard/cost-trend-chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const locale = isLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ? cookieStore.get(LOCALE_COOKIE_NAME)!.value! : DEFAULT_LOCALE
  const dict = getDictionary(locale as 'en' | 'ar')
  const t = (key: keyof typeof dict) => dict[key]

  const kpis = await getDashboardKpis(supabase)
  const [costBySite, trend] = await Promise.all([
    kpis.currentPeriod ? getCostBySite(supabase, kpis.currentPeriod) : Promise.resolve([]),
    getCostTrend(supabase),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

      {!kpis.currentPeriod ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('dashboard.noPeriodData')}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t('dashboard.kpi.totalCost')}
          value={formatCurrency(kpis.totalCostCurrent, locale as 'en' | 'ar')}
          deltaPct={kpis.costDeltaPct}
          deltaLabel={t('dashboard.kpi.vsLastMonth')}
          accent="blue"
          icon={Wallet}
        />
        <KpiCard
          title={t('dashboard.kpi.workerRows')}
          value={formatNumber(kpis.workerRowsCurrent, locale as 'en' | 'ar')}
          subtitle={kpis.currentPeriod ? periodLabel(kpis.currentPeriod.year, kpis.currentPeriod.month, locale as 'en' | 'ar') : undefined}
          accent="aqua"
          icon={Users}
        />
        <KpiCard
          title={t('dashboard.kpi.sitesReporting')}
          value={`${formatNumber(kpis.sitesReportingCurrent, locale as 'en' | 'ar')} / ${formatNumber(kpis.knownSitesCount, locale as 'en' | 'ar')}`}
          subtitle={t('dashboard.kpi.sitesReportingHint')}
          accent="violet"
          icon={Building2}
        />
        <KpiCard
          title={t('dashboard.kpi.costByZone')}
          value={
            kpis.costByZone.length > 0
              ? formatCurrency(kpis.costByZone[0].totalGross, locale as 'en' | 'ar')
              : '—'
          }
          subtitle={
            kpis.costByZone.length > 0 ? (locale === 'ar' ? kpis.costByZone[0].nameAr : kpis.costByZone[0].nameEn) : undefined
          }
          accent="yellow"
          icon={TrendingUp}
        />
      </div>

      {kpis.costByZone.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {kpis.costByZone.map((z) => (
            <span key={z.zoneId} className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
              {locale === 'ar' ? z.nameAr : z.nameEn}
              <span className="ms-1.5 text-muted-foreground">{formatCurrency(z.totalGross, locale as 'en' | 'ar')}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.chart.costBySite')}</CardTitle>
            <CardDescription>{t('dashboard.chart.costBySiteSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CostBySiteChart data={costBySite} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.chart.costTrend')}</CardTitle>
            <CardDescription>{t('dashboard.chart.costTrendSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CostTrendChart points={trend.points} zones={trend.zones} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
