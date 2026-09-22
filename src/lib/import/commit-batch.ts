// Commits a parsed, review-confirmed workbook import: creates a
// `processing` pv_import_batches row, bulk-inserts its pv_payroll_lines,
// then calls pv_activate_import_batch (20260922000001) to atomically
// supersede whatever was active for the same scope+period and activate this
// one. Only the last step needs to be a single transaction — the batch
// row's status starts at 'processing' specifically so a dropped connection
// during the (potentially large) line insert never leaves two batches
// racing to be active; it just leaves an inert 'processing' batch that a
// retry or cleanup can deal with later.
//
// Like sheet-site-matching.ts, the actual database calls are behind a small
// interface (CommitBatchClient) so the commit logic here — one batch row,
// N line rows split across sheets, then activate — is unit-testable without
// a live database. createSupabaseCommitBatchClient() is the real adapter.

import type { ParsedPayrollLine, RowKind } from './types'

export type ImportScope = { zoneId: string; siteId?: undefined } | { siteId: string; zoneId?: undefined }

export interface CommitBatchSheetInput {
  sheetName: string
  /** Resolved by the (future) import review UI via sheet-site-matching.ts —
   * either an existing site's id or a newly created one's id. Always a
   * concrete id by the time commit-batch runs; "propose vs. confirm" is the
   * review UI's job, not this module's. */
  siteId: string
  rows: ParsedPayrollLine[]
}

export interface CommitBatchInput {
  scope: ImportScope
  periodYear: number
  periodMonth: number
  sourceFilename: string
  uploadedBy: string | null
  /** Per-sheet parse report (row counts, unmapped headers, etc.) — stored
   * as-is on pv_import_batches.sheet_report for later inspection. */
  sheetReport: unknown
  warnings: unknown
  sheets: CommitBatchSheetInput[]
}

export interface NewBatchRow {
  zone_id: string | null
  scope_site_id: string | null
  period_year: number
  period_month: number
  source_filename: string
  uploaded_by: string | null
  status: 'processing'
  sheet_report: unknown
  warnings: unknown
}

export interface NewPayrollLineRow {
  batch_id: string
  site_id: string
  period_year: number
  period_month: number
  sheet_name: string
  source_row_number: number
  row_kind: RowKind
  worker_number: string | null
  worker_name: string | null
  attendance_days: number | null
  absence_days: number | null
  net_days: number | null
  monthly_leave_days: number | null
  annual_leave_days: number | null
  absence_no_permission_days: number | null
  overtime_hours: number | null
  less_hours: number | null
  leave_label_raw: string | null
  base_monthly_salary: number | null
  daily_wage: number | null
  bonuses: number | null
  transportation_amount: number | null
  transportation_category: string | null
  advance: number | null
  deductions: number | null
  insurance: number | null
  total_gross: number | null
  net_salary: number | null
  signature_notes: string | null
  raw_row: Record<string, unknown>
}

export interface CommitBatchClient {
  insertBatch(row: NewBatchRow): Promise<{ id: string }>
  insertPayrollLines(rows: NewPayrollLineRow[]): Promise<void>
  activateBatch(batchId: string): Promise<void>
}

export function toPayrollLineRow(
  batchId: string,
  siteId: string,
  periodYear: number,
  periodMonth: number,
  line: ParsedPayrollLine,
): NewPayrollLineRow {
  return {
    batch_id: batchId,
    site_id: siteId,
    period_year: periodYear,
    period_month: periodMonth,
    sheet_name: line.sheetName,
    source_row_number: line.sourceRowNumber,
    row_kind: line.rowKind,
    worker_number: line.workerNumber,
    worker_name: line.workerName,
    attendance_days: line.attendanceDays,
    absence_days: line.absenceDays,
    net_days: line.netDays,
    monthly_leave_days: line.monthlyLeaveDays,
    annual_leave_days: line.annualLeaveDays,
    absence_no_permission_days: line.absenceNoPermissionDays,
    overtime_hours: line.overtimeHours,
    less_hours: line.lessHours,
    leave_label_raw: line.leaveLabelRaw,
    base_monthly_salary: line.baseMonthlySalary,
    daily_wage: line.dailyWage,
    bonuses: line.bonuses,
    transportation_amount: line.transportationAmount,
    transportation_category: line.transportationCategory,
    advance: line.advance,
    deductions: line.deductions,
    insurance: line.insurance,
    total_gross: line.totalGross,
    net_salary: line.netSalary,
    signature_notes: line.signatureNotes,
    raw_row: line.rawRow,
  }
}

