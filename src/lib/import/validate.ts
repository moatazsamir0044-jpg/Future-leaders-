import { coerceNumber, coerceText } from './normalize-row'
import { normalizeForCompare } from './normalize-arabic'
import type { WorksheetLike } from './header-detection'
import type { DetectedHeader, ParsedPayrollLine, RowKind } from './types'

export function countRowsByKind(rows: ParsedPayrollLine[]): Record<RowKind, number> {
  const counts: Record<RowKind, number> = { worker: 0, subtotal: 0, non_worker_cost: 0, unknown: 0 }
  for (const row of rows) counts[row.rowKind] += 1
  return counts
}

/** Only 'worker' and 'non_worker_cost' rows are real money — 'subtotal'
 * rows are the sheet's own pre-aggregated lines (summing them too would
 * double-count) and 'unknown' rows are excluded from sums until someone
 * confirms what they are, though they remain fully visible in raw_row. */
export function sumTotalGross(rows: ParsedPayrollLine[]): number {
  return rows
    .filter((row) => row.rowKind === 'worker' || row.rowKind === 'non_worker_cost')
    .reduce((sum, row) => sum + (row.totalGross ?? 0), 0)
}

const TOTAL_TOLERANCE_RATIO = 0.01 // hand-maintained sheets — 1% tolerance, not exact-cent
const TOTAL_TOLERANCE_FLOOR = 1

/**
 * Cross-checks a sheet's own summed total_gross against the figure the
 * workbook's own `Total` tab reports for that site, when one could be
 * extracted (see extractTotalsTabFigures). This exists to catch
 * column-mapping bugs automatically — a header alias table that's silently
 * wrong for one file would otherwise produce a plausible-looking but wrong
 * total with nothing to flag it.
 */
export function crossCheckSheetTotal(computedTotal: number, expectedTotal: number | null): string | null {
  if (expectedTotal === null) return null
  const tolerance = Math.max(TOTAL_TOLERANCE_FLOOR, Math.abs(expectedTotal) * TOTAL_TOLERANCE_RATIO)
  if (Math.abs(computedTotal - expectedTotal) <= tolerance) return null
  return (
    `Computed total_gross (${computedTotal.toFixed(2)}) does not match the workbook's ` +
    `Total tab figure (${expectedTotal.toFixed(2)}) for this sheet.`
  )
}

export interface SheetWarningInput {
  sheetName: string
  headerFound: boolean
  foundEndMarker: boolean
  hitSafetyCap: boolean
  unmappedHeaders: string[]
  rowCountsByKind: Record<RowKind, number>
  totalCrossCheckWarning: string | null
}

/** Assembles the human-readable warning list for one sheet's parse report. */
export function buildSheetWarnings(input: SheetWarningInput): string[] {
  const warnings: string[] = []

  if (!input.headerFound) {
    warnings.push(`No header row found in the first rows scanned for sheet "${input.sheetName}".`)
    return warnings
  }

  if (!input.foundEndMarker) {
    warnings.push(
      input.hitSafetyCap
        ? `Sheet "${input.sheetName}" hit the safety cap before finding an اجماليات row — check for a malformed sheet.`
        : `Sheet "${input.sheetName}" has no اجماليات row; all rows to the end of the sheet were treated as data.`,
    )
  }

  if (input.unmappedHeaders.length > 0) {
    warnings.push(`Sheet "${input.sheetName}" has unmapped columns: ${input.unmappedHeaders.join(', ')}.`)
  }

  if (input.rowCountsByKind.unknown > 0) {
    warnings.push(
      `Sheet "${input.sheetName}" has ${input.rowCountsByKind.unknown} row(s) that could not be ` +
        `classified (row_kind = 'unknown') — still imported, not dropped.`,
    )
  }

  if (input.totalCrossCheckWarning) {
    warnings.push(input.totalCrossCheckWarning)
  }

  return warnings
}

// Both spellings ('اجمالي' with ya, 'اجمالى' with alef maqsura — two
// distinct Unicode characters normalizeForCompare does not unify) are
// checked explicitly; see the same note in row-classifier.ts.
const TOTAL_LABEL_TOKENS = ['اجمالي', 'اجمالى'].map(normalizeForCompare)
const NAME_FAMILY_TOKEN = normalizeForCompare('اسم')
const DEFAULT_MAX_SCAN_ROWS = 15

/**
 * A Total-tab header row only needs a name-family column (site name) — it
 * has no worker-number column, so it can't reuse header-detection.ts's
 * detectHeaderRow(), which specifically requires BOTH an الاسم-family and a
 * رقم-family token in the same row (correct for worker sheets, wrong here).
 */
function detectTotalsHeaderRow(
  worksheet: WorksheetLike,
  maxScanRows = DEFAULT_MAX_SCAN_ROWS,
): { headerRowNumber: number; headers: DetectedHeader[] } | null {
  const lastRow = Math.min(worksheet.rowCount, maxScanRows)

  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const colCount = row.cellCount
    if (colCount <= 0) continue

    const headers: DetectedHeader[] = []
    let hasNameToken = false

    for (let col = 1; col <= colCount; col++) {
      const rawText = coerceText(row.getCell(col).value)
      if (!rawText) continue
      headers.push({ columnIndex: col, rawText })
      if (normalizeForCompare(rawText).includes(NAME_FAMILY_TOKEN)) hasNameToken = true
    }

    if (hasNameToken && headers.length > 0) {
      return { headerRowNumber: rowNumber, headers }
    }
  }

  return null
}

/**
 * Best-effort extraction of per-site total figures from the workbook's own
 * `Total` rollup tab, keyed by normalized site-name text. This is a
 * heuristic pending validation against the real files: it looks for a
 * header row with a name-family column and a column whose header contains
 * "اجمالي", then reads (site name, total) off every following non-blank
 * row. If the real Total tab turns out to be laid out differently, this is
 * the function to revisit — crossCheckSheetTotal() degrades gracefully (no
 * warning) when this returns an empty map or a site isn't found in it.
 */
export function extractTotalsTabFigures(worksheet: WorksheetLike): Map<string, number> {
  const figures = new Map<string, number>()

  const detected = detectTotalsHeaderRow(worksheet)
  if (!detected) return figures

  const nameColumn = detected.headers.find((h) => normalizeForCompare(h.rawText).includes(NAME_FAMILY_TOKEN))
  const totalColumn = detected.headers.find((h) => {
    const normalized = normalizeForCompare(h.rawText)
    return TOTAL_LABEL_TOKENS.some((token) => normalized.includes(token))
  })
  if (!nameColumn || !totalColumn) return figures

  for (let rowNumber = detected.headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const nameText = coerceText(row.getCell(nameColumn.columnIndex).value)
    const totalValue = coerceNumber(row.getCell(totalColumn.columnIndex).value)
    if (!nameText || totalValue === null) continue
    figures.set(normalizeForCompare(nameText), totalValue)
  }

  return figures
}
