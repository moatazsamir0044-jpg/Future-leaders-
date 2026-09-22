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

  it('extracts the result from a shared-formula cell value', () => {
    expect(coerceText({ sharedFormula: 'A1', formula: 'B1+B2', result: 5000 })).toBe('5000')
  })

  it('returns empty string, not "[object Object]", for a formula cell with no cached result', () => {
    // Confirmed present in the real files: a shared-formula cell exceljs
    // never computed/cached a result for. Before this was fixed it fell
    // through every check to String(value), producing the literal text
    // "[object Object]" — silently corrupting raw_row.
    expect(coerceText({ sharedFormula: 'A1', formula: 'B1+B2' })).toBe('')
    expect(coerceText({ formula: 'B1+B2' })).toBe('')
  })

  it('returns the error code for a formula error cell', () => {
    expect(coerceText({ error: '#DIV/0!' })).toBe('#DIV/0!')
  })

  it('unwraps an error result nested inside a formula cell', () => {
    expect(coerceText({ formula: 'A1/B1', result: { error: '#DIV/0!' } })).toBe('#DIV/0!')
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

  it('returns null, not NaN, for a formula cell with no cached result', () => {
    expect(coerceNumber({ sharedFormula: 'A1', formula: 'B1+B2' })).toBeNull()
  })

  it('returns null for a formula error cell', () => {
    expect(coerceNumber({ error: '#DIV/0!' })).toBeNull()
    expect(coerceNumber({ formula: 'A1/B1', result: { error: '#DIV/0!' } })).toBeNull()
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

  it('never stores the literal text "[object Object]" for an uncomputed shared-formula cell', () => {
    // This is what raw_row actually calls (parse-workbook.ts) — the
    // regression this whole file is guarding against showed up here, not
    // in coerceText's own unit tests, since raw_row is what a user sees
    // when they inspect a row's real content.
    expect(toRawJsonValue({ sharedFormula: 'A1', formula: 'B1+B2' })).toBeNull()
  })
})
