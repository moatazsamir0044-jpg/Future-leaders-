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
 * Cross-checks a computed sum against an expected figure from the
 * workbook's own `Total` tab, when one could be extracted. `label` names
 * the field in the resulting message (e.g. "total_gross", "advance").
 * Generic — used both by the per-sheet gross check and the workbook-wide
 * check (see extractWorkbookGrandTotal).
 */
export function crossCheckAmount(label: string, computedTotal: number, expectedTotal: number | null): string | null {
  if (expectedTotal === null) return null
  const tolerance = Math.max(TOTAL_TOLERANCE_FLOOR, Math.abs(expectedTotal) * TOTAL_TOLERANCE_RATIO)
  if (Math.abs(computedTotal - expectedTotal) <= tolerance) return null
  return (
    `Computed ${label} (${computedTotal.toFixed(2)}) does not match the workbook's ` +
    `Total tab figure (${expectedTotal.toFixed(2)}).`
  )
}

/**
 * Per-sheet gross cross-check. Note this degrades to "no warning" far more
 * often than it looks like it should: it matches by exact normalized sheet
 * tab name against the Total tab's own site-name column, and on both real
 * workbooks those never actually agree (e.g. sheet tab "CFCM HK" vs. the
 * Total tab's own "مول كايرو فيستيفال نظافه") — confirmed by direct
 * inspection, zero overlap on either zone file. This function has
 * therefore never actually fired a warning on the real files; it's kept
 * because it's harmless (silently skips rather than misfiring) and might
 * still match on a differently-formatted future file, but the reliable
 * check is extractWorkbookGrandTotal below, which sidesteps per-site name
 * matching entirely by comparing the workbook's own single grand-total row
 * against sums across every sheet.
 */
export function crossCheckSheetTotal(computedTotal: number, expectedTotal: number | null): string | null {
  if (expectedTotal === null) return null
  return crossCheckAmount('total_gross', computedTotal, expectedTotal)
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
// Real bug, found and fixed from direct inspection of both real Total
// tabs: this originally only recognized 'اسم' (a person's name — correct
// for a worker sheet's own header), but a Total tab's site-identifier
// column is actually labeled 'الموقع' (site/location) on both real
// workbooks, never 'اسم'. That meant detectTotalsHeaderRow — and by
// extension extractTotalsTabFigures and extractWorkbookGrandTotal — never
// actually found a header row on either real file; both silently
// degraded to "nothing to compare against, no warning" the entire time.
const NAME_FAMILY_TOKENS = ['اسم', 'الموقع'].map(normalizeForCompare)
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
      if (NAME_FAMILY_TOKENS.some((token) => normalizeForCompare(rawText).includes(token))) hasNameToken = true
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

  const nameColumn = detected.headers.find((h) => NAME_FAMILY_TOKENS.some((token) => normalizeForCompare(h.rawText).includes(token)))
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

const INSURANCE_LABEL_TOKENS = ['تامينات', 'تأمينات'].map(normalizeForCompare)
const DEDUCTIONS_LABEL_TOKENS = ['استقطاعات'].map(normalizeForCompare)
const ADVANCE_LABEL_TOKENS = ['سلف'].map(normalizeForCompare)

export interface WorkbookGrandTotal {
  gross: number | null
  insurance: number | null
  deductions: number | null
  advance: number | null
}

function findColumnByTokens(headers: DetectedHeader[], tokens: string[]): DetectedHeader | undefined {
  return headers.find((h) => {
    const normalized = normalizeForCompare(h.rawText)
    return tokens.some((token) => normalized.includes(token))
  })
}

/**
 * Extracts the workbook's own single grand-total row from the `Total` tab
 * — the row whose own name-column text is itself "اجمالي"/"الاجمالى"
 * (confirmed present, labeled exactly this way, on both real zone
 * workbooks). Unlike extractTotalsTabFigures' per-site lookup, this needs
 * no name matching between a sheet and a Total-tab row (confirmed
 * unreliable — see crossCheckSheetTotal's comment): there is exactly one
 * grand-total row per workbook, so it's found once and compared against a
 * sum across every sheet in the workbook, not sheet by sheet.
 *
 * This is what would have caught the real case that prompted it: a
 * التجمع zone import where per-site summed worker advances (98,268) ran
 * roughly double the workbook's own reported advance total (47,390) —
 * every site's real number equal to or higher than reported, never lower.
 */
export function extractWorkbookGrandTotal(worksheet: WorksheetLike): WorkbookGrandTotal | null {
  const detected = detectTotalsHeaderRow(worksheet)
  if (!detected) return null

  const nameColumn = detected.headers.find((h) => NAME_FAMILY_TOKENS.some((token) => normalizeForCompare(h.rawText).includes(token)))
  if (!nameColumn) return null

  const grossColumn = findColumnByTokens(detected.headers, TOTAL_LABEL_TOKENS)
  const insuranceColumn = findColumnByTokens(detected.headers, INSURANCE_LABEL_TOKENS)
  const deductionsColumn = findColumnByTokens(detected.headers, DEDUCTIONS_LABEL_TOKENS)
  const advanceColumn = findColumnByTokens(detected.headers, ADVANCE_LABEL_TOKENS)
  if (!grossColumn && !insuranceColumn && !deductionsColumn && !advanceColumn) return null

  for (let rowNumber = detected.headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const nameText = normalizeForCompare(coerceText(row.getCell(nameColumn.columnIndex).value))
    if (!nameText) continue
    if (!TOTAL_LABEL_TOKENS.some((token) => nameText.includes(token))) continue

    // Found the grand-total row (its own label says "اجمالي"/"الاجمالى").
    return {
      gross: grossColumn ? coerceNumber(row.getCell(grossColumn.columnIndex).value) : null,
      insurance: insuranceColumn ? coerceNumber(row.getCell(insuranceColumn.columnIndex).value) : null,
      deductions: deductionsColumn ? coerceNumber(row.getCell(deductionsColumn.columnIndex).value) : null,
      advance: advanceColumn ? coerceNumber(row.getCell(advanceColumn.columnIndex).value) : null,
    }
  }

  return null
}

/**
 * Sums one numeric field across 'worker'/'non_worker_cost' rows only —
 * same rule as sumTotalGross (subtotal rows would double-count, unknown
 * rows are excluded until classified). Used to build the computed side of
 * the workbook-wide cross-check for insurance/deductions/advance.
 */
export function sumField(
  rows: ParsedPayrollLine[],
  field: 'totalGross' | 'insurance' | 'deductions' | 'advance',
): number {
  return rows
    .filter((row) => row.rowKind === 'worker' || row.rowKind === 'non_worker_cost')
    .reduce((sum, row) => sum + (row[field] ?? 0), 0)
}
