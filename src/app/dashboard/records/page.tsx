import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/get-dictionary'
import { listSites, listZones } from '@/lib/queries/sites-zones'
import { searchPayrollLines } from '@/lib/queries/payroll-lines'
import { FiltersBar } from '@/components/records/filters-bar'
import { RecordsTable } from '@/components/records/records-table'
import { ROW_KINDS, type RowKind } from '@/lib/import/types'

const PAGE_SIZE = 50

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  const dict = getDictionary(locale)
  const t = (key: keyof typeof dict) => dict[key]

  const zone = typeof params.zone === 'string' ? params.zone : undefined
  const site = typeof params.site === 'string' ? params.site : undefined
  const worker = typeof params.worker === 'string' ? params.worker : undefined
  const year = typeof params.year === 'string' ? Number(params.year) : undefined
  const month = typeof params.month === 'string' ? Number(params.month) : undefined
  const page = typeof params.page === 'string' ? Math.max(1, Number(params.page) || 1) : 1
  const kind =
    typeof params.kind === 'string' && (ROW_KINDS as string[]).includes(params.kind)
      ? (params.kind as RowKind)
      : undefined

  const [zones, sites, data] = await Promise.all([
    listZones(supabase),
    listSites(supabase),
    searchPayrollLines(supabase, {
      zoneId: zone,
      siteId: site,
      workerName: worker,
      periodYear: year,
      periodMonth: month,
      rowKind: kind,
      page,
      pageSize: PAGE_SIZE,
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('records.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('records.subtitle')}</p>
      </div>

      <FiltersBar
        zones={zones.map((z) => ({ id: z.id, nameAr: z.nameAr, nameEn: z.nameEn, slug: z.slug }))}
        sites={sites}
      />

      <RecordsTable data={data} />

      <p className="text-xs text-muted-foreground">{t('records.knownLimitation')}</p>
    </div>
  )
}