/** Commits a parsed workbook: one batch row, its lines, then activate.
 * Returns the new batch's id. Throws on any failure — callers should leave
 * a failed batch as 'processing' (or move it to 'failed') rather than
 * silently losing the error. */
export async function commitImportBatch(
  client: CommitBatchClient,
  input: CommitBatchInput,
): Promise<{ batchId: string }> {
  const batch = await client.insertBatch({
    zone_id: input.scope.zoneId ?? null,
    scope_site_id: input.scope.siteId ?? null,
    period_year: input.periodYear,
    period_month: input.periodMonth,
    source_filename: input.sourceFilename,
    uploaded_by: input.uploadedBy,
    status: 'processing',
    sheet_report: input.sheetReport,
    warnings: input.warnings,
  })

  const lineRows: NewPayrollLineRow[] = []
  for (const sheet of input.sheets) {
    for (const row of sheet.rows) {
      lineRows.push(toPayrollLineRow(batch.id, sheet.siteId, input.periodYear, input.periodMonth, row))
    }
  }

  if (lineRows.length > 0) {
    await client.insertPayrollLines(lineRows)
  }

  await client.activateBatch(batch.id)

  return { batchId: batch.id }
}

/**
 * Commits a batch that was already persisted as a `processing` row (created
 * up front by the parse step — see `POST /api/imports/parse` — so a dropped
 * connection between parsing and review never loses the per-sheet report).
 * Inserts the confirmed, site-resolved rows and activates the existing
 * batch, without creating a second batch row. Used by the review UI's
 * "confirm & activate" step (`POST /api/imports/confirm`).
 */
export async function activateExistingBatch(
  client: CommitBatchClient,
  batchId: string,
  periodYear: number,
  periodMonth: number,
  sheets: CommitBatchSheetInput[],
): Promise<{ batchId: string }> {
  const lineRows: NewPayrollLineRow[] = []
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      lineRows.push(toPayrollLineRow(batchId, sheet.siteId, periodYear, periodMonth, row))
    }
  }

  if (lineRows.length > 0) {
    await client.insertPayrollLines(lineRows)
  }

  await client.activateBatch(batchId)

  return { batchId }
}

// Narrow structural shape of the supabase-js client methods this adapter
// uses (see sheet-site-matching.ts for the same pattern/rationale).
export interface SupabaseLike {
  from(table: string): {
    insert(rows: unknown): {
      select(columns: string): {
        single(): PromiseLike<{ data: { id: string } | null; error: unknown }>
      }
    } & PromiseLike<{ error: unknown }>
  }
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }>
}

const PAYROLL_LINE_INSERT_CHUNK_SIZE = 500

/** Real adapter backed by Supabase. Payroll-line inserts are chunked
 * defensively — the real files run to a few thousand rows at most, but
 * there's no reason to risk a single oversized insert. */
export function createSupabaseCommitBatchClient(supabase: SupabaseLike): CommitBatchClient {
  return {
    async insertBatch(row) {
      const { data, error } = await supabase.from('pv_import_batches').insert(row).select('id').single()
      if (error || !data) {
        throw new Error(`Could not create import batch: ${JSON.stringify(error)}`)
      }
      return { id: data.id }
    },

    async insertPayrollLines(rows) {
      for (let i = 0; i < rows.length; i += PAYROLL_LINE_INSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + PAYROLL_LINE_INSERT_CHUNK_SIZE)
        const { error } = await supabase.from('pv_payroll_lines').insert(chunk)
        if (error) {
          throw new Error(`Could not insert payroll lines: ${JSON.stringify(error)}`)
        }
      }
    },

    async activateBatch(batchId) {
      const { error } = await supabase.rpc('pv_activate_import_batch', { p_batch_id: batchId })
      if (error) {
        throw new Error(`Could not activate import batch ${batchId}: ${JSON.stringify(error)}`)
      }
    },
  }
}
