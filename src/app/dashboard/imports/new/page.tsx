import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/get-dictionary'
import { listSites, listZones } from '@/lib/queries/sites-zones'
import { UploadWizard } from '@/components/imports/upload-wizard'

export default async function NewImportPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  const dict = getDictionary(locale)
  const t = (key: keyof typeof dict) => dict[key]

  const [zones, sites] = await Promise.all([listZones(supabase), listSites(supabase)])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('imports.newImportTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('imports.newImportSubtitle')}</p>
      </div>

      <UploadWizard zones={zones} sites={sites} />
    </div>
  )
}
