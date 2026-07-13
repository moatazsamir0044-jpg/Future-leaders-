import { createClient } from '@/lib/supabase/server'
import { resolvePeriod } from '@/lib/period'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/filters'
import { AccountantExportButton } from '@/components/finance/accountant-export-button'
import { FileSpreadsheet } from 'lucide-react'
import type { AccountantExportData } from '@/lib/export/accountant'
import type { Invoice } from '@/types'
import { INVOICE_STATUS_LABELS_AR, MONTHS_AR } from '@/types'

interface SearchParams { month?: string; year?: string }

const STATUS_AR: Record<string, string> = {
  draft: 'مسودة', submitted: 'مقدمة', approved: 'معتمدة', rejected: 'مرفوضة',
}
const METHOD_AR: Record<string, string> = {
  transfer: 'تحويل بنكي', cheque: 'شيك', cash: 'نقدي',
}

export default async function ExportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { month, year } = await resolvePeriod(supabase, params)

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? { m: 1, y: year + 1 } : { m: month + 1, y: year }
  const monthEnd = `${nextMonth.y}-${String(nextMonth.m).padStart(2, '0')}-01`

  const [
    { data: invoices },
    { data: collected },
    { data: payrolls },
    { data: expenses },
    { data: repayments },
    { data: custodyTxns },
  ] = await Promise.all([
    supabase.from('invoices')
      .select('*, contract:contracts(name, client:clients(name))')
      .eq('month', month).eq('year', year),
    supabase.from('invoices')
      .select('*, contract:contracts(name, client:clients(name))')
      .eq('status', 'collected')
      .gte('collected_date', monthStart).lt('collected_date', monthEnd),
    supabase.from('payroll_periods')
      .select('id, site_id, total_gross, total_net, status, site:sites(name, name_ar)')
      .eq('month', month).eq('year', year),
    supabase.from('expense_reports')
      .select('*, site:sites(name, name_ar)')
      .eq('month', month).eq('year', year),
    supabase.from('advance_repayments')
      .select('amount, source, advance:worker_advances(employee:employees(name, site:sites(name, name_ar)))')
      .eq('month', month).eq('year', year),
    supabase.from('custody_transactions')
      .select('*, account:custody_accounts(name)')
      .gte('txn_date', monthStart).lt('txn_date', monthEnd)
      .order('txn_date'),
  ])

  // Per-site insurance and advance deductions come from the sheet lines
  const periodIds = (payrolls ?? []).map(p => p.id)
  const insuranceBySite = new Map<string, number>()
  const advancesBySite = new Map<string, number>()
  if (periodIds.length > 0) {
    const { data: records } = await supabase.from('payroll_records')
      .select('site_id, insurance, advance')
      .in('period_id', periodIds)
    for (const r of records ?? []) {
      insuranceBySite.set(r.site_id, (insuranceBySite.get(r.site_id) ?? 0) + Number(r.insurance ?? 0))
      advancesBySite.set(r.site_id, (advancesBySite.get(r.site_id) ?? 0) + Number(r.advance ?? 0))
    }
  }

  type SiteJoin = { name: string; name_ar: string | null } | null
  const siteName = (s: SiteJoin) => s?.name_ar || s?.name || '—'

  const exportData: AccountantExportData = {
    month, year,
    invoices: ((invoices ?? []) as Invoice[]).map(i => ({
      client: i.contract?.client?.name ?? '—',
      contract: i.contract?.name ?? '—',
      gross: Number(i.gross_amount),
      deductions: Number(i.total_deductions),
      creditNote: Number(i.credit_note_amount),
      net: Number(i.net_amount),
      withholding: Number(i.withholding_amount),
      status: INVOICE_STATUS_LABELS_AR[i.status] ?? i.status,
      issueDate: i.issue_date,
      dueDate: i.due_date,
      etaRef: i.eta_reference,
      extraWorks: i.is_extra_works,
    })),
    collections: ((collected ?? []) as Invoice[]).map(i => ({
      client: i.contract?.client?.name ?? '—',
      contract: i.contract?.name ?? '—',
      periodLabel: `${MONTHS_AR[i.month - 1]} ${i.year}`,
      net: Number(i.net_amount),
      withholding: Number(i.withholding_amount),
      collectedDate: i.collected_date ?? '—',
      method: i.collection_method ? (METHOD_AR[i.collection_method] ?? i.collection_method) : '—',
    })),
    payroll: (payrolls ?? []).map(p => ({
      site: siteName(p.site as unknown as SiteJoin),
      gross: Number(p.total_gross ?? 0),
      net: Number(p.total_net ?? 0),
      insurance: insuranceBySite.get(p.site_id) ?? 0,
      advances: advancesBySite.get(p.site_id) ?? 0,
      status: STATUS_AR[p.status] ?? p.status,
    })),
    expenses: (expenses ?? []).map(e => ({
      site: siteName(e.site as SiteJoin),
      transportation: Number(e.total_transportation ?? 0),
      accommodation: Number(e.total_accommodation ?? 0),
      other: Number(e.total_other ?? 0),
      total: Number(e.grand_total ?? 0),
      status: STATUS_AR[e.status] ?? e.status,
    })),
    advanceRepayments: (repayments ?? []).map(r => {
      const adv = r.advance as { employee?: { name?: string; site?: { name: string; name_ar: string | null } } } | null
      return {
        worker: adv?.employee?.name ?? '—',
        site: siteName((adv?.employee?.site ?? null) as SiteJoin),
        amount: Number(r.amount),
        source: r.source === 'payroll' ? 'خصم من المرتب' : 'سداد نقدي',
      }
    }),
    custody: (custodyTxns ?? []).map(t => ({
      date: t.txn_date,
      account: (t.account as { name: string } | null)?.name ?? '—',
      type: t.type === 'top_up' ? 'إيداع' : 'مصروف',
      payee: t.payee ?? '—',
      description: t.description ?? '—',
      amount: Number(t.amount),
    })),
  }

  const stats = [
    { label: 'Invoices', value: exportData.invoices.length, amount: exportData.invoices.reduce((s, i) => s + i.net, 0) },
    { label: 'Collections', value: exportData.collections.length, amount: exportData.collections.reduce((s, c) => s + c.net - c.withholding, 0) },
    { label: 'Payroll sheets', value: exportData.payroll.length, amount: exportData.payroll.reduce((s, p) => s + p.gross, 0) },
    { label: 'Expense reports', value: exportData.expenses.length, amount: exportData.expenses.reduce((s, e) => s + e.total, 0) },
    { label: 'Advance repayments', value: exportData.advanceRepayments.length, amount: exportData.advanceRepayments.reduce((s, a) => s + a.amount, 0) },
    { label: 'Custody transactions', value: exportData.custody.length, amount: exportData.custody.reduce((s, c) => s + (c.type === 'مصروف' ? c.amount : 0), 0) },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accountant Export — بيان المحاسب</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            One Excel workbook with everything the accounting office needs for {formatMonthYear(month, year)} — replaces the WhatsApp handoff.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardFilters currentMonth={month} currentYear={year} />
          <AccountantExportButton data={exportData} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            What the {formatMonthYear(month, year)} pack contains
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Sheet</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Rows</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount (EGP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.map(s => (
                  <tr key={s.label} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">{s.label}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{s.value}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 px-5 py-3 border-t border-gray-50">
            Sheets included: ملخص · الفواتير · التحصيلات · المرتبات (بالتأمينات والسلف) · المصروفات · السلف · العُهد.
            Collections and custody are matched by date within the month; the rest by the reporting period.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
