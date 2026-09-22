import { describe, expect, it } from 'vitest'
import { detectHeaderRow, type WorksheetLike } from './header-detection'

/** Builds a WorksheetLike fixture from an array of rows, each row an array
 * of cell values (1-indexed columns implied by array position). */
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

describe('detectHeaderRow', () => {
  it('finds the header row at row 1 when it is there', () => {
    const ws = makeWorksheet([
      ['رقم', 'الاسم', 'الاجمالى'],
      ['1', 'محمد', 1000],
    ])
    const result = detectHeaderRow(ws)
    expect(result?.headerRowNumber).toBe(1)
    expect(result?.headers).toHaveLength(3)
  })

  it('finds the header row when it is several rows down (title/blank rows above it)', () => {
    const ws = makeWorksheet([
      ['شركة بروفشنال ليدرز'],
      ['مرتبات شهر يوليو'],
      [null, null],
      ['رقم', 'الاسم', 'الاجمالى'],
      ['1', 'محمد', 1000],
    ])
    const result = detectHeaderRow(ws)
    expect(result?.headerRowNumber).toBe(4)
  })

  it('does not mistake a row with only a name-family or only a number-family token for the header', () => {
    const ws = makeWorksheet([
      ['اسم الشركة: بروفشنال ليدرز'], // "اسم" present, no "رقم"
      ['رقم الايصال: 55'], // "رقم" present, no "اسم"
      ['رقم', 'الاسم'],
      ['1', 'محمد'],
    ])
    const result = detectHeaderRow(ws)
    expect(result?.headerRowNumber).toBe(3)
  })

  it('returns null when no header row is found within the scan window', () => {
    const ws = makeWorksheet([['a'], ['b'], ['c']])
    expect(detectHeaderRow(ws, 3)).toBeNull()
  })

  it('only scans the first maxScanRows rows', () => {
    const rows: Array<Array<string | number | null>> = Array.from({ length: 20 }, () => [null])
    rows[16] = ['رقم', 'الاسم'] // row 17, beyond a 15-row scan window
    const ws = makeWorksheet(rows)
    expect(detectHeaderRow(ws, 15)).toBeNull()
    expect(detectHeaderRow(ws, 20)?.headerRowNumber).toBe(17)
  })
})
