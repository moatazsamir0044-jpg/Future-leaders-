import { describe, it, expect } from 'vitest'
import { parsePayrollWorkbook, toImportRows } from '../payroll-workbook'
import { buildWorkbook, workerRow, totalsRow, titleRows, STANDARD_HEADERS, type Cell } from './helpers'

async function parseOne(rows: Cell[][], name = 'MOE HK') {
  const buf = await buildWorkbook([{ name, rows }])
  const wb = await parsePayrollWorkbook(buf, 'test.xlsx')
  return wb.sheets[0]
}

const errors = (s: { issues: { severity: string; code: string; message: string }[] }) =>
  s.issues.filter(i => i.severity === 'error')
const warnings = (s: { issues: { severity: string; code: string; message: string }[] }) =>
  s.issues.filter(i => i.severity === 'warning')
const codes = (list: { code: string }[]) => list.map(i => i.code)

describe('standard sheet', () => {
  it('reads a clean sheet with title rows, header, workers and a totals row', async () => {
    const sheet = await parseOne([
      ...titleRows(),
      STANDARD_HEADERS,
      workerRow({ no: 1, name: 'محمد أحمد', gross: 1000, net: 900 }),
      workerRow({ no: 2, name: 'سارة على', gross: 2000.5, net: 1800.25 }),
      workerRow({ no: 3, name: 'خالد إبراهيم', gross: 1500.5, net: 1400.75 }),
      totalsRow(4501, 4101),
    ])

    expect(errors(sheet)).toEqual([])
    expect(sheet.blocked).toBe(false)
    expect(sheet.skipped).toBe(false)
    expect(sheet.rows).toHaveLength(3)
    expect(sheet.headerRowNumber).toBe(3)
    expect(sheet.sumGross).toBe(4501)
    expect(sheet.sumNet).toBe(4101)
    expect(sheet.totalsRows[0].reconciled).toBe('section')
  })

  it('maps every column to the right field', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({
        no: 7, name: 'اسم', attendance: 24, monthlyLeave: 1, annualLeave: 2,
        noPermission: 3, overtime: 4, lessHours: 5, penalties: 6, salary: 7,
        daily: 8, netDays: 9, absence: 10, insurance: 11, transportCat: 12,
        transport: 13, bonuses: 14, advance: 15, deductions: 16, gross: 17, net: 18,
      }),
      totalsRow(17, 18),
    ])

    expect(errors(sheet)).toEqual([])
    const r = sheet.rows[0]
    expect(r).toMatchObject({
      worker_number: 7, employee_name: 'اسم',
      attendance_days: 24, monthly_leave_days: 1, annual_leave_days: 2,
      absence_no_permission: 3, overtime_hours: 4, less_hours: 5, penalties: 6,
      base_monthly_salary: 7, daily_wage: 8, net_days: 9, absence_days: 10,
      insurance: 11, transportation_category: 12, transportation_amount: 13,
      bonuses: 14, advance: 15, deductions: 16, total_gross: 17, net_salary: 18,
    })
  })

  it('does not confuse فئة المواصلات with مواصلات', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ transportCat: 3, transport: 600, gross: 600, net: 600 }),
      totalsRow(600, 600),
    ])
    expect(sheet.rows[0].transportation_category).toBe(3)
    expect(sheet.rows[0].transportation_amount).toBe(600)
  })

  it('follows the header, not the column position, when columns are reordered', async () => {
    const sheet = await parseOne([
      ['الاسم', 'صافى الراتب', 'الاجمالى', 'رقم العامل', 'سلف', 'تامينات'],
      ['منى حسن', 900, 1000, 42, 50, 50],
      ['الاجمالى', 900, 1000, '', '', ''],
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.rows[0]).toMatchObject({
      employee_name: 'منى حسن', net_salary: 900, total_gross: 1000,
      worker_number: 42, advance: 50, insurance: 50,
    })
  })

  it('accepts alternative Arabic spellings of the headings', async () => {
    const sheet = await parseOne([
      ['اسم الموظف', 'أجازة سنوية', 'الأجازه الشهريه', 'الإجمالي', 'صافي المرتب', 'خصومات'],
      ['أحمد', 2, 1, 500, 400, 100],
      ['الإجمالي', '', '', 500, 400, ''],
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.rows[0]).toMatchObject({
      employee_name: 'أحمد', annual_leave_days: 2, monthly_leave_days: 1,
      total_gross: 500, net_salary: 400, deductions: 100,
    })
  })
})

