import { coerceText } from './normalize-row'
import { normalizeForCompare } from './normalize-arabic'
import type { RowLike, WorksheetLike } from './header-detection'

export type { RowLike, WorksheetLike }

const DEFAULT_SAFETY_CAP = 2000

const TOTALS_MARKER = normalizeForCompare('اجماليات')

export interface SheetDataRange {
  /** Row numbers to classify as data, in sheet order. Blank rows already
   * excluded; the terminating اجماليات row (if found) already excluded. */
  dataRowNumbers: number[]
  /** True when an اجماليات row stopped the scan. */
  foundEndMarker: boolean
  totalsRowNumber: number | null
  /** True when the scan stopped only because it hit the safety cap, with
   * more unscanned rows remaining — a sign of a malformed sheet, not a
   * normal missing-end-marker case. */
  hitSafetyCap: boolean
}

/** True when every cell in the row (up to its own cellCount) is empty text. */
export function isBlankRow(row: RowLike): boolean {
  const colCount = row.cellCount
  for (let col = 1; col <= colCount; col++) {
    if (coerceText(row.getCell(col).value) !== '') return false
  }
  return true
}

/** True when any cell in the row contains the اجماليات marker (substring
 * match, since totals rows are often a merged/annotated cell like
 * "اجماليات الموقع" rather than the bare word). */
export function isTotalsRow(row: RowLike): boolean {
  const colCount = row.cellCount
  for (let col = 1; col <= colCount; col++) {
    const text = normalizeForCompare(coerceText(row.getCell(col).value))
    if (text.includes(TOTALS_MARKER)) return true
  }
  return false
}

/**
 * Walks rows after the header, skipping blanks tolerantly (a blank row is
 * never treated as the end of data — the real sheets have filler blank rows
 * mid-list), and stops at the first اجماليات row. If no such row shows up
 * before the safety cap (or before the sheet itself ends), the scan stops
 * anyway and reports so via `foundEndMarker`/`hitSafetyCap` rather than
 * running unbounded — the plan's confirmed case of a sheet missing its
 * اجماليات row entirely.
 */
export function findSheetDataRange(
  worksheet: WorksheetLike,
  headerRowNumber: number,
  opts: { safetyCap?: number } = {},
): SheetDataRange {
  const safetyCap = opts.safetyCap ?? DEFAULT_SAFETY_CAP
  const dataRowNumbers: number[] = []
  let foundEndMarker = false
  let hitSafetyCap = false
  let totalsRowNumber: number | null = null

  let scanned = 0
  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    if (scanned >= safetyCap) {
      hitSafetyCap = true
      break
    }
    scanned++

    const row = worksheet.getRow(rowNumber)
    if (isBlankRow(row)) continue

    if (isTotalsRow(row)) {
      foundEndMarker = true
      totalsRowNumber = rowNumber
      break
    }

    dataRowNumbers.push(rowNumber)
  }

  return { dataRowNumbers, foundEndMarker, totalsRowNumber, hitSafetyCap }
}
