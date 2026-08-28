import { describe, it, expect } from 'vitest'
import { hasArabic } from './arabic'

const MOHAMED = '\u0645\u062d\u0645\u062f'          // "Mohamed"
const SHAPED_MEEM = '\ufee3'                          // meem, initial presentation form

describe('hasArabic', () => {
  it('detects Arabic letters', () => {
    expect(hasArabic(MOHAMED)).toBe(true)
  })

  it('detects Arabic presentation forms', () => {
    // jsPDF shapes text itself, so already-shaped strings must match too.
    expect(hasArabic(SHAPED_MEEM)).toBe(true)
  })

  it('is false for Latin, digits and punctuation', () => {
    expect(hasArabic('Mall of Egypt - HK')).toBe(false)
    expect(hasArabic('12,345.67')).toBe(false)
    expect(hasArabic('-')).toBe(false)
  })

  it('is false for empty and missing values', () => {
    expect(hasArabic('')).toBe(false)
    expect(hasArabic(null)).toBe(false)
    expect(hasArabic(undefined)).toBe(false)
  })

  it('detects Arabic mixed into a Latin string', () => {
    expect(hasArabic('Arkan Plaza - ' + MOHAMED)).toBe(true)
  })
})
