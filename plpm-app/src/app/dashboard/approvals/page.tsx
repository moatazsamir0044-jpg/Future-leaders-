import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/filters'
import { ClipboardCheck } from 'lucide-react'

interface SearchParams { month?: string; year?: string }

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const now = new Date()
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const year = parseInt(params.year ?? String(now.getFullYear()))

  const [{ data: payroll }, { data: expenses }] = await Promise.all([
    supabase.from('payroll_periods')
      .select('*, site:sites(id, name, service_type, client_name)')
      .eq('month', month).eq('year', year)
      .in('status', ['submitted', 'approved', 'rejected'])
      .order('created_at', { ascending: false }),
    supabase.from('expense_reports')
      .select('*, site:sites(id, name, service_type, client_name)')
      .eq('month', month).eq('year', year)
      .in('status', ['submitted', 'approved', 'rejected'])
      .order('created_at', { ascending: false }),
  ])

  const pendingPayroll = (payroll ?? []).filter(p => p.status === 'submitted').length
  const pendingExpenses = (expenses ?? []).filter(r => r.status === 'submitted').length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatMonthYear(month, year)}</p>
        </div>
        <DashboardFilters currentMonth={month} currentYear={year} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Payroll', value: String(pendingPayroll), color: 'text-amber-600' },
          { label: 'Pending Expenses', value: String(pendingExpenses), color: 'text-amber-600' },
          { label: 'Total Pending', value: String(pendingPayroll + pendingExpenses), color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Payroll Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-blue-600" /> Payroll Sheets
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 font-medium text-gray-600">Site</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Net Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(payroll ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No payroll submissions this month</td></tr>
              ) : (payroll ?? []).map(p => {
                const site = p.site as { name: string; service_type: string; client_name?: string }
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{site?.name}</td>
                    <td className="px-4 py-3.5 text-gray-600">{site?.client_name ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(p.total_net)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/dashboard/payroll/${p.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Review →</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Expense Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-purple-600" /> Expense Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 font-medium text-gray-600">Site</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Grand Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(expenses ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No expense submissions this month</td></tr>
              ) : (expenses ?? []).map(r => {
                const site = r.site as { name: string; service_type: string; client_name?: string }
                return (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{site?.name}</td>
                    <td className="px-4 py-3.5 text-gray-600">{site?.client_name ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(r.grand_total)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/dashboard/expenses/${r.id}`} className="text-purple-600 hover:text-purple-800 text-sm font-medium">Review →</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
