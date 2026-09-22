'use client'

import { createContext, useContext, useMemo } from 'react'
import type { Locale } from '@/lib/i18n/config'
import { directionForLocale } from '@/lib/i18n/config'
import type { Dictionary, TranslationKey } from '@/lib/i18n/get-dictionary'

interface I18nContextValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  children: React.ReactNode
}) {
  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      dir: directionForLocale(locale),
      t: (key) => dictionary[key] ?? key,
    }
  }, [locale, dictionary])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useTranslation must be used within an I18nProvider')
  }
  return ctx
}
