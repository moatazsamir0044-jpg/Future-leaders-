import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePeriod } from './period'

type Row = { month: number; year: number } | null

/**
 * Stands in for the three latest-row lookups resolvePeriod makes, in the order
 * it makes them: payroll, expenses, invoices.
 */
function fakeSupabase(rows: [Row, Row, Row]): SupabaseClient {
  const byTable: Record<string, Row> = {
    payroll_periods: rows[0],
    expense_reports: rows[1],
    invoices: rows[2],
  }
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: byTable[table] ?? null, error: null }),
      }
      return chain
    },
  } as unknown as SupabaseClient
}

const empty = fakeSupabase([null, null, null])

describe('resolvePeriod', () => {
  it('uses explicit month and year from the URL', async () => {
    expect(await resolvePeriod(empty, { month: '3', year: '2025' })).toEqual({ month: 3, year: 2025 })
  })

  it('ignores a month with no year, rather than pairing it with today', async () => {
    // Mixing an explicit month with an unrelated default year would silently
    // show a period nobody asked for.
    const got = await resolvePeriod(fakeSupabase([{ month: 5, year: 2026 }, null, null]), { month: '3' })
    expect(got).toEqual({ month: 5, year: 2026 })
  })

  it('ignores a year with no month', async () => {
    const got = await resolvePeriod(fakeSupabase([{ month: 5, year: 2026 }, null, null]), { year: '2025' })
    expect(got).toEqual({ month: 5, year: 2026 })
  })

  it.each([
    ['month 0', { month: '0', year: '2025' }],
    ['month 13', { month: '13', year: '2025' }],
    ['a non-numeric month', { month: 'may', year: '2025' }],
    ['a year before 2000', { month: '3', year: '1999' }],
    ['a year after 2100', { month: '3', year: '2200' }],
  ])('rejects %s and falls back to the latest data', async (_label, params) => {
    const got = await resolvePeriod(fakeSupabase([{ month: 5, year: 2026 }, null, null]), params)
    expect(got).toEqual({ month: 5, year: 2026 })
  })

  it('picks the most recent period across all three sources', async () => {
    const got = await resolvePeriod(fakeSupabase([
      { month: 5, year: 2026 },
      { month: 11, year: 2026 },
      { month: 2, year: 2026 },
    ]), {})
    expect(got).toEqual({ month: 11, year: 2026 })
  })

  it('compares by year first, not by month number', async () => {
    const got = await resolvePeriod(fakeSupabase([
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
      null,
    ]), {})
    expect(got).toEqual({ month: 1, year: 2026 })
  })

  it('falls back to the current month when there is no data at all', async () => {
    const now = new Date()
    expect(await resolvePeriod(empty, {})).toEqual({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
  })
})
