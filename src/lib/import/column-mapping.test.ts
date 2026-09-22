import { describe, expect, it } from 'vitest'
import { buildColumnMapping } from './column-mapping'
import type { DetectedHeader } from './types'

function headers(...texts: string[]): DetectedHeader[] {
  return texts.map((rawText, i) => ({ columnIndex: i + 1, rawText }))
}

describe('buildColumnMapping', () => {
  it('maps the real export header row end to end', () => {
    const result = buildColumnMapping(
      headers(
        'رقم العامل', 'الاسم', 'عدد أيام الحضور', 'اجازات شهرى', 'اجازه سنوي', 'غياب بدون اذن',
        'ساعات اضافى', 'ساعات اقل', 'الراتب الشهرى', 'الاجر اليومى', 'صافى الايام',
        'الغياب', 'تامينات', 'فئة المواصلات', 'مواصلات', 'مكافاءت', 'سلف', 'استقطاعات',
        'الاجمالى', 'صافى الراتب', 'التوقيع',
      ),
    )

    expect(result.fieldsByColumn.get(1)).toBe('worker_number')
    expect(result.fieldsByColumn.get(2)).toBe('worker_name')
    expect(result.fieldsByColumn.get(5)).toBe('annual_leave_days')
    expect(result.fieldsByColumn.get(19)).toBe('total_gross')
    expect(result.fieldsByColumn.get(21)).toBe('signature_notes')
    expect(result.unmappedHeaders).toEqual([])
  })

  it('maps all three documented drifted leave-label spellings to annual_leave_days', () => {
    for (const label of ['اجازه سنوي', 'اجازت اعياد', 'اجازت سنوى']) {
      const result = buildColumnMapping(headers('الاسم', 'رقم', label))
      expect(result.fieldsByColumn.get(3)).toBe('annual_leave_days')
      expect(result.annualLeaveHeaderText).toBe(label)
    }
  })

  it('is unaffected by column order (Futtaim-style reordering)', () => {
    const inOrder = buildColumnMapping(headers('رقم', 'الاسم', 'الاجمالى'))
    const reordered = buildColumnMapping(headers('الاجمالى', 'رقم', 'الاسم'))

    expect(inOrder.fieldsByColumn.get(3)).toBe('total_gross')
    expect(reordered.fieldsByColumn.get(1)).toBe('total_gross')
    expect(reordered.fieldsByColumn.get(2)).toBe('worker_number')
    expect(reordered.fieldsByColumn.get(3)).toBe('worker_name')
  })

  it('reports unrecognized headers as unmapped rather than dropping them', () => {
    const result = buildColumnMapping(headers('رقم', 'الاسم', 'عمود غريب غير معروف'))
    expect(result.unmappedHeaders).toHaveLength(1)
    expect(result.unmappedHeaders[0].rawText).toBe('عمود غريب غير معروف')
    expect(result.fieldsByColumn.has(3)).toBe(false)
  })

  it('ignores blank header cells without treating them as unmapped', () => {
    const result = buildColumnMapping(headers('رقم', 'الاسم', ''))
    expect(result.unmappedHeaders).toEqual([])
  })

  it('is tolerant of alef-variant spelling drift in a header', () => {
    // "الأسم" (hamza-on-alef) vs. the canonical alias "الاسم"
    const result = buildColumnMapping(headers('رقم', 'الأسم'))
    expect(result.fieldsByColumn.get(2)).toBe('worker_name')
  })

  it('returns null annualLeaveHeaderText when no leave column is present', () => {
    const result = buildColumnMapping(headers('رقم', 'الاسم'))
    expect(result.annualLeaveHeaderText).toBeNull()
  })
})
