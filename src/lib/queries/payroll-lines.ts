// Typed, server-side search/filter query for pv_payroll_lines (plan §6).
// Always scoped to active batches — a payroll line's own row carries no
// status, so "active" is enforced via an inner join to pv_import_batches.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RowKind } from '@/lib/import/types'

export interface PayrollLineRow {
  id: string
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
  created_at: string
  pv_sites: { id: string; name_ar: string; name_en: string | null; zone_id: string | null } | null
}

export interface PayrollLinesFilter {
  /** A zone id, `'standalone'` for sites with no zone, or omitted/undefined
   * for "all zones". */
  zoneId?: string
  siteId?: string | null
  workerName?: string
  periodYear?: number
  periodMonth?: number
  rowKind?: RowKind
  page: number
  pageSize: number
}

export interface PayrollLinesPage {
  rows: PayrollLineRow[]
  total: number
  page: number
  pageSize: number
}

const SELECT_COLUMNS = `
  id, batch_id, site_id, period_year, period_month, sheet_name, source_row_number,
  row_kind, worker_number, worker_name, attendance_days, absence_days, net_days,
  monthly_leave_days, annual_leave_days, absence_no_permission_days, overtime_hours,
  less_hours, leave_label_raw, base_monthly_salary, daily_wage, bonuses,
  transportation_amount, transportation_category, advance, deductions, insurance,
  total_gross, net_salary, signature_notes, raw_row, created_at,
  pv_sites!inner(id, name_ar, name_en, zone_id),
  pv_import_batches!inner(status)
`

export async function searchPayrollLines(
  supabase: SupabaseClient,
  filter: PayrollLinesFilter,
): Promise<PayrollLinesPage> {
  const { page, pageSize } = filter
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('pv_payroll_lines')
    .select(SELECT_COLUMNS, { count: 'exact' })
    .eq('pv_import_batches.status', 'active')

  if (filter.siteId) {
    query = query.eq('site_id', filter.siteId)
  } else if (filter.zoneId === 'standalone') {
    query = query.is('pv_sites.zone_id', null)
  } else if (filter.zoneId) {
    query = query.eq('pv_sites.zone_id', filter.zoneId)
  }
  if (filter.workerName && filter.workerName.trim() !== '') {
    query = query.ilike('worker_name', `%${filter.workerName.trim()}%`)
  }
  if (filter.periodYear) {
    query = query.eq('period_year', filter.periodYear)
  }
  if (filter.periodMonth) {
    query = query.eq('period_month', filter.periodMonth)
  }
  if (filter.rowKind) {
    query = query.eq('row_kind', filter.rowKind)
  }

  const { data, error, count } = await query
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('worker_name', { ascending: true })
    .range(from, to)

  if (error) {
    throw new Error(`Could not search payroll lines: ${error.message}`)
  }

  return {
    rows: (data ?? []) as unknown as PayrollLineRow[],
    total: count ?? 0,
    page,
    pageSize,
  }
}
