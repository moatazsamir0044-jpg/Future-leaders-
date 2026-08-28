import { describe, it, expect } from 'vitest'
import { normalizeKey, cleanText, parseNumber, toAsciiDigits, round2 } from '../arabic'

describe('toAsciiDigits', () => {
  it('converts both Arabic-Indic digit ranges', () => {
    expect(toAsciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
    expect(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
    expect(toAsciiDigits('عدد ٢٦ يوم')).toBe('عدد 26 يوم')
  })
})

describe('normalizeKey', () => {
  it('folds the letter variants Egyptian data entry treats as the same', () => {
    expect(normalizeKey('أجازة سنوية')).toBe(normalizeKey('اجازه سنويه'))
    expect(normalizeKey('صافى الراتب')).toBe(normalizeKey('صافي الراتب'))
    expect(normalizeKey('الإجمالي')).toBe(normalizeKey('الاجمالى'))
    expect(normalizeKey('مسئول')).toBe(normalizeKey('مسيول'))
  })

  it('ignores diacritics, tatweel and invisible bidi marks', () => {
    expect(normalizeKey('الرَّاتِب')).toBe(normalizeKey('الراتب'))
    expect(normalizeKey('الراتـــب')).toBe(normalizeKey('الراتب'))
    expect(normalizeKey('‏الراتب‎')).toBe(normalizeKey('الراتب'))
    expect(normalizeKey('﻿Name')).toBe('name')
  })

  it('ignores punctuation and case differences', () => {
    expect(normalizeKey('Net Salary')).toBe(normalizeKey('net-salary'))
    expect(normalizeKey('رقم العامل.')).toBe(normalizeKey('رقم العامل'))
    expect(normalizeKey('  عدد   الايام  ')).toBe('عدد الايام')
  })
})

describe('cleanText', () => {
  it('strips invisibles and collapses whitespace without altering letters', () => {
    expect(cleanText('  محمد   أحمد ‏ ')).toBe('محمد أحمد')
    expect(cleanText('أحمد')).toBe('أحمد') // hamza preserved — this is a name
  })
})

describe('parseNumber', () => {
  it('reads plain numbers', () => {
    expect(parseNumber(1234.56)).toEqual({ ok: true, value: 1234.56 })
    expect(parseNumber('1234.56')).toEqual({ ok: true, value: 1234.56 })
    expect(parseNumber('-50')).toEqual({ ok: true, value: -50 })
  })

  it('reads Arabic numerals and separators', () => {
    expect(parseNumber('١٢٣٤٫٥٦').value).toBe(1234.56)
    expect(parseNumber('١٬٢٣٤٫٥٦').value).toBe(1234.56)
  })

  it('reads thousands separators but keeps a decimal comma decimal', () => {
    expect(parseNumber('1,234').value).toBe(1234)
    expect(parseNumber('1,234,567.89').value).toBe(1234567.89)
    expect(parseNumber('1,5').value).toBe(1.5)
  })

  it('reads accounting negatives', () => {
    expect(parseNumber('(250.50)').value).toBe(-250.5)
  })

  it('treats blanks and "nothing here" markers as zero', () => {
    for (const empty of ['', '   ', '-', '—', '–', 'N/A', 'لا يوجد', null, undefined]) {
      expect(parseNumber(empty)).toMatchObject({ ok: true, value: 0 })
    }
  })

  it('refuses text rather than silently returning zero', () => {
    for (const text of ['معفى', 'abc', '12abc', '1.2.3', true, new Date()]) {
      expect(parseNumber(text).ok).toBe(false)
    }
  })

  it('refuses non-finite numbers', () => {
    expect(parseNumber(Infinity).ok).toBe(false)
    expect(parseNumber(NaN).ok).toBe(false)
  })

  it('strips currency wording that sometimes rides along', () => {
    expect(parseNumber('1500 جنيه').value).toBe(1500)
    expect(parseNumber('1500 EGP').value).toBe(1500)
  })
})

describe('round2', () => {
  it('rounds money without float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(3604.784999)).toBe(3604.78)
  })
})
