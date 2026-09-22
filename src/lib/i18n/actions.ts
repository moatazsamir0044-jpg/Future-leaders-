'use server'

import { cookies } from 'next/headers'
import { LOCALE_COOKIE_NAME, type Locale } from './config'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** Persists the chosen locale in a cookie. Called from the client
 * (`LocaleToggle`), which follows this with `router.refresh()` so the
 * server-rendered `<html lang dir>` in `src/app/layout.tsx` picks up the new
 * value immediately. */
export async function setLocaleCookie(locale: Locale): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  })
}