describe('sections', () => {
  it('captures section headings, repeated headers and per-section subtotals', async () => {
    const sheet = await parseOne([
      ...titleRows(),
      ['مواصلات صباحى'],
      STANDARD_HEADERS,
      workerRow({ no: 1, name: 'عامل أ', gross: 100, net: 90 }),
      workerRow({ no: 2, name: 'عامل ب', gross: 200, net: 180 }),
      totalsRow(300, 270),
      [],
      ['مواصلات مسائى'],
      STANDARD_HEADERS,
      workerRow({ no: 1, name: 'عامل ج', gross: 400, net: 360 }),
      totalsRow(400, 360),
      totalsRow(700, 630, 'الاجمالى الكلى'),
    ])

    expect(errors(sheet)).toEqual([])
    expect(sheet.rows.map(r => r.section)).toEqual([
      'مواصلات صباحى', 'مواصلات صباحى', 'مواصلات مسائى',
    ])
    expect(sheet.sumGross).toBe(700)
    expect(sheet.totalsRows.map(t => t.reconciled)).toEqual(['section', 'section', 'sheet'])
  })

  it('repeats worker numbers across sections without complaint', async () => {
    const sheet = await parseOne([
      ['الفيوم 1'],
      STANDARD_HEADERS,
      workerRow({ no: 1, name: 'عامل أ', gross: 100, net: 100 }),
      ['الفيوم 2'],
      STANDARD_HEADERS,
      workerRow({ no: 1, name: 'عامل ب', gross: 100, net: 100 }),
      totalsRow(200, 200),
    ])
    expect(errors(sheet)).toEqual([])
    expect(codes(warnings(sheet))).not.toContain('duplicate_rows')
    expect(sheet.rows).toHaveLength(2)
  })

  it('keeps a roster row that has a worker number but no figures', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      [5, 'عامل بدون أرقام', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      totalsRow(0, 0),
    ])
    expect(sheet.rows).toHaveLength(1)
    expect(sheet.rows[0]).toMatchObject({ worker_number: 5, employee_name: 'عامل بدون أرقام', total_gross: 0 })
    expect(codes(warnings(sheet))).toContain('zero_rows')
  })
})

describe('number formats', () => {
  it('reads Arabic-Indic digits and the Arabic decimal separator', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ no: '٧', name: 'عامل', netDays: '٢٦', gross: '١٢٣٤٫٥٦', net: '١٬٠٠٠٫٥٠' }),
      totalsRow(1234.56, 1000.5),
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.rows[0]).toMatchObject({
      worker_number: 7, net_days: 26, total_gross: 1234.56, net_salary: 1000.5,
    })
  })

  it('reads thousands separators and accounting negatives', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', gross: '12,345.67', net: '(250.50)', deductions: '1,000' }),
      totalsRow(12345.67, -250.5),
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.rows[0]).toMatchObject({ total_gross: 12345.67, net_salary: -250.5, deductions: 1000 })
    expect(codes(warnings(sheet))).toContain('negative_net')
  })

  it('treats blanks and dashes as zero', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', bonuses: '', advance: '-', insurance: '—', penalties: null, gross: 500, net: 500 }),
      totalsRow(500, 500),
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.rows[0]).toMatchObject({ bonuses: 0, advance: 0, insurance: 0, penalties: 0 })
  })

  it('reads the cached result of a formula cell', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', gross: { formula: 'L2*K2', result: 3354.78 }, net: { formula: 'T2-N2', result: 2914.78 } }),
      totalsRow({ formula: 'SUM(T2:T2)', result: 3354.78 }, { formula: 'SUM(U2:U2)', result: 2914.78 }),
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.rows[0]).toMatchObject({ total_gross: 3354.78, net_salary: 2914.78 })
  })
})

