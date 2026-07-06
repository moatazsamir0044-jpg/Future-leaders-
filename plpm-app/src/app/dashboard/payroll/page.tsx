import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/filters'
import { NewPayrollButton } from '@/components/payroll/new-payroll-button'
import { FileText } from 'lucide-react'

interface SearchParams { month?: string; year?: string; site?: string }

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { month, year } = await resolvePeriod(supabase, params)

  const [{ data: periods }, { data: sites }] = await Promise.all([
    supabase.from('payroll_periods')
      .select('*, site:sites(id, name, name_ar, service_type, client_name)')
      .eq('month', month).eq('year', year)
      .order('created_at', { ascending: false }),
    supabase.from('sites').select('*').eq('active', true).order('sort_order'),
  ])

  const totalNet = (periods ?? []).reduce((s, p) => s + Number(p.total_net ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatMonthYear(month, year)}</p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardFilters currentMonth={month} currentYear={year} />
          <NewPayrollButton sites={sites ?? []} month={month} year={year} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Payroll Sheets', value: String(periods?.length ?? 0), color: 'text-blue-600' },
          { label: 'Total Net', value: `EGP ${formatCurrency(totalNet)}`, color: 'text-gray-900' },
          { label: 'Pending', value: String((periods ?? []).filter(p => p.status === 'submitted').length), color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Payroll Sheets — {formatMonthYear(month, year)}
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
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Gross</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Net</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(periods ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-gray-500">No payroll sheets for {formatMonthYear(month, year)}</p>
                      <p className="text-sm mt-1">Use &quot;New Payroll Sheet&quot; above — it can prefill all active employees from the site&apos;s roster. Or switch to another month with the filter.</p>
                    </td>
                  </tr>
                ) : (periods ?? []).map(p => {
                  const site = p.site as { id: string; name: string; service_type: string; client_name?: string }
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{site?.name}</td>
                      <td className="px-4 py-3.5 text-gray-600">{site?.client_name ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium uppercase">{site?.service_type}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-gray-700">{formatCurrency(p.total_gross)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(p.total_net)}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/dashboard/payroll/${p.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
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
