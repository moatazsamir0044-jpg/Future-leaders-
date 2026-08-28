import { describe, it, expect, beforeAll } from 'vitest'
import { buildPayrollPdf } from './pdf'
import type { PayrollPeriod, PayrollRecord, Site } from '@/types'

// Builds the real payroll PDF and inspects the bytes. This is the regression
// test for the export that used to render every Arabic worker name as
// mojibake, because jsPDF's built-in WinAnsi fonts have no Arabic glyphs.

const site: Site = {
  id: 's1', name: 'Mall of Egypt - HK',
  name_ar: '\u0645\u0648\u0644 \u0645\u0635\u0631',
  service_type: 'hk', client_name: 'Tagamoa region', active: true, sort_order: 1,
  created_at: '2026-01-01T00:00:00Z',
}
const period: PayrollPeriod = {
  id: 'p1', site_id: 's1', month: 5, year: 2026, status: 'approved',
  submitted_by: null, approved_by: null, submitted_at: null, approved_at: null,
  rejection_notes: null, total_gross: 5200, total_net: 4700,
  created_at: '2026-05-01T00:00:00Z',
}
const ARABIC_NAME = '\u0645\u062d\u0645\u062f \u0623\u062d\u0645\u062f'  // "Mohamed Ahmed"

const record = (over: Partial<PayrollRecord> = {}): PayrollRecord => ({
  id: 'r1', period_id: 'p1', employee_id: null, site_id: 's1', worker_number: 1,
  employee_name: ARABIC_NAME,
  attendance_days: 26, absence_days: 0, net_days: 26, monthly_leave_days: 0,
  annual_leave_days: 0, absence_no_permission: 0, overtime_hours: 0, less_hours: 0,
  base_monthly_salary: 5200, daily_wage: 200, bonuses: 0, transportation_amount: 0,
  transportation_category: 0, advance: 0, deductions: 0, insurance: 0, penalties: 0,
  holiday_extra_days: 0, total_gross: 5200, net_salary: 4700, notes: null,
  created_at: '2026-05-01T00:00:00Z',
  ...over,
})

describe('buildPayrollPdf', () => {
  let raw: string

  beforeAll(async () => {
    const doc = await buildPayrollPdf(period, site, [
      record(),
      record({ id: 'r2', worker_number: 2, employee_name: 'Latin Name' }),
    ])
    raw = Buffer.from(doc.output('arraybuffer') as ArrayBuffer).toString('latin1')
  })

  it('produces a PDF', () => {
    expect(raw.slice(0, 5)).toBe('%PDF-')
  })

  it('embeds the Arabic font as a CID font', () => {
    // Without this the Arabic cells fall back to WinAnsi Helvetica, which has
    // no Arabic glyphs, and the names come out as unreadable Latin-1 bytes.
    expect(raw).toContain('NotoNaskhArabic')
    expect(raw).toContain('/Type0')
    expect(raw).toContain('/FontFile2')
  })

  it('writes Arabic cells as embedded-font glyph ids', () => {
    // Arabic runs are emitted as hex glyph-id strings rather than literal text.
    const hexRuns = raw.match(/<[0-9a-fA-F]{8,}>\s*Tj/g) ?? []
    expect(hexRuns.length).toBeGreaterThan(0)
  })

  it('still writes the Latin header as plain text', () => {
    expect(raw).toContain('Professional Leaders')
  })

  it('does not leave Arabic text in a WinAnsi string literal', () => {
    // The old output encoded Arabic as raw UTF-16 bytes inside a (...) literal.
    // Those show up as the byte pair 0xFE / 0xFF sequences seen before the fix.
    const literals = raw.match(/\([^)]*\)\s*Tj/g) ?? []
    const mojibake = literals.filter(l => /\u00fe[\u0080-\u00ff]/.test(l))
    expect(mojibake).toEqual([])
  })
})
