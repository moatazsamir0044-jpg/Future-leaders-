import { describe, expect, it } from 'vitest'
import { findSheetDataRange, isBlankRow, isTotalsRow } from './end-of-sheet'
import type { RowLike, WorksheetLike } from './end-of-sheet'

function makeWorksheet(rows: Array<Array<string | number | null>>): WorksheetLike {
  return {
    rowCount: rows.length,
    getRow(rowNumber: number): RowLike {
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

describe('isBlankRow / isTotalsRow', () => {
  it('treats an all-empty row as blank', () => {
    const ws = makeWorksheet([[null, '', '  ']])
    expect(isBlankRow(ws.getRow(1))).toBe(true)
  })

  it('treats a row with any non-empty cell as not blank', () => {
    const ws = makeWorksheet([[null, 'محمد', null]])
    expect(isBlankRow(ws.getRow(1))).toBe(false)
  })

  it('detects an اجماليات row by substring, even inside a longer label', () => {
    const ws = makeWorksheet([['اجماليات الموقع', null, 5000]])
    expect(isTotalsRow(ws.getRow(1))).toBe(true)
  })

  it('does not flag an ordinary row as a totals row', () => {
    const ws = makeWorksheet([['1', 'محمد', 5000]])
    expect(isTotalsRow(ws.getRow(1))).toBe(false)
  })
})

describe('findSheetDataRange', () => {
  it('collects data rows and stops at the اجماليات row', () => {
    const ws = makeWorksheet([
      ['رقم', 'الاسم'], // 1: header
      ['1', 'محمد'], // 2
      ['2', 'أحمد'], // 3
      ['اجماليات', null], // 4: end marker
      ['3', 'ينبغي ألا يظهر'], // 5: after the marker, must not be included
    ])
    const range = findSheetDataRange(ws, 1)
    expect(range.dataRowNumbers).toEqual([2, 3])
    expect(range.foundEndMarker).toBe(true)
    expect(range.totalsRowNumber).toBe(4)
    expect(range.hitSafetyCap).toBe(false)
  })

  it('tolerantly skips blank filler rows mid-list without ending the scan', () => {
    const ws = makeWorksheet([
      ['رقم', 'الاسم'], // 1: header
      ['1', 'محمد'], // 2
      [null, null], // 3: blank filler
      [null, null], // 4: blank filler
      ['2', 'أحمد'], // 5
      ['اجماليات', null], // 6
    ])
    const range = findSheetDataRange(ws, 1)
    expect(range.dataRowNumbers).toEqual([2, 5])
    expect(range.foundEndMarker).toBe(true)
  })

  it('reports no end marker found (not a safety-cap hit) when the sheet simply ends without one', () => {
    const ws = makeWorksheet([
      ['رقم', 'الاسم'], // 1: header
      ['1', 'محمد'], // 2
      ['2', 'أحمد'], // 3
      // sheet ends here — no اجماليات row at all
    ])
    const range = findSheetDataRange(ws, 1)
    expect(range.dataRowNumbers).toEqual([2, 3])
    expect(range.foundEndMarker).toBe(false)
    expect(range.hitSafetyCap).toBe(false)
  })

  it('stops at the safety cap on a malformed sheet with far more rows than any real one and no end marker', () => {
    const rows: Array<Array<string | number | null>> = [['رقم', 'الاسم']]
    for (let i = 0; i < 30; i++) rows.push([String(i), `عامل ${i}`])
    const ws = makeWorksheet(rows)

    const range = findSheetDataRange(ws, 1, { safetyCap: 10 })
    expect(range.dataRowNumbers).toHaveLength(10)
    expect(range.foundEndMarker).toBe(false)
    expect(range.hitSafetyCap).toBe(true)
  })
})
