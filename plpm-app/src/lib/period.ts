import type { SupabaseClient } from '@supabase/supabase-js'

interface PeriodParams {
  month?: string
  year?: string
}

function parseIntInRange(value: string | undefined, min: number, max: number): number | null {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

/**
 * Resolve the month/year a period-filtered page should display.
 * Valid URL params win; otherwise fall back to the latest month that has
 * payroll or expense data, so pages don't open on an empty period.
 */
export async function resolvePeriod(
  supabase: SupabaseClient,
  params: PeriodParams,
): Promise<{ month: number; year: number }> {
  const paramMonth = parseIntInRange(params.month, 1, 12)
  const paramYear = parseIntInRange(params.year, 2000, 2100)
  if (paramMonth !== null && paramYear !== null) return { month: paramMonth, year: paramYear }

  const now = new Date()
  let month = now.getMonth() + 1
  let year = now.getFullYear()

  const [{ data: latestPayroll }, { data: latestExpense }] = await Promise.all([
    supabase
      .from('payroll_periods')
      .select('month, year')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('expense_reports')
      .select('month, year')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const candidates = [latestPayroll, latestExpense].filter(
    (c): c is { month: number; year: number } => c != null,
  )
  if (candidates.length > 0) {
    const latest = candidates.reduce((a, b) => (b.year * 12 + b.month > a.year * 12 + a.month ? b : a))
    month = latest.month
    year = latest.year
  }

  // A URL with only one of month/year set is treated as no valid params at
  // all — mixing an explicit month with an unrelated default year (or vice
  // versa) would silently show a period nobody asked for.
  return { month, year }
}
