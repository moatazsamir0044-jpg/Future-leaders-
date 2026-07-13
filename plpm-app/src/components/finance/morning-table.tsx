'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Sunrise, Pencil, AlertTriangle, CopyPlus } from 'lucide-react'
import { MONTHS_AR } from '@/types'
import type { MorningRow } from '@/app/dashboard/morning/page'

const inputCls = 'h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function MorningTable({ rows, month, year }: { rows: MorningRow[]; month: number; year: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()

  const [editing, setEditing] = useState<MorningRow | null>(null)
  const [planned, setPlanned] = useState('')
  const [budgetPayroll, setBudgetPayroll] = useState('')
  const [budgetExpenses, setBudgetExpenses] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copying, setCopying] = useState(false)

  const hasAnyBudget = rows.some(r => r.hasBudget)

  function changePeriod(m: number, y: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', String(m))
    params.set('year', String(y))
    router.push(`${pathname}?${params.toString()}`)
  }

  function openEdit(r: MorningRow) {
    setEditing(r)
    setPlanned(r.hasBudget ? String(r.plannedHeadcount) : '')
    setBudgetPayroll(r.hasBudget ? String(r.budgetPayroll) : '')
    setBudgetExpenses(r.hasBudget ? String(r.budgetExpenses) : '')
    setError('')
  }

  async function handleSave() {
    if (!editing) return
    setSaving(true); setError('')
    const supabase = createClient()
    const { error: err } = await supabase.from('site_budgets').upsert({
      site_id: editing.siteId,
      month, year,
      planned_headcount: parseInt(planned) || 0,
      budget_payroll: parseFloat(budgetPayroll) || 0,
      budget_expenses: parseFloat(budgetExpenses) || 0,
    }, { onConflict: 'site_id,year,month' })
    setSaving(false)
    if (err) { setError(err.message); return }
    toast(`تم حفظ موازنة ${editing.siteName}`)
    setEditing(null)
    router.refresh()
  }

  async function handleCopyPrevious() {
    setCopying(true)
    const supabase = createClient()
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const { data: prev, error: prevErr } = await supabase.from('site_budgets')
      .select('site_id, planned_headcount, budget_payroll, budget_expenses')
      .eq('month', prevMonth).eq('year', prevYear)
    if (prevErr) { toast(`تعذر النسخ: ${prevErr.message}`, 'error'); setCopying(false); return }
    if (!prev || prev.length === 0) {
      toast(`لا توجد موازنات في ${MONTHS_AR[prevMonth - 1]} ${prevYear} للنسخ منها`, 'error')
      setCopying(false)
      return
    }
    const { error: upErr } = await supabase.from('site_budgets').upsert(
      prev.map(b => ({ ...b, month, year })),
      { onConflict: 'site_id,year,month' },
    )
    setCopying(false)
    if (upErr) { toast(`تعذر النسخ: ${upErr.message}`, 'error'); return }
    toast(`تم نسخ موازنات ${prev.length} موقع من ${MONTHS_AR[prevMonth - 1]}`)
    router.refresh()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sunrise className="h-4 w-4 text-amber-500" />
            المواقع — الأعداد والموازنة
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <select value={month} onChange={e => changePeriod(parseInt(e.target.value), year)}
                aria-label="الشهر" className={inputCls}>
                {MONTHS_AR.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => changePeriod(month, parseInt(e.target.value))}
                aria-label="السنة" className={inputCls}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {!hasAnyBudget && (
              <Button size="sm" variant="outline" onClick={handleCopyPrevious} loading={copying}>
                <CopyPlus className="h-3.5 w-3.5" /> نسخ موازنة الشهر السابق
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100">
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">الموقع</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">المطلوب</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">الفعلي</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">العجز</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">موازنة المرتبات</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">مرتبات فعلية</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">موازنة المصروفات</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">مصروفات فعلية</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">الحالة</th>
                  <th className="px-3 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                      لا توجد مواقع نشطة.
                    </td>
                  </tr>
                ) : rows.map(r => {
                  const shortfall = r.plannedHeadcount > 0 ? r.plannedHeadcount - r.actualHeadcount : 0
                  const payrollOver = r.budgetPayroll > 0 && r.actualPayroll > r.budgetPayroll
                  const expensesOver = r.budgetExpenses > 0 && r.actualExpenses > r.budgetExpenses
                  const overBudget = payrollOver || expensesOver
                  return (
                    <tr key={r.siteId} className={`hover:bg-gray-50/50 ${shortfall > 0 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.siteName}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-700">{r.plannedHeadcount || '—'}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-900 font-semibold">{r.actualHeadcount}</td>
                      <td className="px-4 py-2.5 text-center">
                        {shortfall > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-bold font-mono">
                            <AlertTriangle className="h-3.5 w-3.5" /> {shortfall}
                          </span>
                        ) : r.plannedHeadcount > 0 ? (
                          <span className="text-green-600 font-mono">0</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-600">
                        {r.budgetPayroll > 0 ? formatCurrency(r.budgetPayroll) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-mono ${payrollOver ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                        {r.actualPayroll > 0 ? formatCurrency(r.actualPayroll) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-600">
                        {r.budgetExpenses > 0 ? formatCurrency(r.budgetExpenses) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-mono ${expensesOver ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                        {r.actualExpenses > 0 ? formatCurrency(r.actualExpenses) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {!r.hasBudget ? (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">بدون موازنة</span>
                        ) : overBudget ? (
                          <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded font-medium">تخطت الموازنة</span>
                        ) : (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-medium">داخل الموازنة</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => openEdit(r)} aria-label={`تعديل موازنة ${r.siteName}`}
                          className="text-gray-400 hover:text-blue-600 p-1 rounded">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 px-5 py-3 border-t border-gray-50">
            الفعلي = عدد العاملين النشطين في كشف الموقع. المرتبات والمصروفات الفعلية = إجمالي كشوف الشهر المسجلة في النظام.
          </p>
        </CardContent>
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)}
        title={editing ? `موازنة ${editing.siteName} — ${MONTHS_AR[month - 1]} ${year}` : ''} size="sm">
        {editing && (
          <div className="space-y-4" dir="rtl">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">العدد المطلوب (أفراد)</label>
              <input type="number" min="0" value={planned} onChange={e => setPlanned(e.target.value)}
                className={`w-full ${inputCls}`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">موازنة المرتبات (جنيه)</label>
                <input type="number" min="0" value={budgetPayroll} onChange={e => setBudgetPayroll(e.target.value)}
                  className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">موازنة المصروفات (جنيه)</label>
                <input type="number" min="0" value={budgetExpenses} onChange={e => setBudgetExpenses(e.target.value)}
                  className={`w-full ${inputCls}`} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              <Button onClick={handleSave} loading={saving}>حفظ</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
