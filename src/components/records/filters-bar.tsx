'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SiteOption, ZoneOption } from '@/lib/queries/sites-zones'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function FiltersBar({ zones, sites }: { zones: ZoneOption[]; sites: SiteOption[] }) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const zoneParam = searchParams.get('zone') ?? ''
  const siteParam = searchParams.get('site') ?? ''
  const yearParam = searchParams.get('year') ?? ''
  const monthParam = searchParams.get('month') ?? ''
  const [workerName, setWorkerName] = useState(searchParams.get('worker') ?? '')

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { month: 'long' }),
    [locale],
  )

  function updateParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  // Debounce the worker-name search so it doesn't push a router navigation
  // on every keystroke.
  useEffect(() => {
    const current = searchParams.get('worker') ?? ''
    if (workerName === current) return
    const id = setTimeout(() => updateParams({ worker: workerName || null }), 400)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerName])

  const sitesForZone = sites.filter((s) => {
    if (zoneParam === '') return true
    if (zoneParam === 'standalone') return s.zoneId === null
    return s.zoneId === zoneParam
  })

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex flex-col gap-1.5 lg:col-span-2">
        <Label htmlFor="worker-search">{t('records.worker')}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="worker-search"
            placeholder={t('records.workerSearchPlaceholder')}
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
            className="ps-8"
            dir="auto"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t('records.zone')}</Label>
        <Select
          value={zoneParam || 'all'}
          onValueChange={(v) => updateParams({ zone: v === 'all' ? null : v, site: null })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="standalone">{t('imports.scopeStandalone')}</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z.id} value={z.id}>
                {locale === 'ar' ? z.nameAr : z.nameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t('records.site')}</Label>
        <Select value={siteParam || 'all'} onValueChange={(v) => updateParams({ site: v === 'all' ? null : v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {sitesForZone.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span dir="auto">{locale === 'ar' ? s.nameAr : (s.nameEn ?? s.nameAr)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>{t('records.month')}</Label>
          <Select value={monthParam || 'all'} onValueChange={(v) => updateParams({ month: v === 'all' ? null : v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {MONTHS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {monthFmt.format(new Date(2000, m - 1, 1))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>{t('records.year')}</Label>
          <Select value={yearParam || 'all'} onValueChange={(v) => updateParams({ year: v === 'all' ? null : v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
