import { describe, expect, it } from 'vitest'
import { normalizeArabic, normalizeForCompare } from './normalize-arabic'

describe('normalizeArabic', () => {
  it('unifies alef variants', () => {
    expect(normalizeArabic('أحمد')).toBe(normalizeArabic('احمد'))
    expect(normalizeArabic('إسلام')).toBe(normalizeArabic('اسلام'))
    expect(normalizeArabic('آدم')).toBe(normalizeArabic('ادم'))
  })

  it('strips tatweel', () => {
    expect(normalizeArabic('اجمـــالي')).toBe('اجمالي')
  })

  it('collapses internal whitespace and trims', () => {
    expect(normalizeArabic('  اجمالي   الشهر  ')).toBe('اجمالي الشهر')
  })

  it('returns an empty string for null/undefined', () => {
    expect(normalizeArabic(null)).toBe('')
    expect(normalizeArabic(undefined)).toBe('')
  })
})

describe('normalizeForCompare', () => {
  it('case-folds mixed Arabic/Latin text', () => {
    expect(normalizeForCompare('H Office')).toBe('h office')
    expect(normalizeForCompare('h office')).toBe(normalizeForCompare('H Office'))
  })

  it('makes the three documented leave-label spellings compare equal to themselves but distinct from each other', () => {
    // They are NOT expected to normalize to the same string — that's what
    // HEADER_ALIASES is for. normalizeForCompare only removes incidental
    // spelling noise (alef variants, tatweel, whitespace), not real drift.
    const a = normalizeForCompare('اجازه سنوي')
    const b = normalizeForCompare('اجازت اعياد')
    const c = normalizeForCompare('اجازت سنوى')
    expect(new Set([a, b, c]).size).toBe(3)
  })
})
