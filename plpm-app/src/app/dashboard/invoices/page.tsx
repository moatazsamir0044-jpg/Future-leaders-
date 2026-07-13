import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/filters'
import { NewInvoiceButton } from '@/components/finance/new-invoice-button'
import { InvoiceStatusBadge } from '@/components/finance/invoice-status-badge'
import { ScrollText } from 'lucide-react'
import type { Invoice, Contract } from '@/types'

interface SearchParams { month?: string; year?: string; site?: string; type?: string }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { month, year } = await resolvePeriod(supabase, params)
  const siteFilter = params.site || null
  const typeFilter = params.type || null

  const [{ data: invoices }, { data: contracts }, { data: sites }] = await Promise.all([
    supabase.from('invoices')
      .select('*, contract:contracts(id, name, monthly_value, client:clients(id, name), contract_sites(site_id, site:sites(id, service_type)))')
      .eq('month', month).eq('year', year)
      .order('created_at', { ascending: false }),
    supabase.from('contracts')
      .select('*, client:clients(id, name)')
      .eq('active', true)
      .order('name'),
    supabase.from('sites').select('*').eq('active', true).order('sort_order'),
  ])

  // An invoice matches when its contract covers the selected site / type
  const list = ((invoices ?? []) as Invoice[]).filter(inv => {
    const links = inv.contract?.contract_sites ?? []
    if (siteFilter && !links.some(cs => cs.site_id === siteFilter)) return false
    if (typeFilter && !links.some(cs => cs.site?.service_type === typeFilter)) return false
    return true
  })
  const totalNet = list.reduce((s, i) => s + Number(i.net_amount ?? 0), 0)
  const collected = list.filter(i => i.status === 'collected')
    .reduce((s, i) => s + Number(i.net_amount ?? 0), 0)
  const outstanding = totalNet - collected

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatMonthYear(month, year)} — one invoice per contract</p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardFilters currentMonth={month} currentYear={year}
            sites={sites ?? []} currentSite={siteFilter ?? undefined} currentType={typeFilter ?? undefined} />
          <NewInvoiceButton contracts={(contracts ?? []) as Contract[]} month={month} year={year}
            existingContractIds={((invoices ?? []) as Invoice[]).filter(i => !i.is_extra_works).map(i => i.contract_id)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: 'Invoices', value: String(list.length), color: 'text-blue-600' },
          { label: 'Invoiced (net)', value: `EGP ${formatCurrency(totalNet)}`, color: 'text-gray-900' },
          { label: 'Collected', value: `EGP ${formatCurrency(collected)}`, color: 'text-green-600' },
          { label: 'Outstanding', value: `EGP ${formatCurrency(outstanding)}`, color: 'text-amber-600' },
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
            <ScrollText className="h-4 w-4 text-blue-600" />
            Invoices — {formatMonthYear(month, year)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Contract</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Gross</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Deductions</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Net</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                      <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-gray-500">No invoices for {formatMonthYear(month, year)}</p>
                      <p className="text-sm mt-1">
                        Use &quot;New Invoice&quot; above to create one
                        {(contracts ?? []).length === 0 && <> — you need at least one contract under <Link href="/dashboard/clients" className="text-blue-600 hover:underline">Clients &amp; Contracts</Link> first</>}.
                      </p>
                    </td>
                  </tr>
                ) : list.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {inv.contract?.name ?? '—'}
                      {inv.is_extra_works && <span className="ml-2 text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">Extra works</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{inv.contract?.client?.name ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-700">{formatCurrency(inv.gross_amount)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-700">
                      {Number(inv.total_deductions) + Number(inv.credit_note_amount) > 0
                        ? `−${formatCurrency(Number(inv.total_deductions) + Number(inv.credit_note_amount))}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(inv.net_amount)}</td>
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
    </div>
  )
}
