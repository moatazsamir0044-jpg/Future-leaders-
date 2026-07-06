import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear, cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/filters'
import { ApprovalRowActions } from '@/components/approvals/approval-row-actions'
import { ClipboardCheck, CheckCircle2 } from 'lucide-react'

interface SearchParams { month?: string; year?: string; view?: string }

interface SiteInfo { name: string; service_type: string; client_name?: string }

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const view = params.view === 'history' ? 'history' : 'pending'

  const [
    { data: { user } },
    { data: pendingPayroll },
    { data: pendingExpenses },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('payroll_periods')
      .select('*, site:sites(name, service_type, client_name)')
      .eq('status', 'submitted')
      .order('year').order('month').order('submitted_at', { ascending: true, nullsFirst: true }),
    supabase.from('expense_reports')
      .select('*, site:sites(name, service_type, client_name)')
      .eq('status', 'submitted')
      .order('year').order('month').order('submitted_at', { ascending: true, nullsFirst: true }),
  ])

  const { data: profile } = user
    ? await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    : { data: null }
  const isAdmin = profile?.role === 'admin'

  // The History queries (and the month/year they need) only run for the
  // History tab — the default Pending view never renders them.
  let month = 0
  let year = 0
  let historyPayroll: ApprovalRow[] = []
  let historyExpenses: ApprovalRow[] = []
  if (view === 'history') {
    const resolved = await resolvePeriod(supabase, params)
    month = resolved.month
    year = resolved.year
    const [{ data: hp }, { data: he }] = await Promise.all([
      supabase.from('payroll_periods')
        .select('*, site:sites(name, service_type, client_name)')
        .eq('month', month).eq('year', year)
        .in('status', ['submitted', 'approved', 'rejected'])
        .order('created_at', { ascending: false }),
      supabase.from('expense_reports')
        .select('*, site:sites(name, service_type, client_name)')
        .eq('month', month).eq('year', year)
        .in('status', ['submitted', 'approved', 'rejected'])
        .order('created_at', { ascending: false }),
    ])
    historyPayroll = hp ?? []
    historyExpenses = he ?? []
  }

  const nPendingPayroll = (pendingPayroll ?? []).length
  const nPendingExpenses = (pendingExpenses ?? []).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {view === 'pending' ? 'Everything waiting for a decision, across all months' : `History — ${formatMonthYear(month, year)}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-medium">
            <Link
              href="/dashboard/approvals"
              className={cn('px-3 py-1.5 rounded-md transition-colors', view === 'pending' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
            >
              Pending{nPendingPayroll + nPendingExpenses > 0 ? ` (${nPendingPayroll + nPendingExpenses})` : ''}
            </Link>
            <Link
              href={view === 'history' ? `/dashboard/approvals?view=history&month=${month}&year=${year}` : '/dashboard/approvals?view=history'}
              className={cn('px-3 py-1.5 rounded-md transition-colors', view === 'history' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
            >
              History
            </Link>
          </div>
          {view === 'history' && <DashboardFilters currentMonth={month} currentYear={year} />}
        </div>
      </div>

      {/* Counters — always all-months pending, matching the dashboard KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Pending Payroll', value: String(nPendingPayroll), color: 'text-amber-600' },
          { label: 'Pending Expenses', value: String(nPendingExpenses), color: 'text-amber-600' },
          { label: 'Total Pending', value: String(nPendingPayroll + nPendingExpenses), color: nPendingPayroll + nPendingExpenses > 0 ? 'text-red-600' : 'text-green-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {view === 'pending' ? (
        <>
          <PendingTable
            title="Payroll Sheets"
            entity="payroll"
            rows={pendingPayroll ?? []}
            isAdmin={isAdmin}
            hrefBase="/dashboard/payroll"
            amountLabel="Net Total"
            amountKey="total_net"
            accent="text-blue-600"
          />
          <PendingTable
            title="Expense Reports"
            entity="expense"
            rows={pendingExpenses ?? []}
            isAdmin={isAdmin}
            hrefBase="/dashboard/expenses"
            amountLabel="Grand Total"
            amountKey="grand_total"
            accent="text-purple-600"
          />
        </>
      ) : (
        <>
          <HistoryTable
            title="Payroll Sheets"
            rows={historyPayroll}
            hrefBase="/dashboard/payroll"
            amountLabel="Net Total"
            amountKey="total_net"
            accent="text-blue-600"
            emptyText="No payroll submissions this month"
          />
          <HistoryTable
            title="Expense Reports"
            rows={historyExpenses}
            hrefBase="/dashboard/expenses"
            amountLabel="Grand Total"
            amountKey="grand_total"
            accent="text-purple-600"
            emptyText="No expense submissions this month"
          />
        </>
      )}
    </div>
  )
}

/* Row shape shared by both tables (subset of payroll_periods / expense_reports) */
interface ApprovalRow {
  id: string
  month: number
  year: number
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  submitted_at: string | null
  site: SiteInfo | null
  [key: string]: unknown
}

function PendingTable({ title, entity, rows, isAdmin, hrefBase, amountLabel, amountKey, accent }: {
  title: string
  entity: 'payroll' | 'expense'
  rows: ApprovalRow[]
  isAdmin: boolean
  hrefBase: string
  amountLabel: string
  amountKey: string
  accent: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className={`h-4 w-4 ${accent}`} /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 font-medium text-gray-600">Site</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">{amountLabel}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">{isAdmin ? 'Actions' : ''}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                    <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-green-500/60" />
                    All caught up — nothing waiting for approval.
                  </td>
                </tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    <Link href={`${hrefBase}/${r.id}`} className="hover:text-blue-700">{r.site?.name}</Link>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{r.site?.client_name ?? '—'}</td>
                  <td className="px-4 py-3.5 text-gray-700">{formatMonthYear(r.month, r.year)}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(Number(r[amountKey] ?? 0))}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      <Link href={`${hrefBase}/${r.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap">
                        Review →
                      </Link>
                      {isAdmin && (
                        <ApprovalRowActions entity={entity} id={r.id} name={`${r.site?.name ?? title} (${formatMonthYear(r.month, r.year)})`} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function HistoryTable({ title, rows, hrefBase, amountLabel, amountKey, accent, emptyText }: {
  title: string
  rows: ApprovalRow[]
  hrefBase: string
  amountLabel: string
  amountKey: string
  accent: string
  emptyText: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className={`h-4 w-4 ${accent}`} /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 font-medium text-gray-600">Site</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">{amountLabel}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">{emptyText}</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{r.site?.name}</td>
                  <td className="px-4 py-3.5 text-gray-600">{r.site?.client_name ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(Number(r[amountKey] ?? 0))}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3.5 text-right">
                    <Link href={`${hrefBase}/${r.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Review →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