describe('refusals — the sheet is not imported', () => {
  it('blocks a formula with no saved result rather than guessing it', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', gross: { formula: 'L2*K2' }, net: 900 }),
      totalsRow(1000, 900),
    ])
    expect(sheet.blocked).toBe(true)
    expect(codes(errors(sheet))).toContain('uncached_formula')
    expect(sheet.rows).toHaveLength(0)
  })

  it('blocks a cell holding an Excel error value', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', gross: { error: '#DIV/0!' }, net: 900 }),
      totalsRow(1000, 900),
    ])
    expect(sheet.blocked).toBe(true)
    expect(codes(errors(sheet))).toContain('cell_error')
  })

  it('blocks text in a numeric column instead of silently storing zero', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', insurance: 'معفى', gross: 1000, net: 1000 }),
      totalsRow(1000, 1000),
    ])
    expect(sheet.blocked).toBe(true)
    const e = errors(sheet)
    expect(codes(e)).toContain('unreadable_number')
    expect(e[0].message).toContain('معفى')
    expect(sheet.rows).toHaveLength(0)
  })

  it("blocks when the sheet's own total disagrees with its rows", async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل أ', gross: 1000, net: 900 }),
      workerRow({ name: 'عامل ب', gross: 1000, net: 900 }),
      totalsRow(2500, 1800), // gross is 500 too high
    ])
    expect(sheet.blocked).toBe(true)
    const e = errors(sheet)
    expect(codes(e)).toContain('totals_mismatch')
    expect(e[0].message).toContain('500.00 out')
  })

  it('blocks a two-piastre difference', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', gross: 1000, net: 900 }),
      totalsRow(1000.02, 900),
    ])
    expect(sheet.blocked).toBe(true)
    expect(codes(errors(sheet))).toContain('totals_mismatch')
  })

  it('tolerates a one-piastre rounding difference but still reports it', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', gross: 1000, net: 900 }),
      totalsRow(1000.01, 900),
    ])
    expect(sheet.blocked).toBe(false)
    expect(codes(warnings(sheet))).toContain('totals_rounding')
    expect(sheet.sumGross).toBe(1000)
  })

  it('blocks when a required column is missing', async () => {
    const sheet = await parseOne([
      ['رقم العامل', 'الاسم', 'الاجمالى', 'سلف', 'تامينات', 'الغياب'],
      [1, 'عامل', 1000, 0, 0, 0],
      ['', 'الاجمالى', 1000, '', '', ''],
    ])
    expect(sheet.blocked).toBe(true)
    const e = errors(sheet)
    expect(codes(e)).toContain('missing_columns')
    expect(e[0].message).toContain('صافى الراتب')
  })

  it('blocks a row that carries figures but no name', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: '', gross: 1000, net: 900 }),
      totalsRow(1000, 900),
    ])
    expect(sheet.blocked).toBe(true)
    expect(codes(errors(sheet))).toContain('row_without_name')
  })
})

describe('warnings — flagged for review, still importable', () => {
  it('never rewrites a net that does not equal gross minus deductions', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', insurance: 100, advance: 50, gross: 1000, net: 875 }),
      totalsRow(1000, 875),
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.blocked).toBe(false)
    expect(codes(warnings(sheet))).toContain('net_not_gross_minus_deductions')
    // The sheet said 875 and 875 is what gets stored — not the derived 850.
    expect(sheet.rows[0].net_salary).toBe(875)
  })

  it('warns when the same person appears twice in one section', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ no: 3, name: 'محمد على', gross: 100, net: 100 }),
      workerRow({ no: 3, name: 'محمد على', gross: 100, net: 100 }),
      totalsRow(200, 200),
    ])
    expect(errors(sheet)).toEqual([])
    expect(codes(warnings(sheet))).toContain('duplicate_rows')
    expect(sheet.rows).toHaveLength(2)
  })

  it('warns when there is no totals row to cross-check against', async () => {
    const sheet = await parseOne([
      STANDARD_HEADERS,
      workerRow({ name: 'عامل', gross: 100, net: 100 }),
    ])
    expect(errors(sheet)).toEqual([])
    expect(sheet.blocked).toBe(false)
    expect(codes(warnings(sheet))).toContain('no_totals_row')
  })

  it('names the columns it did not recognise and the ones it defaulted to zero', async () => {
    const sheet = await parseOne([
      ['الاسم', 'الاجمالى', 'صافى الراتب', 'سلف', 'تامينات', 'عمود غريب'],
      ['عامل', 100, 100, 0, 0, 'س'],
      ['الاجمالى', 100, 100, '', '', ''],
    ])
    expect(errors(sheet)).toEqual([])
    const w = warnings(sheet)
    expect(codes(w)).toContain('unmatched_columns')
    expect(w.find(i => i.code === 'unmatched_columns')!.message).toContain('عمود غريب')
    expect(codes(w)).toContain('columns_defaulted')
  })
})

describe('workbook level', () => {
  it('skips sheets with no payroll table without blocking them', async () => {
    const buf = await buildWorkbook([
      { name: 'Cover', rows: [['بيان'], ['ملخص الشهر'], ['', 123]] },
      { name: 'MOE HK', rows: [STANDARD_HEADERS, workerRow({ name: 'عامل', gross: 10, net: 10 }), totalsRow(10, 10)] },
    ])
    const wb = await parsePayrollWorkbook(buf, 'aug.xlsx')
    expect(wb.sheets).toHaveLength(2)
    expect(wb.sheets[0].skipped).toBe(true)
    expect(wb.sheets[0].blocked).toBe(false)
    expect(wb.sheets[1].skipped).toBe(false)
    expect(wb.sheets[1].rows).toHaveLength(1)
  })

  it('keeps every sheet separate and preserves tab names for site matching', async () => {
    const buf = await buildWorkbook([
      { name: 'MOE HK', rows: [STANDARD_HEADERS, workerRow({ name: 'أ', gross: 1, net: 1 }), totalsRow(1, 1)] },
      { name: 'ALmza LS', rows: [STANDARD_HEADERS, workerRow({ name: 'ب', gross: 2, net: 2 }), totalsRow(2, 2)] },
    ])
    const wb = await parsePayrollWorkbook(buf, 'aug.xlsx')
    expect(wb.sheets.map(s => s.sheetName)).toEqual(['MOE HK', 'ALmza LS'])
    expect(wb.sheets.map(s => s.sumGross)).toEqual([1, 2])
  })
})

