import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/filters'
import { InvoiceStatusBadge } from '@/components/finance/invoice-status-badge'
import { Banknote, TrendingUp, AlertTriangle } from 'lucide-react'
import type { Invoice } from '@/types'

interface SearchParams { month?: string; year?: string; site?: string; type?: string }

const DAY_MS = 24 * 60 * 60 * 1000

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(`${dateStr}T00:00:00Z`).getTime()) / DAY_MS))
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { month, year } = await resolvePeriod(supabase, params)
  const siteFilter = params.site || null
  const typeFilter = params.type || null

  const [{ data: outstandingRaw }, { data: pipeline }, { data: periodInvoices }, { data: payrolls }, { data: expenses }, { data: sites }] =
    await Promise.all([
      // Issued but not yet collected — the receivables book, across all periods
      supabase.from('invoices')
        .select('*, contract:contracts(id, name, payment_terms_days, client:clients(id, name), contract_sites(site_id, site:sites(id, service_type)))')
        .in('status', ['issued', 'sent_to_client'])
        .order('issue_date', { ascending: true }),
      supabase.from('invoices')
        .select('id, net_amount')
        .in('status', ['draft', 'agreed', 'sent_to_accountant']),
      supabase.from('invoices')
        .select('*, contract:contracts(id, name, client:clients(id, name), contract_sites(site_id, site:sites(id, name, service_type)))')
        .eq('month', month).eq('year', year),
      supabase.from('payroll_periods')
        .select('site_id, total_gross')
        .eq('month', month).eq('year', year),
      supabase.from('expense_reports')
        .select('site_id, grand_total')
        .eq('month', month).eq('year', year),
      supabase.from('sites').select('*').eq('active', true).order('sort_order'),
    ])

  // An invoice matches when its contract covers the selected site / type
  const matchesFilter = (inv: Invoice) => {
    const links = inv.contract?.contract_sites ?? []
    if (siteFilter && !links.some(cs => cs.site_id === siteFilter)) return false
    if (typeFilter && !links.some(cs => cs.site?.service_type === typeFilter)) return false
    return true
  }

  // --- AR aging (by days since ETA issue date) ---
  const outstanding = ((outstandingRaw ?? []) as Invoice[]).filter(matchesFilter).map(inv => {
    const basis = inv.issue_date ?? inv.created_at.slice(0, 10)
    const age = daysSince(basis)
    const expected = Number(inv.net_amount) - Number(inv.withholding_amount)
    const overdue = inv.due_date != null && daysSince(inv.due_date) > 0
    return { inv, age, expected, overdue }
  }).sort((a, b) => b.age - a.age)

  const buckets = [
    { label: '0–30 days', min: 0, max: 30 },
    { label: '31–60 days', min: 31, max: 60 },
    { label: '61–90 days', min: 61, max: 90 },
    { label: '90+ days', min: 91, max: Infinity },
  ].map(b => ({
    ...b,
    total: outstanding.filter(o => o.age >= b.min && o.age <= b.max).reduce((s, o) => s + o.expected, 0),
    count: outstanding.filter(o => o.age >= b.min && o.age <= b.max).length,
  }))

  const totalOutstanding = outstanding.reduce((s, o) => s + o.expected, 0)
  const pipelineTotal = (pipeline ?? []).reduce((s, i) => s + Number(i.net_amount ?? 0), 0)

  // --- Profit per contract for the selected period ---
  const payrollBySite = new Map<string, number>()
  for (const p of payrolls ?? []) {
    payrollBySite.set(p.site_id, (payrollBySite.get(p.site_id) ?? 0) + Number(p.total_gross ?? 0))
  }
  const expenseBySite = new Map<string, number>()
  for (const e of expenses ?? []) {
    expenseBySite.set(e.site_id, (expenseBySite.get(e.site_id) ?? 0) + Number(e.grand_total ?? 0))
  }

  const byContract = new Map<string, {
    name: string
    clientName: string
    siteNames: string[]
    revenue: number
    payrollCost: number
    expenseCost: number
    hasSites: boolean
  }>()
  for (const inv of ((periodInvoices ?? []) as Invoice[]).filter(matchesFilter)) {
    const c = inv.contract
    if (!c) continue
    let entry = byContract.get(c.id)
    if (!entry) {
      const siteLinks = c.contract_sites ?? []
      entry = {
        name: c.name,
        clientName: c.client?.name ?? '—',
        siteNames: siteLinks.map(cs => cs.site?.name).filter((n): n is string => Boolean(n)),
        revenue: 0,
        payrollCost: siteLinks.reduce((s, cs) => s + (payrollBySite.get(cs.site_id) ?? 0), 0),
        expenseCost: siteLinks.reduce((s, cs) => s + (expenseBySite.get(cs.site_id) ?? 0), 0),
        hasSites: siteLinks.length > 0,
      }
      byContract.set(c.id, entry)
    }
    entry.revenue += Number(inv.net_amount ?? 0)
  }
  const profitRows = Array.from(byContract.values())
    .map(r => ({ ...r, profit: r.revenue - r.payrollCost - r.expenseCost }))
    .sort((a, b) => a.profit - b.profit)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receivables & Profit</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Who owes what — المستحقات — and whether each contract made money in {formatMonthYear(month, year)}
          </p>
        </div>
        <DashboardFilters currentMonth={month} currentYear={year}
          sites={sites ?? []} currentSite={siteFilter ?? undefined} currentType={typeFilter ?? undefined} />
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Outstanding</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">EGP {formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-gray-400 mt-1">{outstanding.length} invoices awaiting collection</p>
        </Card>
        {buckets.map(b => (
          <Card key={b.label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{b.label}</p>
            <p className={`text-2xl font-bold mt-1 ${b.min >= 61 && b.total > 0 ? 'text-red-600' : b.min >= 31 && b.total > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              EGP {formatCurrency(b.total)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{b.count} invoice{b.count === 1 ? '' : 's'}</p>
          </Card>
        ))}
      </div>

      {/* Outstanding invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-blue-600" />
            Outstanding Invoices — oldest first
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contract</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Issued</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Due</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Expected (EGP)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Days Out</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {outstanding.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-gray-400">
                      <Banknote className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-gray-500">No outstanding invoices</p>
                      <p className="text-sm mt-1">
                        Invoices appear here once marked &quot;Issued on ETA&quot; and stay until collected.
                        {pipelineTotal > 0 && <> {' '}EGP {formatCurrency(pipelineTotal)} is still in preparation (draft/agreed/at accountant).</>}
                      </p>
                    </td>
                  </tr>
                ) : outstanding.map(({ inv, age, expected, overdue }) => (
                  <tr key={inv.id} className={`hover:bg-gray-50/50 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-5 py-3.5 font-medium text-gray-900">{inv.contract?.client?.name ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-600">{inv.contract?.name ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-600">{formatMonthYear(inv.month, inv.year)}</td>
                    <td className="px-4 py-3.5 text-gray-600">{inv.issue_date ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={overdue ? 'text-red-600 font-medium inline-flex items-center gap-1' : 'text-gray-600'}>
                        {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
                        {inv.due_date ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(expected)}</td>
                    <td className={`px-4 py-3.5 text-right font-mono ${age > 90 ? 'text-red-600 font-bold' : age > 60 ? 'text-red-600' : age > 30 ? 'text-amber-600' : 'text-gray-700'}`}>
                      {age}
                    </td>
                    <td className="px-4 py-3.5"><InvoiceStatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/dashboard/invoices/${inv.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Profit per contract */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            Profit per Contract — {formatMonthYear(month, year)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Contract</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sites</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Revenue (net)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Payroll Cost</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Expenses</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Profit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {profitRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-gray-500">No invoices for {formatMonthYear(month, year)}</p>
                      <p className="text-sm mt-1">Create invoices for this month to see contract profitability against payroll and expense costs.</p>
                    </td>
                  </tr>
                ) : profitRows.map(r => (
                  <tr key={r.name + r.clientName} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-3.5 text-gray-600">{r.clientName}</td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs max-w-[200px]">
                      {r.hasSites ? r.siteNames.join(', ') : <span className="text-amber-600">No sites linked — costs unknown</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-700">{formatCurrency(r.revenue)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-700">{r.hasSites ? formatCurrency(r.payrollCost) : '—'}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-700">{r.hasSites ? formatCurrency(r.expenseCost) : '—'}</td>
                    <td className={`px-4 py-3.5 text-right font-mono font-semibold ${!r.hasSites ? 'text-gray-400' : r.profit < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {r.hasSites ? formatCurrency(r.profit) : '—'}
                    </td>
                    <td className={`px-4 py-3.5 text-right font-mono ${!r.hasSites ? 'text-gray-400' : r.profit < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {r.hasSites && r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {profitRows.length > 0 && (
            <p className="text-xs text-gray-400 px-5 py-3 border-t border-gray-50">
              Cost = payroll gross + expense reports of the contract&apos;s linked sites for the month. Revenue = net invoiced amount (after deductions and credit notes, before withholding).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
