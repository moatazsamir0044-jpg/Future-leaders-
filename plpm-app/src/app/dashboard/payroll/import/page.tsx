import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { resolvePeriod } from '@/lib/period'
import { formatMonthYear } from '@/lib/utils'
import { DashboardFilters } from '@/components/dashboard/filters'
import { PayrollImport, type ExistingPeriod } from '@/components/payroll/payroll-import'
import type { SiteRef } from '@/lib/import/match-sites'
import { ArrowLeft } from 'lucide-react'

interface SearchParams { month?: string; year?: string }

export default async function PayrollImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { month, year } = await resolvePeriod(supabase, params)

  const [{ data: sites }, { data: periods }] = await Promise.all([
    supabase.from('sites')
      .select('id, name, name_ar, sheet_key, active')
      .eq('active', true)
      .order('sort_order'),
    supabase.from('payroll_periods')
      .select('id, site_id, status, total_net')
      .eq('month', month).eq('year', year),
  ])

  // Row counts drive the "this will replace N rows" warning, so they are
  // counted rather than estimated — the confirmation has to say exactly what
  // an import is about to overwrite.
  const periodIds = (periods ?? []).map(p => p.id)
  const counts = new Map<string, number>()
  if (periodIds.length > 0) {
    const { data: records } = await supabase
      .from('payroll_records')
      .select('period_id')
      .in('period_id', periodIds)
    for (const record of records ?? []) {
      counts.set(record.period_id, (counts.get(record.period_id) ?? 0) + 1)
    }
  }

  const existing: ExistingPeriod[] = (periods ?? []).map(p => ({
    id: p.id,
    site_id: p.site_id,
    status: p.status,
    rowCount: counts.get(p.id) ?? 0,
    total_net: Number(p.total_net ?? 0),
  }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Payroll
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Import Payroll from Excel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Loading the site sheets for {formatMonthYear(month, year)}
          </p>
        </div>
        <DashboardFilters currentMonth={month} currentYear={year} />
      </div>

      <PayrollImport
        sites={(sites ?? []) as SiteRef[]}
        month={month}
        year={year}
        existing={existing}
      />
    </div>
  )
}
