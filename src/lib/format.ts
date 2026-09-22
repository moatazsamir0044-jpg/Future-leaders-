import type { Locale } from '@/lib/i18n/config'

const MONTH_KEYS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_KEYS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/** Numbers stay Latin-digit / Gregorian regardless of UI locale — the
 * source data and money amounts read better as plain digits in both
 * languages than as Arabic-Indic digits. */
export function formatNumber(value: number | null | undefined, locale: Locale = 'en'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US').format(value)
}

export function formatCurrency(value: number | null | undefined, locale: Locale = 'en'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value)
  return locale === 'ar' ? `${formatted} ج.م` : `EGP ${formatted}`
}

export function formatPercent(value: number | null | undefined, locale: Locale = 'en'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(value)}%`
}

export function monthName(month: number, locale: Locale = 'en'): string {
  const idx = Math.min(Math.max(month - 1, 0), 11)
  return locale === 'ar' ? MONTH_KEYS_AR[idx] : MONTH_KEYS_EN[idx]
}

export function periodLabel(year: number, month: number, locale: Locale = 'en'): string {
  return `${monthName(month, locale)} ${year}`
}
