// Lightweight bilingual i18n config. Deliberately not next-intl — the whole
// app needs roughly 50-100 flat strings, so a routing/catalog library would
// be disproportionate (see plan §8). Locale is persisted in a cookie and read
// SERVER-SIDE in src/app/layout.tsx so `<html lang dir>` is correct on first
// paint (no flash of wrong direction).

export type Locale = 'en' | 'ar'

export const LOCALES: Locale[] = ['en', 'ar']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE_NAME = 'pv_locale'

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'en' || value === 'ar'
}

export function directionForLocale(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}
