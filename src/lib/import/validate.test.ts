import { describe, expect, it } from 'vitest'
import {
  buildSheetWarnings,
  countRowsByKind,
  crossCheckAmount,
  crossCheckSheetTotal,
  extractTotalsTabFigures,
  extractWorkbookGrandTotal,
  sumField,
  sumTotalGross,
} from './validate'
import type { WorksheetLike } from './header-detection'
import type { ParsedPayrollLine, RowKind } from './types'

function line(overrides: Partial<ParsedPayrollLine> & { rowKind: RowKind }): ParsedPayrollLine {
  return {
    sheetName: 'Test',
    sourceRowNumber: 1,
    workerNumber: null,
    workerName: null,
    attendanceDays: null,
    absenceDays: null,
    netDays: null,
    monthlyLeaveDays: null,
    annualLeaveDays: null,
    absenceNoPermissionDays: null,
    overtimeHours: null,
    lessHours: null,
    leaveLabelRaw: null,
    baseMonthlySalary: null,
    dailyWage: null,
    bonuses: null,
    transportationAmount: null,
    transportationCategory: null,
    advance: null,
    deductions: null,
    insurance: null,
    totalGross: null,
    netSalary: null,
    signatureNotes: null,
    rawRow: {},
    ...overrides,
  }
}

describe('countRowsByKind', () => {
  it('counts every kind, including zero counts', () => {
    const counts = countRowsByKind([
      line({ rowKind: 'worker' }),
      line({ rowKind: 'worker' }),
      line({ rowKind: 'unknown' }),
    ])
    expect(counts).toEqual({ worker: 2, subtotal: 0, non_worker_cost: 0, unknown: 1 })
  })
})

describe('sumTotalGross', () => {
  it('sums worker and non_worker_cost rows only, excluding subtotal and unknown', () => {
    const total = sumTotalGross([
      line({ rowKind: 'worker', totalGross: 1000 }),
      line({ rowKind: 'worker', totalGross: 2000 }),
      line({ rowKind: 'non_worker_cost', totalGross: 500 }),
      line({ rowKind: 'subtotal', totalGross: 3500 }), // would double-count if included
      line({ rowKind: 'unknown', totalGross: 999 }), // excluded until classified
    ])
    expect(total).toBe(3500)
  })

  it('treats a null total_gross as 0 rather than NaN', () => {
    expect(sumTotalGross([line({ rowKind: 'worker', totalGross: null })])).toBe(0)
  })
})

describe('crossCheckSheetTotal', () => {
  it('returns no warning when there is nothing to compare against', () => {
    expect(crossCheckSheetTotal(1000, null)).toBeNull()
  })

  it('returns no warning within tolerance', () => {
    expect(crossCheckSheetTotal(1000, 1000.5)).toBeNull()
  })

  it('warns when the computed total diverges from the Total tab figure', () => {
    const warning = crossCheckSheetTotal(1000, 5000)
    expect(warning).toMatch(/does not match/)
  })
})

