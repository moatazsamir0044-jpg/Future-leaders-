export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { q } from '@/lib/supabase/query'
import Link from 'next/link'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardCharts } from '@/components/dashboard/charts'
import { DashboardFilters } from '@/components/dashboard/filters'
import { FileText, CheckSquare, TrendingUp, Wallet } from 'lucide-react'

interface SearchParams { month?: string; year?: string; site?: string; type?: string; status?: string }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()

  const { month, year } = await resolvePeriod(supabase, params)
  const siteFilter = params.site || null
  const typeFilter = params.type || null

  const [
    { data: sites },
    { data: allPayrollPeriods },
    { data: pendingPayroll },
  ] = await Promise.all([
    q(supabase.from('sites').select('*').eq('active', true).order('sort_order'), 'sites'),
    q(supabase.from('payroll_periods')
      .select('*, site:sites(name, service_type)')
      .eq('month', month).eq('year', year)
      .order('created_at', { ascending: false }), 'payroll sheets'),
    q(supabase.from('payroll_periods').select('id').eq('status', 'submitted'), 'pending payroll'),
  ])

  const payrollPeriods = (allPayrollPeriods ?? []).filter((row: { site_id: string; site: unknown }) => {
    const site = row.site as { service_type?: string } | null
    if (siteFilter && row.site_id !== siteFilter) return false
    if (typeFilter && site?.service_type !== typeFilter) return false
    return true
  })

  const totalNet = payrollPeriods.reduce((s, p) => s + Number(p.total_net ?? 0), 0)
  const totalGross = payrollPeriods.reduce((s, p) => s + Number(p.total_gross ?? 0), 0)
  const approvedCount = payrollPeriods.filter(p => p.status === 'approved').length
  const pendingCount = pendingPayroll?.length ?? 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatMonthYear(month, year)} overview</p>
        </div>
        <DashboardFilters currentMonth={month} currentYear={year}
          sites={sites ?? []} currentSite={siteFilter ?? undefined} currentType={typeFilter ?? undefined} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Wallet}
          label="Net Payroll"
          value={`EGP ${formatCurrency(totalNet)}`}
          sub="what workers are paid"
          color="blue"
        />
        <StatCard
          icon={TrendingUp}
          label="Gross Payroll"
          value={`EGP ${formatCurrency(totalGross)}`}
          sub="before deductions"
          color="slate"
        />
        <StatCard
          icon={FileText}
          label="Sheets Approved"
          value={`${approvedCount}/${payrollPeriods.length}`}
          sub={formatMonthYear(month, year)}
          color={payrollPeriods.length > 0 && approvedCount === payrollPeriods.length ? 'green' : 'slate'}
        />
        <StatCard
          icon={CheckSquare}
          label="Pending Approvals"
          value={String(pendingCount)}
          sub="awaiting an admin (all months)"
          color={pendingCount > 0 ? 'amber' : 'green'}
        />
      </div>

      {/* Charts */}
      <DashboardCharts payrollPeriods={payrollPeriods} />

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
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Gross Total</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Net Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payrollPeriods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No payroll records for this period —{' '}
                      <Link href={`/dashboard/payroll?month=${month}&year=${year}`} className="text-blue-600 hover:text-blue-800 font-medium">create a sheet →</Link>
                    </td>
                  </tr>
                ) : payrollPeriods.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[180px]">{(p.site as { name: string })?.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium uppercase">
                        {(p.site as { service_type: string })?.service_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(p.total_gross)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatCurrency(p.total_net)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub: string
  color: 'blue' | 'slate' | 'amber' | 'green'
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
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
