import Link from 'next/link'
import { cookies } from 'next/headers'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/get-dictionary'
import { listImportBatches } from '@/lib/queries/import-batches'
import { periodLabel } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RestoreBatchButton } from '@/components/imports/restore-batch-button'
import type { TranslationKey } from '@/lib/i18n/get-dictionary'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  processing: 'secondary',
  superseded: 'outline',
  failed: 'destructive',
}

const STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  active: 'imports.status.active',
  processing: 'imports.status.processing',
  superseded: 'imports.status.superseded',
  failed: 'imports.status.failed',
}

export default async function ImportsPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  const dict = getDictionary(locale)
  const t = (key: TranslationKey) => dict[key]

  const batches = await listImportBatches(supabase)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('imports.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('imports.subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/imports/new">
            <Plus className="size-4" aria-hidden="true" />
            {t('nav.newImport')}
          </Link>
        </Button>
      </div>

      {batches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('imports.noBatches')}</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {batches.map((batch) => {
            const scopeName = batch.pv_zones
              ? locale === 'ar'
                ? batch.pv_zones.name_ar
                : batch.pv_zones.name_en
              : locale === 'ar'
                ? batch.pv_sites?.name_ar
                : (batch.pv_sites?.name_en ?? batch.pv_sites?.name_ar)

            return (
              <Card key={batch.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" dir="auto">
                        {scopeName}
                      </span>
                      <Badge variant={STATUS_VARIANT[batch.status]}>{t(STATUS_LABEL_KEY[batch.status])}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {periodLabel(batch.period_year, batch.period_month, locale)} · {batch.source_filename} ·{' '}
                      {new Date(batch.uploaded_at).toLocaleDateString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US')}
                    </p>
                  </div>
                  {batch.status === 'superseded' ? <RestoreBatchButton batchId={batch.id} /> : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
