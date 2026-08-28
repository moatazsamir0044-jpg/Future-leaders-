import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { parsePayrollWorkbook } from '../payroll-workbook'
import { NUMERIC_FIELDS } from '../columns'
import { buildWorkbook, workerRow, totalsRow, titleRows, STANDARD_HEADERS, type Cell } from './helpers'

/**
 * Round-trip against a real month of production data.
 *
 * Point PLPM_PROD_FIXTURE at a JSON array of payroll_records rows (names
 * substituted) and this rebuilds them into a workbook laid out the way the
 * site sheets are — section heading, repeated header, worker rows, subtotal —
 * then checks the parser hands back every value unchanged. It is skipped when
 * the fixture is absent, so the suite still runs anywhere.
 */
const fixturePath = process.env.PLPM_PROD_FIXTURE
const hasFixture = Boolean(fixturePath && existsSync(fixturePath))

interface Row {
  worker_number: number | null
  employee_name: string
  notes: string | null
  [field: string]: number | string | null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => Number(v ?? 0)

describe.skipIf(!hasFixture)('production round-trip', () => {
  it('returns every value of a real monthly sheet exactly as stored', async () => {
    const source: Row[] = JSON.parse(readFileSync(fixturePath!, 'utf-8'))
    expect(source.length).toBeGreaterThan(0)

    // Group into sections in the order they appear, as the sheet is laid out.
    const groups: { label: string | null; rows: Row[] }[] = []
    for (const row of source) {
      const label = row.notes
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.rows.push(row)
      else groups.push({ label, rows: [row] })
    }

    const sheetRows: Cell[][] = [...titleRows('Cairo Festival City - HK')]
    for (const group of groups) {
      if (group.label !== null) sheetRows.push([group.label])
      sheetRows.push(STANDARD_HEADERS)
      let gross = 0
      let net = 0
      for (const row of group.rows) {
        gross = round2(gross + num(row.total_gross))
        net = round2(net + num(row.net_salary))
        sheetRows.push(workerRow({
          no: row.worker_number ?? '', name: row.employee_name,
          attendance: num(row.attendance_days), monthlyLeave: num(row.monthly_leave_days),
          annualLeave: num(row.annual_leave_days), noPermission: num(row.absence_no_permission),
          overtime: num(row.overtime_hours), lessHours: num(row.less_hours),
          penalties: num(row.penalties), salary: num(row.base_monthly_salary),
          daily: num(row.daily_wage), netDays: num(row.net_days), absence: num(row.absence_days),
          insurance: num(row.insurance), transportCat: num(row.transportation_category),
          transport: num(row.transportation_amount), bonuses: num(row.bonuses),
          advance: num(row.advance), deductions: num(row.deductions),
          gross: num(row.total_gross), net: num(row.net_salary),
        }))
      }
      sheetRows.push(totalsRow(gross, net))
    }
    const allGross = round2(source.reduce((s, r) => s + num(r.total_gross), 0))
    const allNet = round2(source.reduce((s, r) => s + num(r.net_salary), 0))
    sheetRows.push(totalsRow(allGross, allNet, 'الاجمالى الكلى'))

    const wb = await parsePayrollWorkbook(await buildWorkbook([{ name: 'CFCM HK', rows: sheetRows }]))
    const sheet = wb.sheets[0]

    // Holiday extra days is not a column on these sheets; it is the one field
    // the standard layout cannot carry, so it is excluded from the comparison.
    const compared = NUMERIC_FIELDS.filter(f => f !== 'holiday_extra_days')

    expect(sheet.issues.filter(i => i.severity === 'error')).toEqual([])
    expect(sheet.blocked).toBe(false)
    expect(sheet.rows).toHaveLength(source.length)
    expect(sheet.sumGross).toBe(allGross)
    expect(sheet.sumNet).toBe(allNet)
    expect(sheet.totalsRows.every(t => t.reconciled !== null)).toBe(true)

    const mismatches: string[] = []
    sheet.rows.forEach((parsed, i) => {
      const original = source[i]
      if (parsed.employee_name !== original.employee_name) {
        mismatches.push(`row ${i}: name ${parsed.employee_name} ≠ ${original.employee_name}`)
      }
      if (parsed.section !== original.notes) {
        mismatches.push(`row ${i}: section ${parsed.section} ≠ ${original.notes}`)
      }
      if (parsed.worker_number !== original.worker_number) {
        mismatches.push(`row ${i}: worker_number ${parsed.worker_number} ≠ ${original.worker_number}`)
      }
      for (const field of compared) {
        if (parsed[field] !== round2(num(original[field]))) {
          mismatches.push(`row ${i}: ${field} ${parsed[field]} ≠ ${original[field]}`)
        }
      }
    })
    expect(mismatches).toEqual([])
  })
})
