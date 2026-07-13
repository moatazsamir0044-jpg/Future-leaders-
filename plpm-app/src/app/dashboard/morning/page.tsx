import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { MorningTable } from '@/components/finance/morning-table'
import { formatCurrency } from '@/lib/utils'
import { MONTHS_AR } from '@/types'
import type { SiteBudget } from '@/types'

interface SearchParams { month?: string; year?: string }

function parseIntInRange(value: string | undefined, min: number, max: number): number | null {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export interface MorningRow {
  siteId: string
  siteName: string
  plannedHeadcount: number
  actualHeadcount: number
  budgetPayroll: number
  actualPayroll: number
  budgetExpenses: number
  actualExpenses: number
  hasBudget: boolean
}

export default async function MorningPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()

  // The morning report is about *now*, so it defaults to the current month
  // rather than the latest month that happens to have data.
  const now = new Date()
  const month = parseIntInRange(params.month, 1, 12) ?? now.getMonth() + 1
  const year = parseIntInRange(params.year, 2000, 2100) ?? now.getFullYear()

  const [{ data: sites }, { data: employees }, { data: budgets }, { data: payrolls }, { data: expenses }] =
    await Promise.all([
      supabase.from('sites').select('*').eq('active', true).order('sort_order'),
      supabase.from('employees').select('site_id').eq('active', true),
      supabase.from('site_budgets').select('*').eq('month', month).eq('year', year),
      supabase.from('payroll_periods').select('site_id, total_gross').eq('month', month).eq('year', year),
      supabase.from('expense_reports').select('site_id, grand_total').eq('month', month).eq('year', year),
    ])

  const headcountBySite = new Map<string, number>()
  for (const e of employees ?? []) {
    headcountBySite.set(e.site_id, (headcountBySite.get(e.site_id) ?? 0) + 1)
  }
  const budgetBySite = new Map((budgets ?? []).map(b => [b.site_id, b as SiteBudget]))
  const payrollBySite = new Map<string, number>()
  for (const p of payrolls ?? []) {
    payrollBySite.set(p.site_id, (payrollBySite.get(p.site_id) ?? 0) + Number(p.total_gross ?? 0))
  }
  const expenseBySite = new Map<string, number>()
  for (const e of expenses ?? []) {
    expenseBySite.set(e.site_id, (expenseBySite.get(e.site_id) ?? 0) + Number(e.grand_total ?? 0))
  }

  const rows: MorningRow[] = (sites ?? []).map(s => {
    const b = budgetBySite.get(s.id)
    return {
      siteId: s.id,
      siteName: s.name_ar || s.name,
      plannedHeadcount: b?.planned_headcount ?? 0,
      actualHeadcount: headcountBySite.get(s.id) ?? 0,
      budgetPayroll: Number(b?.budget_payroll ?? 0),
      actualPayroll: payrollBySite.get(s.id) ?? 0,
      budgetExpenses: Number(b?.budget_expenses ?? 0),
      actualExpenses: expenseBySite.get(s.id) ?? 0,
      hasBudget: b != null,
    }
  })

  const totalPlanned = rows.reduce((s, r) => s + r.plannedHeadcount, 0)
  const totalActual = rows.reduce((s, r) => s + r.actualHeadcount, 0)
  const shortfallSites = rows.filter(r => r.plannedHeadcount > 0 && r.actualHeadcount < r.plannedHeadcount)
  const overBudgetSites = rows.filter(r => r.hasBudget && (
    (r.budgetPayroll > 0 && r.actualPayroll > r.budgetPayroll) ||
    (r.budgetExpenses > 0 && r.actualExpenses > r.budgetExpenses)
  ))
  const totalShortfall = shortfallSites.reduce((s, r) => s + (r.plannedHeadcount - r.actualHeadcount), 0)

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التقرير الصباحي</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            الأعداد في المواقع، العجوزات، والموازنة — {MONTHS_AR[month - 1]} {year}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500">الأفراد: الفعلي / المطلوب</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">
            {totalActual} <span className="text-base text-gray-400">/ {totalPlanned || '—'}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">مواقع بها عجز</p>
          <p className={`text-2xl font-bold mt-1 ${shortfallSites.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {shortfallSites.length}
          </p>
          {totalShortfall > 0 && <p className="text-xs text-red-500 mt-1">إجمالي العجز: {totalShortfall} فرد</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">مواقع تخطت الموازنة</p>
          <p className={`text-2xl font-bold mt-1 ${overBudgetSites.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {overBudgetSites.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">مصروفات الشهر (مرتبات + مصروفات)</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">
            {formatCurrency(rows.reduce((s, r) => s + r.actualPayroll + r.actualExpenses, 0))}
          </p>
        </Card>
      </div>

      <MorningTable rows={rows} month={month} year={year} />
    </div>
  )
}