describe('buildSheetWarnings', () => {
  it('warns and stops early when no header was found', () => {
    const warnings = buildSheetWarnings({
      sheetName: 'S1',
      headerFound: false,
      foundEndMarker: false,
      hitSafetyCap: false,
      unmappedHeaders: [],
      rowCountsByKind: { worker: 0, subtotal: 0, non_worker_cost: 0, unknown: 0 },
      totalCrossCheckWarning: null,
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/No header row found/)
  })

  it('distinguishes a missing end marker from hitting the safety cap', () => {
    const missing = buildSheetWarnings({
      sheetName: 'S1',
      headerFound: true,
      foundEndMarker: false,
      hitSafetyCap: false,
      unmappedHeaders: [],
      rowCountsByKind: { worker: 0, subtotal: 0, non_worker_cost: 0, unknown: 0 },
      totalCrossCheckWarning: null,
    })
    expect(missing[0]).toMatch(/no اجماليات row/)

    const capped = buildSheetWarnings({
      sheetName: 'S1',
      headerFound: true,
      foundEndMarker: false,
      hitSafetyCap: true,
      unmappedHeaders: [],
      rowCountsByKind: { worker: 0, subtotal: 0, non_worker_cost: 0, unknown: 0 },
      totalCrossCheckWarning: null,
    })
    expect(capped[0]).toMatch(/safety cap/)
  })

  it('reports unmapped headers and unknown-row counts', () => {
    const warnings = buildSheetWarnings({
      sheetName: 'S1',
      headerFound: true,
      foundEndMarker: true,
      hitSafetyCap: false,
      unmappedHeaders: ['عمود غريب'],
      rowCountsByKind: { worker: 5, subtotal: 1, non_worker_cost: 0, unknown: 2 },
      totalCrossCheckWarning: null,
    })
    expect(warnings.some((w) => w.includes('عمود غريب'))).toBe(true)
    expect(warnings.some((w) => w.includes('2 row(s)'))).toBe(true)
  })

  it('produces no warnings for a clean sheet', () => {
    const warnings = buildSheetWarnings({
      sheetName: 'S1',
      headerFound: true,
      foundEndMarker: true,
      hitSafetyCap: false,
      unmappedHeaders: [],
      rowCountsByKind: { worker: 5, subtotal: 1, non_worker_cost: 0, unknown: 0 },
      totalCrossCheckWarning: null,
    })
    expect(warnings).toEqual([])
  })
})

function makeWorksheet(rows: Array<Array<string | number | null>>): WorksheetLike {
  return {
    rowCount: rows.length,
    getRow(rowNumber: number) {
      const values = rows[rowNumber - 1] ?? []
      return {
        cellCount: values.length,
        getCell(colNumber: number) {
          return { value: values[colNumber - 1] ?? null }
        },
      }
    },
  }
}

describe('extractTotalsTabFigures', () => {
  it('extracts a name -> total map from a Total-tab-shaped sheet', () => {
    const ws = makeWorksheet([
      ['اسم الموقع', 'الاجمالى'],
      ['زهراء المعادي', 50000],
      ['H Office', 20000],
    ])
    const figures = extractTotalsTabFigures(ws)
    expect(figures.size).toBe(2)
    expect(figures.get('h office')).toBe(20000)
  })

  it('returns an empty map when no header row is found', () => {
    const ws = makeWorksheet([['no headers here']])
    expect(extractTotalsTabFigures(ws).size).toBe(0)
  })
})

describe('sumField', () => {
  it('sums the given field across worker/non_worker_cost rows only', () => {
    const total = sumField(
      [
        line({ rowKind: 'worker', advance: 1000 }),
        line({ rowKind: 'non_worker_cost', advance: 500 }),
        line({ rowKind: 'subtotal', advance: 9999 }), // excluded, would double-count
        line({ rowKind: 'unknown', advance: 9999 }), // excluded, unclassified
      ],
      'advance',
    )
    expect(total).toBe(1500)
  })

  it('treats a null value as 0', () => {
    expect(sumField([line({ rowKind: 'worker', advance: null })], 'advance')).toBe(0)
  })
})

describe('crossCheckAmount', () => {
  it('names the field in the warning message', () => {
    expect(crossCheckAmount('advance', 1000, 5000)).toMatch(/Computed advance/)
  })

  it('returns no warning within tolerance or with nothing to compare against', () => {
    expect(crossCheckAmount('advance', 1000, 1000.5)).toBeNull()
    expect(crossCheckAmount('advance', 1000, null)).toBeNull()
  })
})

describe('extractWorkbookGrandTotal', () => {
  // Confirmed real shape (both zone workbooks): the Total tab's own
  // grand-total row is labeled "الاجمالى" in its own name column — same
  // token as every per-site row's gross-total column header, just used as
  // a row label here instead.
  it('finds the row whose own label is اجمالي/الاجمالى and reads all four columns off it', () => {
    const ws = makeWorksheet([
      ['الموقع', 'اجمالى', 'تامينات', 'استقطاعات', 'سلف'],
      ['موقع أ', 50000, 1000, 0, 2000],
      ['موقع ب', 30000, 500, 0, 1000],
      ['الاجمالى', 80000, 1500, 0, 3000],
    ])
    const grandTotal = extractWorkbookGrandTotal(ws)
    expect(grandTotal).toEqual({ gross: 80000, insurance: 1500, deductions: 0, advance: 3000 })
  })

  it('returns null when there is no grand-total row at all', () => {
    const ws = makeWorksheet([
      ['الموقع', 'اجمالى'],
      ['موقع أ', 50000],
    ])
    expect(extractWorkbookGrandTotal(ws)).toBeNull()
  })

  it('returns null when no header row is found', () => {
    expect(extractWorkbookGrandTotal(makeWorksheet([['no headers here']]))).toBeNull()
  })
})