describe('toImportRows', () => {
  it('shapes rows for the import function with the section as notes', async () => {
    const sheet = await parseOne([
      ['G.S'],
      STANDARD_HEADERS,
      workerRow({ no: 4, name: 'عامل', gross: 100, net: 90 }),
      totalsRow(100, 90),
    ])
    const rows = toImportRows(sheet)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      worker_number: 4,
      employee_name: 'عامل',
      notes: 'G.S',
      total_gross: 100,
      net_salary: 90,
    })
    // Every column the function reads is sent explicitly, so no value can fall
    // back to a database default.
    expect(Object.keys(rows[0]).sort()).toEqual([
      'absence_days', 'absence_no_permission', 'advance', 'annual_leave_days',
      'attendance_days', 'base_monthly_salary', 'bonuses', 'daily_wage',
      'deductions', 'employee_name', 'holiday_extra_days', 'insurance',
      'less_hours', 'monthly_leave_days', 'net_days', 'net_salary', 'notes',
      'overtime_hours', 'penalties', 'total_gross', 'transportation_amount',
      'transportation_category', 'worker_number',
    ])
  })
})

describe('production scale', () => {
  it('carries 248 rows across 4 sections through without drift or edits', async () => {
    const sections = ['مواصلات صباحى', 'مواصلات مسائى', 'SPV. Morning&Night', 'المديرين والاشراف']
    const expected: { section: string; name: string; gross: number; net: number }[] = []
    const rows: Cell[][] = [...titleRows()]

    let worker = 0
    for (const section of sections) {
      rows.push([section])
      rows.push(STANDARD_HEADERS)
      let sectionGross = 0
      let sectionNet = 0
      for (let i = 0; i < 62; i++) {
        worker++
        // Values with awkward pennies, so any rounding slip shows up.
        const gross = Math.round((2500 + worker * 13.37) * 100) / 100
        const net = Math.round((gross - 199.99 - worker * 0.07) * 100) / 100
        sectionGross = Math.round((sectionGross + gross) * 100) / 100
        sectionNet = Math.round((sectionNet + net) * 100) / 100
        expected.push({ section, name: `عامل رقم ${worker}`, gross, net })
        rows.push(workerRow({ no: i + 1, name: `عامل رقم ${worker}`, gross, net }))
      }
      rows.push(totalsRow(sectionGross, sectionNet))
    }
    const allGross = Math.round(expected.reduce((s, e) => s + e.gross, 0) * 100) / 100
    const allNet = Math.round(expected.reduce((s, e) => s + e.net, 0) * 100) / 100
    rows.push(totalsRow(allGross, allNet, 'الاجمالى الكلى'))

    const sheet = await parseOne(rows)

    expect(errors(sheet)).toEqual([])
    expect(sheet.blocked).toBe(false)
    expect(sheet.rows).toHaveLength(248)
    expect(sheet.sumGross).toBe(allGross)
    expect(sheet.sumNet).toBe(allNet)
    expect(sheet.totalsRows).toHaveLength(5)
    expect(sheet.totalsRows.every(t => t.reconciled !== null)).toBe(true)

    // Every single value survives exactly as the sheet had it.
    sheet.rows.forEach((row, i) => {
      expect(row.employee_name).toBe(expected[i].name)
      expect(row.section).toBe(expected[i].section)
      expect(row.total_gross).toBe(expected[i].gross)
      expect(row.net_salary).toBe(expected[i].net)
    })
  })

  it('reports the sheets a real monthly workbook would contain', async () => {
    const tabs = ['MOE HK', 'MOE LS', 'Almaza HK', 'ALmza LS', 'CFCM HK', 'B Office']
    const buf = await buildWorkbook(tabs.map((name, i) => ({
      name,
      rows: [
        ...titleRows(name),
        STANDARD_HEADERS,
        workerRow({ no: 1, name: `عامل ${i}`, gross: 100 + i, net: 90 + i }),
        totalsRow(100 + i, 90 + i),
      ],
    })))
    const wb = await parsePayrollWorkbook(buf, 'August 2026.xlsx')
    expect(wb.sheets.map(s => s.sheetName)).toEqual(tabs)
    expect(wb.sheets.every(s => !s.blocked && !s.skipped)).toBe(true)
    expect(wb.sheets.map(s => s.rows.length)).toEqual([1, 1, 1, 1, 1, 1])
  })
})
