import ExcelJS from 'exceljs'
import { detectHeaderRow, extractSiteNameHint, type WorksheetLike } from './header-detection'
import { buildColumnMapping } from './column-mapping'
import { findSheetDataRange } from './end-of-sheet'
import { classifyRow } from './row-classifier'
import { coerceNumber, coerceText, toRawJsonValue } from './normalize-row'
import { normalizeForCompare } from './normalize-arabic'
import {
  buildSheetWarnings,
  countRowsByKind,
  crossCheckSheetTotal,
  extractTotalsTabFigures,
  sumTotalGross,
} from './validate'
import type {
  CanonicalField,
  ColumnMapping,
  DetectedHeader,
  ParsedPayrollLine,
  ParseWorkbookResult,
  RowKind,
  SheetParseResult,
  SheetParseWarning,
} from './types'

const EMPTY_ROW_COUNTS: Record<RowKind, number> = { worker: 0, subtotal: 0, non_worker_cost: 0, unknown: 0 }

const TEXT_FIELDS = new Set<CanonicalField>([
  'worker_number',
  'worker_name',
  'transportation_category',
  'signature_notes',
])

/** The workbook's own `Total` rollup tab. */
function isTotalTabName(name: string): boolean {
  return normalizeForCompare(name) === normalizeForCompare('Total')
}

/** The workbook's own `مقارنه` (month-over-month comparison) tab. Neither
 * this nor the Total tab holds per-worker rows, so both are dropped before
 * classification — see the plan's §4. */
function isComparisonTabName(name: string): boolean {
  const normalized = normalizeForCompare(name)
  return normalized.includes(normalizeForCompare('مقارنه')) || normalized.includes(normalizeForCompare('مقارنة'))
}

/**
 * Parses an uploaded workbook buffer into per-sheet payroll data, one
 * SheetParseResult per site tab (Total/مقارنه tabs are set aside, not
 * classified as site data).
 *
 * Requires the Node runtime — exceljs's xlsx reader is not Edge-compatible
 * — so any route handler or server action calling this must declare
 * `export const runtime = 'nodejs'`.
 */
export async function parseWorkbook(buffer: Buffer | ArrayBuffer): Promise<ParseWorkbookResult> {
  const workbook = new ExcelJS.Workbook()
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  // exceljs's own .d.ts declares a module-local `Buffer extends ArrayBuffer` type
  // distinct from @types/node's global `Buffer`, and (with our lib's ES2024
  // ArrayBuffer additions) requires members Node's Buffer doesn't type as having.
  // A real Buffer is fine at runtime; `as any` is the standard workaround for this
  // known exceljs/typings conflict (no cast to the real `Buffer` type can satisfy
  // exceljs's own private shim of the same name).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(nodeBuffer as any)

  const excludedSheetNames: string[] = []
  const siteWorksheets: ExcelJS.Worksheet[] = []
  let totalsWorksheet: ExcelJS.Worksheet | null = null

  for (const worksheet of workbook.worksheets) {
    if (isTotalTabName(worksheet.name)) {
      totalsWorksheet = worksheet
      excludedSheetNames.push(worksheet.name)
      continue
    }
    if (isComparisonTabName(worksheet.name)) {
      excludedSheetNames.push(worksheet.name)
      continue
    }
    siteWorksheets.push(worksheet)
  }

  const totalsFigures = totalsWorksheet ? extractTotalsTabFigures(totalsWorksheet) : new Map<string, number>()

  const sheets: SheetParseResult[] = []
  const warnings: SheetParseWarning[] = []

  for (const worksheet of siteWorksheets) {
    const result = parseSheet(worksheet, worksheet.name, totalsFigures)
    sheets.push(result)
    for (const message of result.warnings) {
      warnings.push({ sheetName: worksheet.name, message })
    }
  }

  return { sheets, excludedSheetNames, warnings }
}

function emptySheetResult(sheetName: string, warnings: string[]): SheetParseResult {
  return {
    sheetName,
    headerFound: false,
    headerRowNumber: null,
    siteNameHint: null,
    rows: [],
    unmappedHeaders: [],
    rowCountsByKind: { ...EMPTY_ROW_COUNTS },
    foundEndMarker: false,
    hitSafetyCap: false,
    warnings,
  }
}

function parseSheet(worksheet: WorksheetLike, sheetName: string, totalsFigures: Map<string, number>): SheetParseResult {
  const detected = detectHeaderRow(worksheet)

  if (!detected) {
    const warnings = buildSheetWarnings({
      sheetName,
      headerFound: false,
      foundEndMarker: false,
      hitSafetyCap: false,
      unmappedHeaders: [],
      rowCountsByKind: { ...EMPTY_ROW_COUNTS },
      totalCrossCheckWarning: null,
    })
    return emptySheetResult(sheetName, warnings)
  }

  const mapping = buildColumnMapping(detected.headers)
  const range = findSheetDataRange(worksheet, detected.headerRowNumber)
  const siteNameHint = extractSiteNameHint(worksheet, detected.headerRowNumber)

  const rows = range.dataRowNumbers.map((rowNumber) =>
    parseDataRow(worksheet, rowNumber, sheetName, detected.headers, mapping),
  )

  const rowCountsByKind = countRowsByKind(rows)
  const computedTotal = sumTotalGross(rows)
  const expectedTotal = totalsFigures.get(normalizeForCompare(sheetName)) ?? null
  const totalCrossCheckWarning = crossCheckSheetTotal(computedTotal, expectedTotal)
  const unmappedHeaderTexts = mapping.unmappedHeaders.map((h) => h.rawText)

  const warnings = buildSheetWarnings({
    sheetName,
    headerFound: true,
    foundEndMarker: range.foundEndMarker,
    hitSafetyCap: range.hitSafetyCap,
    unmappedHeaders: unmappedHeaderTexts,
    rowCountsByKind,
    totalCrossCheckWarning,
  })

  return {
    sheetName,
    headerFound: true,
    headerRowNumber: detected.headerRowNumber,
    siteNameHint,
    rows,
    unmappedHeaders: unmappedHeaderTexts,
    rowCountsByKind,
    foundEndMarker: range.foundEndMarker,
    hitSafetyCap: range.hitSafetyCap,
    warnings,
  }
}

