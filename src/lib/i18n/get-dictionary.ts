import type { Locale } from './config'
import en from './dictionaries/en'
import ar from './dictionaries/ar'

export type TranslationKey = keyof typeof en
export type Dictionary = Record<TranslationKey, string>

const dictionaries: Record<Locale, Dictionary> = { en, ar }

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}
