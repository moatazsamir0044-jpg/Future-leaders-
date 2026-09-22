import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from './parse-workbook'
import type { SheetParseResult } from './types'

// Every fixture in this file is built in-memory with exceljs and never
// touches disk — per the import plan (§9), unit tests use synthetic
// fixtures reproducing the documented real-file messiness, never the real
// ~/Downloads files (which contain real employee PII).

function setRow(ws: ExcelJS.Worksheet, rowNumber: number, values: Array<string | number | null>) {
  const row = ws.getRow(rowNumber)
  values.forEach((value, i) => {
    row.getCell(i + 1).value = value
  })
}

function sheetByName(result: { sheets: SheetParseResult[] }, name: string): SheetParseResult {
  const sheet = result.sheets.find((s) => s.sheetName === name)
  if (!sheet) throw new Error(`sheet "${name}" not found in parse result`)
  return sheet
}

async function buildFixtureWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  // ── Total tab (excluded from classification, used for cross-checking) ──
  const total = workbook.addWorksheet('Total')
  setRow(total, 1, ['اسم الموقع', 'الاجمالى'])
  setRow(total, 2, ['SiteA', 9800]) // matches SiteA's computed total exactly
  setRow(total, 3, ['SiteB', 4000]) // matches SiteB's computed total exactly
  setRow(total, 4, ['Futtaim', 9999]) // deliberately does NOT match Futtaim's computed total (5000)

  // ── مقارنه (comparison) tab — excluded, content irrelevant ──────────────
  const comparison = workbook.addWorksheet('مقارنه')
  setRow(comparison, 1, ['شهر', 'فرق'])
  setRow(comparison, 2, ['يوليو', 500])

  // ── SiteA: header several rows down, blank filler row, an embedded
  //    subtotal row, and a non-worker cost row mixed into the worker list ──
  const siteA = workbook.addWorksheet('SiteA')
  setRow(siteA, 1, ['شركة بروفشنال ليدرز'])
  setRow(siteA, 2, ['مرتبات شهر يوليو', 'الموقع / مول تجريبى'])
  setRow(siteA, 3, ['رقم', 'الاسم', 'الراتب الشهرى', 'الاجمالى'])
  setRow(siteA, 4, ['1', 'محمد أحمد', 3000, 3200])
  // row 5 intentionally left untouched: a blank filler row
  setRow(siteA, 6, ['2', 'أحمد علي', 2800, 3000])
  setRow(siteA, 7, ['', 'اجمالي الفريق الأول', '', 6200]) // embedded subtotal, not the end marker
  setRow(siteA, 8, ['3', 'سارة محمود', 2900, 3100])
  setRow(siteA, 9, ['', 'ايجار سيارة النقل', '', 500]) // non-worker cost line
  setRow(siteA, 10, ['اجماليات', '', '', 9800]) // end-of-sheet marker

  // ── SiteB: header at row 1 (no title rows above it — the header row
  //    genuinely sits at a different position from sheet to sheet) ──
  const siteB = workbook.addWorksheet('SiteB')
  setRow(siteB, 1, ['رقم', 'الاسم', 'الاجمالى'])
  setRow(siteB, 2, ['1', 'خالد', 4000])
  setRow(siteB, 3, ['اجماليات', '', 4000])

  // ── SiteC: no اجماليات row at all — the sheet just ends ──────────────
  const siteC = workbook.addWorksheet('SiteC')
  setRow(siteC, 1, ['رقم', 'الاسم', 'الاجمالى'])
  setRow(siteC, 2, ['1', 'ليلى', 2000])
  setRow(siteC, 3, ['2', 'منى', 2200])

  // ── Futtaim: a differently-ordered column layout (total first, then
  //    name, then number) plus one drifted leave-label spelling ──
  const futtaim = workbook.addWorksheet('Futtaim')
  setRow(futtaim, 1, ['الاجمالى', 'الاسم', 'رقم', 'اجازت اعياد'])
  setRow(futtaim, 2, [5000, 'ياسر', '10', 3])
  setRow(futtaim, 3, ['اجماليات', '', '', ''])

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