function parseDataRow(
  worksheet: WorksheetLike,
  rowNumber: number,
  sheetName: string,
  headers: DetectedHeader[],
  mapping: ColumnMapping,
): ParsedPayrollLine {
  const row = worksheet.getRow(rowNumber)

  // Every original cell, mapped or not, keyed by its literal header text —
  // the "nothing is ever silently lost" guarantee.
  const rawRow: Record<string, unknown> = {}
  for (const header of headers) {
    rawRow[header.rawText] = toRawJsonValue(row.getCell(header.columnIndex).value)
  }

  const line: ParsedPayrollLine = {
    sheetName,
    sourceRowNumber: rowNumber,
    rowKind: 'unknown',
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
    leaveLabelRaw: mapping.annualLeaveHeaderText,
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
    rawRow,
  }

  for (const [columnIndex, field] of mapping.fieldsByColumn) {
    assignField(line, field, row.getCell(columnIndex).value)
  }

  const otherRowTexts = headers
    .filter((h) => mapping.fieldsByColumn.get(h.columnIndex) !== 'worker_number')
    .map((h) => coerceText(row.getCell(h.columnIndex).value))

  line.rowKind = classifyRow({
    workerNumber: line.workerNumber,
    workerName: line.workerName,
    otherRowTexts,
  })

  if (line.rowKind === 'subtotal') {
    clearMappedFieldsForFreeformRow(line)
  }

  return line
}

/**
 * Confirmed by direct inspection of the real files: a subtotal row (e.g. a
 * "supervision & admin staff" running total, or a group subtotal by
 * worker's home governorate) does not follow the worker-row column grid at
 * all — it's a label/value pair the accountant free-typed wherever there
 * was room, not aligned to the sheet's own header columns. Reading it
 * through the normal per-column field mapping (correct for every other row
 * kind) lands arbitrary fragments of that freeform content into fields
 * that assert a specific meaning — e.g. a stray number ending up under
 * `overtimeHours` when it is actually that row's own subtotal amount,
 * mislabeled. There is no reliable column to recover the real amount from
 * (which one varies sheet to sheet), so rather than show a number that
 * looks precise but means something else, every mapped field is cleared
 * except the row's own label (kept as workerName) and identifying
 * metadata. raw_row is untouched — the true content of every cell in this
 * row stays fully inspectable there, just not asserted as structured data.
 */
function clearMappedFieldsForFreeformRow(line: ParsedPayrollLine): void {
  line.workerNumber = null
  line.attendanceDays = null
  line.absenceDays = null
  line.netDays = null
  line.monthlyLeaveDays = null
  line.annualLeaveDays = null
  line.absenceNoPermissionDays = null
  line.overtimeHours = null
  line.lessHours = null
  line.baseMonthlySalary = null
  line.dailyWage = null
  line.bonuses = null
  line.transportationAmount = null
  line.transportationCategory = null
  line.advance = null
  line.deductions = null
  line.insurance = null
  line.totalGross = null
  line.netSalary = null
  line.signatureNotes = null
}

function assignField(line: ParsedPayrollLine, field: CanonicalField, cellValue: unknown): void {
  if (TEXT_FIELDS.has(field)) {
    const text = coerceText(cellValue)
    const value = text === '' ? null : text
    switch (field) {
      case 'worker_number':
        line.workerNumber = value
        return
      case 'worker_name':
        line.workerName = value
        return
      case 'transportation_category':
        line.transportationCategory = value
        return
      case 'signature_notes':
        line.signatureNotes = value
        return
      default:
        return
    }
  }

  const num = coerceNumber(cellValue)
  switch (field) {
    case 'attendance_days':
      line.attendanceDays = num
      return
    case 'absence_days':
      line.absenceDays = num
      return
    case 'net_days':
      line.netDays = num
      return
    case 'monthly_leave_days':
      line.monthlyLeaveDays = num
      return
    case 'annual_leave_days':
      line.annualLeaveDays = num
      return
    case 'absence_no_permission_days':
      line.absenceNoPermissionDays = num
      return
    case 'overtime_hours':
      line.overtimeHours = num
      return
    case 'less_hours':
      line.lessHours = num
      return
    case 'base_monthly_salary':
      line.baseMonthlySalary = num
      return
    case 'daily_wage':
      line.dailyWage = num
      return
    case 'bonuses':
      line.bonuses = num
      return
    case 'transportation_amount':
      line.transportationAmount = num
      return
    case 'advance':
      line.advance = num
      return
    case 'deductions':
      line.deductions = num
      return
    case 'insurance':
      line.insurance = num
      return
    case 'total_gross':
      line.totalGross = num
      return
    case 'net_salary':
      line.netSalary = num
      return
    default:
      return
  }
}
