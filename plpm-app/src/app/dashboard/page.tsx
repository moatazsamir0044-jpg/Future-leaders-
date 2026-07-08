export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardCharts } from '@/components/dashboard/charts'
import { DashboardFilters } from '@/components/dashboard/filters'
import { FileText, Receipt, CheckSquare, AlertCircle, TrendingUp, Building2 } from 'lucide-react'

interface SearchParams { month?: string; year?: string; type?: string; status?: string }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()

  const { month, year } = await resolvePeriod(supabase, params)
  const type = params.type

  // Fetch all data in parallel
  const [
    { data: sites },
    { data: payrollPeriods },
    { data: expenseReports },
    { data: pendingPayroll },
    { data: pendingExpenses },
  ] = await Promise.all([
    supabase.from('sites').select('*').eq('active', true).order('sort_order'),
    (() => {
      let q = supabase.from('payroll_periods')
        .select('*, site:sites!inner(name, service_type)')
        .eq('month', month).eq('year', year)
      if (type) q = q.eq('site.service_type', type)
      return q.order('created_at', { ascending: false })
    })(),
    (() => {
      let q = supabase.from('expense_reports')
        .select('*, site:sites!inner(name, service_type)')
        .eq('month', month).eq('year', year)
      if (type) q = q.eq('site.service_type', type)
      return q.order('created_at', { ascending: false })
    })(),
    supabase.from('payroll_periods').select('id').eq('status', 'submitted'),
    supabase.from('expense_reports').select('id').eq('status', 'submitted'),
  ])

  const totalPayroll = (payrollPeriods ?? []).reduce((s, p) => s + Number(p.total_net ?? 0), 0)
  const totalExpenses = (expenseReports ?? []).reduce((s, e) => s + Number(e.grand_total ?? 0), 0)
  const approvedPayroll = (payrollPeriods ?? []).filter(p => p.status === 'approved').length
  const approvedExpenses = (expenseReports ?? []).filter(e => e.status === 'approved').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatMonthYear(month, year)} overview</p>
        </div>
        <DashboardFilters currentMonth={month} currentYear={year} currentType={type ?? 'all'} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Total Payroll"
          value={`EGP ${formatCurrency(totalPayroll)}`}
          sub={`${approvedPayroll}/${payrollPeriods?.length ?? 0} approved`}
          color="blue"
        />
        <StatCard
          icon={Receipt}
          label="Total Expenses"
          value={`EGP ${formatCurrency(totalExpenses)}`}
          sub={`${approvedExpenses}/${expenseReports?.length ?? 0} approved`}
          color="purple"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Cost"
          value={`EGP ${formatCurrency(totalPayroll + totalExpenses)}`}
          sub={formatMonthYear(month, year)}
          color="slate"
        />
        <StatCard
          icon={CheckSquare}
          label="Pending Approvals"
          value={String((pendingPayroll?.length ?? 0) + (pendingExpenses?.length ?? 0))}
          sub={`${pendingPayroll?.length ?? 0} payroll · ${pendingExpenses?.length ?? 0} expenses (all months)`}
          color={(pendingPayroll?.length ?? 0) + (pendingExpenses?.length ?? 0) > 0 ? 'amber' : 'green'}
        />
      </div>

      {/* Charts */}
      <DashboardCharts payrollPeriods={payrollPeriods ?? []} expenseReports={expenseReports ?? []} />

      {/* Tables side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Payroll table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Payroll — {formatMonthYear(month, year)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Site</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Net Total</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(payrollPeriods ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                        No payroll records for this period —{' '}
                        <Link href={`/dashboard/payroll?month=${month}&year=${year}`} className="text-blue-600 hover:text-blue-800 font-medium">create a sheet →</Link>
                      </td>
                    </tr>
                  ) : (payrollPeriods ?? []).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[140px]">{(p.site as { name: string })?.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium uppercase">
                          {(p.site as { service_type: string })?.service_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatCurrency(p.total_net)}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Expense table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-purple-600" />
              Expenses — {formatMonthYear(month, year)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Site</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Transport</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(expenseReports ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                        No expense reports for this period —{' '}
                        <Link href={`/dashboard/expenses?month=${month}&year=${year}`} className="text-purple-600 hover:text-purple-800 font-medium">create a report →</Link>
                      </td>
                    </tr>
                  ) : (expenseReports ?? []).map(e => (
                    <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[140px]">{(e.site as { name: string })?.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(e.total_transportation)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatCurrency(e.grand_total)}</td>
                      <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub: string
  color: 'blue' | 'purple' | 'slate' | 'amber' | 'green'
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-1 truncate">{value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}
