'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setLocaleCookie } from '@/lib/i18n/actions'
import { useTranslation } from './i18n-provider'
import type { Locale } from '@/lib/i18n/config'

/** Toggles between English and Arabic. Persists the choice server-side (a
 * cookie), then refreshes so the server-rendered `<html lang dir>` and every
 * server component re-render in the new locale — see src/lib/i18n/actions.ts. */
export function LocaleToggle() {
  const { locale, t } = useTranslation()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next: Locale = locale === 'en' ? 'ar' : 'en'
    startTransition(async () => {
      await setLocaleCookie(next)
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={isPending}
      aria-label={t('common.filters')}
      className="gap-2"
    >
      <Languages className="size-4" aria-hidden="true" />
      <span>{locale === 'en' ? 'العربية' : 'English'}</span>
    </Button>
  )
}
