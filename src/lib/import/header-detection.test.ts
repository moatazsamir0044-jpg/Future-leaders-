import { describe, expect, it } from 'vitest'
import { detectHeaderRow, extractSiteNameHint, type WorksheetLike } from './header-detection'

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

describe('extractSiteNameHint', () => {
  it('extracts the name after "الموقع /" in a title cell', () => {
    const ws = makeWorksheet([
      [null, null, null, null, null, null, null, null, 'شركة / بروفشنال ليدرز', null, null, null, null, null, null, 'الموقع / مول العرب'],
      ['رقم', 'الاسم'],
    ])
    expect(extractSiteNameHint(ws, 2)).toBe('مول العرب')
  })

  it('returns null when no الموقع cell exists above the header row', () => {
    const ws = makeWorksheet([['شركة بروفشنال ليدرز'], ['رقم', 'الاسم']])
    expect(extractSiteNameHint(ws, 2)).toBeNull()
  })

  it('does not scan rows at or below the header row', () => {
    const ws = makeWorksheet([['رقم', 'الاسم'], ['1', 'الموقع / لن يظهر هنا']])
    expect(extractSiteNameHint(ws, 1)).toBeNull()
  })

  it('falls back to the whole cell (label stripped) when there is no "/" separator', () => {
    const ws = makeWorksheet([['الموقع مول مصر'], ['رقم', 'الاسم']])
    expect(extractSiteNameHint(ws, 2)).toBe('مول مصر')
  })

  it('trims incidental whitespace around the extracted name', () => {
    const ws = makeWorksheet([['الموقع /  زد بارك  '], ['رقم', 'الاسم']])
    expect(extractSiteNameHint(ws, 2)).toBe('زد بارك')
  })
})
