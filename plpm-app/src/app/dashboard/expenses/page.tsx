import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/filters'
import { NewExpenseButton } from '@/components/expenses/new-expense-button'
import { Receipt } from 'lucide-react'

interface SearchParams { month?: string; year?: string; site?: string; type?: string }

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { month, year } = await resolvePeriod(supabase, params)
  const siteFilter = params.site || null
  const typeFilter = params.type || null

  const [{ data: allReports }, { data: sites }] = await Promise.all([
    supabase.from('expense_reports')
      .select('*, site:sites(id, name, service_type, client_name)')
      .eq('month', month).eq('year', year)
      .order('created_at', { ascending: false }),
    supabase.from('sites').select('*').eq('active', true).order('sort_order'),
  ])

  const reports = (allReports ?? []).filter(r => {
    const site = r.site as { service_type?: string } | null
    if (siteFilter && r.site_id !== siteFilter) return false
    if (typeFilter && site?.service_type !== typeFilter) return false
    return true
  })

  const grandTotal = (reports ?? []).reduce((s, r) => s + Number(r.grand_total ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatMonthYear(month, year)}</p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardFilters currentMonth={month} currentYear={year}
            sites={sites ?? []} currentSite={siteFilter ?? undefined} currentType={typeFilter ?? undefined} />
          <NewExpenseButton sites={sites ?? []} month={month} year={year} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Expense Reports', value: String(reports?.length ?? 0), color: 'text-purple-600' },
          { label: 'Grand Total', value: `EGP ${formatCurrency(grandTotal)}`, color: 'text-gray-900' },
          { label: 'Pending', value: String((reports ?? []).filter(r => r.status === 'submitted').length), color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-purple-600" />
            Expense Reports — {formatMonthYear(month, year)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Site</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Transport</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Accommodation</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Other</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(reports ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-gray-400">
                      <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-gray-500">No expense reports for {formatMonthYear(month, year)}</p>
                      <p className="text-sm mt-1">Use &quot;New Expense Report&quot; above to create one, or switch to another month with the filter.</p>
                    </td>
                  </tr>
                ) : (reports ?? []).map(r => {
                  const site = r.site as { name: string; service_type: string; client_name?: string }
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{site?.name}</td>
                      <td className="px-4 py-3.5 text-gray-600">{site?.client_name ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium uppercase">{site?.service_type}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-gray-700">{formatCurrency(r.total_transportation)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-gray-700">{formatCurrency(r.total_accommodation)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-gray-700">{formatCurrency(r.total_other)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(r.grand_total)}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/dashboard/expenses/${r.id}`}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
