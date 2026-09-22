import { describe, expect, it } from 'vitest'
import { coerceNumber, coerceText, toRawJsonValue } from './normalize-row'

describe('coerceText', () => {
  it('trims plain strings', () => {
    expect(coerceText('  محمد  ')).toBe('محمد')
  })

  it('stringifies numbers and booleans', () => {
    expect(coerceText(42)).toBe('42')
    expect(coerceText(true)).toBe('true')
  })

  it('returns empty string for null/undefined', () => {
    expect(coerceText(null)).toBe('')
    expect(coerceText(undefined)).toBe('')
  })

  it('extracts text from a richText cell value', () => {
    expect(coerceText({ richText: [{ text: 'اجمالي ' }, { text: 'الشهر' }] })).toBe('اجمالي الشهر')
  })

  it('extracts the result from a formula cell value', () => {
    expect(coerceText({ formula: 'A1+A2', result: 'مجموع' })).toBe('مجموع')
  })

  it('extracts text from a hyperlink cell value', () => {
    expect(coerceText({ text: 'ملاحظة', hyperlink: 'https://example.test' })).toBe('ملاحظة')
  })
})

describe('coerceNumber', () => {
  it('passes plain finite numbers through', () => {
    expect(coerceNumber(1234.5)).toBe(1234.5)
    expect(coerceNumber(0)).toBe(0)
  })

  it('returns null for empty/blank/dash tokens', () => {
    expect(coerceNumber('')).toBeNull()
    expect(coerceNumber('   ')).toBeNull()
    expect(coerceNumber('-')).toBeNull()
    expect(coerceNumber(null)).toBeNull()
    expect(coerceNumber(undefined)).toBeNull()
  })

  it('converts Arabic-Indic digits', () => {
    expect(coerceNumber('١٢٣٤')).toBe(1234)
    expect(coerceNumber('٥٠٠.٧٥')).toBe(500.75)
  })

  it('strips thousands separators', () => {
    expect(coerceNumber('12,500')).toBe(12500)
    expect(coerceNumber('12,500.50')).toBe(12500.5)
  })

  it('reads a formula result', () => {
    expect(coerceNumber({ formula: 'SUM(A1:A5)', result: 9999 })).toBe(9999)
  })

  it('returns null for non-numeric text rather than NaN', () => {
    expect(coerceNumber('ملاحظة نصية')).toBeNull()
  })

  it('returns null for a boolean cell', () => {
    expect(coerceNumber(true)).toBeNull()
  })
})

describe('toRawJsonValue', () => {
  it('keeps numbers as numbers', () => {
    expect(toRawJsonValue(42)).toBe(42)
  })

  it('turns blank text into null', () => {
    expect(toRawJsonValue('   ')).toBeNull()
    expect(toRawJsonValue(null)).toBeNull()
  })

  it('keeps non-blank text as a trimmed string', () => {
    expect(toRawJsonValue('  محمد  ')).toBe('محمد')
  })
})
