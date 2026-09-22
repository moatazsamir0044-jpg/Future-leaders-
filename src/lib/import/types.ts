// Shared types for the Excel import parser (src/lib/import/*).
//
// Field names here match the `pv_payroll_lines` columns in
// supabase/migrations/20260922000000_pv_baseline_schema.sql — see that file
// for the authoritative schema and column comments.

/** The canonical, normalized fields a source column header can map to. */
export type CanonicalField =
  | 'worker_number'
  | 'worker_name'
  | 'attendance_days'
  | 'absence_days'
  | 'net_days'
  | 'monthly_leave_days'
  | 'annual_leave_days'
  | 'absence_no_permission_days'
  | 'overtime_hours'
  | 'less_hours'
  | 'base_monthly_salary'
  | 'daily_wage'
  | 'bonuses'
  | 'transportation_amount'
  | 'transportation_category'
  | 'advance'
  | 'deductions'
  | 'insurance'
  | 'total_gross'
  | 'net_salary'
  | 'signature_notes'

/** Fields that hold a numeric value once normalized (everything except the
 * two text fields and the worker identity fields, which are handled on
 * their own path). */
export type NumericCanonicalField = Exclude<
  CanonicalField,
  'worker_number' | 'worker_name' | 'transportation_category' | 'signature_notes'
>

export type RowKind = 'worker' | 'subtotal' | 'non_worker_cost' | 'unknown'

/** One column header as found in the sheet: its literal text and 1-based
 * column index. Column order varies between files (the Futtaim file, for
 * instance, orders its columns differently from the zone workbooks) — every
 * lookup in this module is by header text, never by a fixed column index. */
export interface DetectedHeader {
  columnIndex: number
  rawText: string
}

export interface HeaderDetectionResult {
  headerRowNumber: number
  headers: DetectedHeader[]
}

/** Column-index -> canonical field, plus whatever headers in the row could
 * not be matched to any known field. Unmapped headers are never dropped —
 * their raw values still make it into `raw_row` on every parsed line. */
export interface ColumnMapping {
  fieldsByColumn: Map<number, CanonicalField>
  unmappedHeaders: DetectedHeader[]
  /** Raw header text of whichever column mapped to `annual_leave_days`, if
   * any — this is the sheet's own spelling of the drifted leave label
   * (اجازه سنوي / اجازت اعياد / اجازت سنوى / ...), stamped onto every row
   * as `leaveLabelRaw` since the label is a per-sheet property, not a
   * per-row one. */
  annualLeaveHeaderText: string | null
}

/** One fully parsed sheet row. Every field below (other than the identity
 * and text fields) is a tolerantly-coerced number or null; `raw_row` always
 * holds the complete original row keyed by literal header text, regardless
 * of whether a given column was mapped. */
export interface ParsedPayrollLine {
  sheetName: string
  sourceRowNumber: number
  rowKind: RowKind
  workerNumber: string | null
  workerName: string | null
  attendanceDays: number | null
  absenceDays: number | null
  netDays: number | null
  monthlyLeaveDays: number | null
  annualLeaveDays: number | null
  absenceNoPermissionDays: number | null
  overtimeHours: number | null
  lessHours: number | null
  leaveLabelRaw: string | null
  baseMonthlySalary: number | null
  dailyWage: number | null
  bonuses: number | null
  transportationAmount: number | null
  transportationCategory: string | null
  advance: number | null
  deductions: number | null
  insurance: number | null
  totalGross: number | null
  netSalary: number | null
  signatureNotes: string | null
  rawRow: Record<string, unknown>
}

export interface SheetParseWarning {
  sheetName: string
  message: string
}

export interface SheetParseResult {
  sheetName: string
  /** False when no header row could be found in the first N rows scanned —
   * the sheet is still reported, never silently skipped, so the review UI
   * can surface it. */
  headerFound: boolean
  headerRowNumber: number | null
  /** The workbook's own "الموقع / X" label, if found above the header row.
   * Not unique on its own (several sheets can share it — see
   * header-detection.ts) — combine with sheetName for a proposed site name
   * that's both human-readable and guaranteed not to collide. */
  siteNameHint: string | null
  rows: ParsedPayrollLine[]
  unmappedHeaders: string[]
  rowCountsByKind: Record<RowKind, number>
  /** True when parsing stopped at an اجماليات row; false when it ran to the
   * safety cap instead (a sheet missing its end-of-sheet marker). */
  foundEndMarker: boolean
  hitSafetyCap: boolean
  warnings: string[]
}

export interface ParseWorkbookResult {
  sheets: SheetParseResult[]
  /** Sheet names dropped before classification (Total / مقارنه tabs). */
  excludedSheetNames: string[]
  warnings: SheetParseWarning[]
}
