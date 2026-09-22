import { coerceText } from './normalize-row'
import { normalizeArabic, normalizeForCompare } from './normalize-arabic'
import type { DetectedHeader, HeaderDetectionResult } from './types'

// Minimal structural shape this module needs from an exceljs Worksheet/Row.
// Kept narrow (rather than importing exceljs's own types) so these
// functions are trivial to unit test against plain object fixtures as well
// as real exceljs worksheets, which satisfy this shape structurally.
export interface RowLike {
  cellCount: number
  getCell(colNumber: number): { value: unknown }
}

export interface WorksheetLike {
  rowCount: number
  getRow(rowNumber: number): RowLike
}

const DEFAULT_MAX_SCAN_ROWS = 15

const NAME_FAMILY_TOKEN = normalizeForCompare('اسم')
const NUMBER_FAMILY_TOKEN = normalizeForCompare('رقم')

/**
 * Finds the header row by CONTENT, not position: the header row is
 * genuinely at a different row number in different sheets in the real
 * files, so this scans the first `maxScanRows` rows looking for one that
 * contains both an "الاسم"-family cell (name) and a "رقم"-family cell
 * (worker number) — the two columns present on every worker sheet
 * regardless of everything else that varies.
 *
 * Returns null (never throws) when no such row is found in range, so the
 * caller can report the sheet as unparsed rather than misreading some other
 * row as the header.
 */
export function detectHeaderRow(
  worksheet: WorksheetLike,
  maxScanRows: number = DEFAULT_MAX_SCAN_ROWS,
): HeaderDetectionResult | null {
  const lastRowToScan = Math.min(worksheet.rowCount, maxScanRows)

  for (let rowNumber = 1; rowNumber <= lastRowToScan; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const colCount = row.cellCount
    if (colCount <= 0) continue

    const headers: DetectedHeader[] = []
    let hasNameToken = false
    let hasNumberToken = false

    for (let col = 1; col <= colCount; col++) {
      const rawText = coerceText(row.getCell(col).value)
      if (!rawText) continue

      headers.push({ columnIndex: col, rawText })

      const normalized = normalizeForCompare(rawText)
      if (normalized.includes(NAME_FAMILY_TOKEN)) hasNameToken = true
      if (normalized.includes(NUMBER_FAMILY_TOKEN)) hasNumberToken = true
    }

    if (hasNameToken && hasNumberToken && headers.length > 0) {
      return { headerRowNumber: rowNumber, headers }
    }
  }

  return null
}

const SITE_LABEL_TOKEN = normalizeForCompare('الموقع')

/**
 * Extracts the workbook's own "الموقع / X" site-name cell from the title
 * block above the header row, if present. This is a HINT, not a reliable
 * unique identifier: confirmed by direct inspection of the real files, this
 * label is shared verbatim by several distinct sheets within one workbook
 * (e.g. seven different منطقة اكتوبر sheets all say 'الموقع / مول مصر' —
 * they're different tenants/cost-centers at the same mall). Callers must
 * combine this with the sheet's own tab name (which is always distinct) to
 * get a usable, non-colliding proposed site name — never use this alone.
 */
export function extractSiteNameHint(worksheet: WorksheetLike, headerRowNumber: number): string | null {
  const lastRowToScan = Math.max(0, Math.min(worksheet.rowCount, headerRowNumber - 1))

  for (let rowNumber = 1; rowNumber <= lastRowToScan; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const colCount = row.cellCount
    if (colCount <= 0) continue

    for (let col = 1; col <= colCount; col++) {
      const rawText = coerceText(row.getCell(col).value)
      if (!rawText) continue
      if (!normalizeForCompare(rawText).includes(SITE_LABEL_TOKEN)) continue

      // Cell is typically literally "الموقع / <name>" in one string; take
      // whatever follows the label and its separator. If there's no "/"
      // (format drift), fall back to the whole cell with the label word
      // itself stripped, rather than discarding a hint that's present but
      // not in the expected shape.
      const afterSlash = rawText.split('/')[1]
      const candidate = normalizeArabic(afterSlash ?? rawText.replace(/الموقع/g, ''))
      if (candidate) return candidate
    }
  }

  return null
}