describe('parseWorkbook', () => {
  it('drops the Total and مقارنه tabs from classification', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    expect(result.excludedSheetNames.sort()).toEqual(['Total', 'مقارنه'].sort())
    expect(result.sheets.map((s) => s.sheetName).sort()).toEqual(
      ['Futtaim', 'SiteA', 'SiteB', 'SiteC'].sort(),
    )
  })

  it('finds the header row by content at a different position per sheet', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    expect(sheetByName(result, 'SiteA').headerRowNumber).toBe(3)
    expect(sheetByName(result, 'SiteB').headerRowNumber).toBe(1)
  })

  it('extracts the workbook\'s own الموقع site-name hint when present, and is null when the header sits at row 1 with no title rows above it', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    expect(sheetByName(result, 'SiteA').siteNameHint).toBe('مول تجريبى')
    expect(sheetByName(result, 'SiteB').siteNameHint).toBeNull()
  })

  it('skips a blank filler row without ending the sheet, classifies an embedded subtotal row and a non-worker cost row, and never drops a row', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    const siteA = sheetByName(result, 'SiteA')

    expect(siteA.headerFound).toBe(true)
    expect(siteA.foundEndMarker).toBe(true)
    expect(siteA.hitSafetyCap).toBe(false)
    expect(siteA.unmappedHeaders).toEqual([])

    // 3 worker rows + 1 embedded subtotal + 1 non-worker-cost = 5 rows total;
    // the blank filler row and the terminating اجماليات row are excluded.
    expect(siteA.rows).toHaveLength(5)
    expect(siteA.rowCountsByKind).toEqual({ worker: 3, subtotal: 1, non_worker_cost: 1, unknown: 0 })

    const bySourceRow = new Map(siteA.rows.map((r) => [r.sourceRowNumber, r]))
    expect(bySourceRow.get(4)?.rowKind).toBe('worker')
    expect(bySourceRow.get(4)?.workerName).toBe('محمد أحمد')
    expect(bySourceRow.get(4)?.totalGross).toBe(3200)
    expect(bySourceRow.get(7)?.rowKind).toBe('subtotal')
    expect(bySourceRow.get(9)?.rowKind).toBe('non_worker_cost')
    expect(bySourceRow.get(9)?.totalGross).toBe(500)

    // No row from row 5 (the blank filler) and none from row 10 (the end marker).
    expect(bySourceRow.has(5)).toBe(false)
    expect(bySourceRow.has(10)).toBe(false)
  })

  it('preserves the full original row in raw_row, keyed by literal header text, including for an unmapped column', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    const siteA = sheetByName(result, 'SiteA')
    const row4 = siteA.rows.find((r) => r.sourceRowNumber === 4)!

    expect(row4.rawRow).toEqual({
      'رقم': '1',
      'الاسم': 'محمد أحمد',
      'الراتب الشهرى': 3000,
      'الاجمالى': 3200,
    })
  })

  it('handles a differently-ordered column layout (Futtaim-style) via header text, not position', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    const futtaim = sheetByName(result, 'Futtaim')

    expect(futtaim.rows).toHaveLength(1)
    const row = futtaim.rows[0]
    expect(row.workerNumber).toBe('10')
    expect(row.workerName).toBe('ياسر')
    expect(row.totalGross).toBe(5000)
    expect(row.rowKind).toBe('worker')
  })

  it('maps the اجازت اعياد spelling to annual_leave_days and records it in leave_label_raw', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    const futtaim = sheetByName(result, 'Futtaim')
    const row = futtaim.rows[0]

    expect(row.annualLeaveDays).toBe(3)
    expect(row.leaveLabelRaw).toBe('اجازت اعياد')
  })

  it('reports a missing اجماليات row without dropping any data or crashing', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    const siteC = sheetByName(result, 'SiteC')

    expect(siteC.foundEndMarker).toBe(false)
    expect(siteC.hitSafetyCap).toBe(false)
    expect(siteC.rows).toHaveLength(2)
    expect(siteC.warnings.some((w) => w.includes('no اجماليات row'))).toBe(true)
  })

  it('warns when a sheet total does not match the workbook\'s own Total tab figure, and stays quiet when it does', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())

    const siteA = sheetByName(result, 'SiteA')
    expect(siteA.warnings.some((w) => w.includes('does not match'))).toBe(false)

    const futtaim = sheetByName(result, 'Futtaim')
    expect(futtaim.warnings.some((w) => w.includes('does not match'))).toBe(true)
  })

  it('reports the workbook-level warnings list with each warning attributed to its sheet', async () => {
    const result = await parseWorkbook(await buildFixtureWorkbook())
    const futtaimWarning = result.warnings.find((w) => w.sheetName === 'Futtaim')
    expect(futtaimWarning?.message).toMatch(/does not match/)
  })
})
