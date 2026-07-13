'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { advanceBalance, advanceDueInstallment } from '@/lib/advances'
import { formatCurrency, currentMonthYear } from '@/lib/utils'
import { Plus, HandCoins, History, Ban } from 'lucide-react'
import type { Site, Employee, WorkerAdvance, AdvanceType } from '@/types'
import { ADVANCE_TYPE_LABELS, ADVANCE_STATUS_LABELS, MONTHS } from '@/types'

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  active: 'info',
  settled: 'success',
  cancelled: 'default',
}

const today = () => new Date().toISOString().slice(0, 10)
const inputCls = 'h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function AdvanceManager({ advances: initial, sites }: { advances: WorkerAdvance[]; sites: Site[] }) {
  const router = useRouter()
  const toast = useToast()
  const [advances, setAdvances] = useState(initial)
  const [showClosed, setShowClosed] = useState(false)

  // New advance modal
  const [newOpen, setNewOpen] = useState(false)
  const [siteId, setSiteId] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [advanceType, setAdvanceType] = useState<AdvanceType>('holiday')
  const [amount, setAmount] = useState('')
  const [installment, setInstallment] = useState('')
  const [advanceDate, setAdvanceDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Detail / repayment modal
  const [detail, setDetail] = useState<WorkerAdvance | null>(null)
  const [repayAmount, setRepayAmount] = useState('')
  const [repayMonth, setRepayMonth] = useState(currentMonthYear().month)
  const [repayYear, setRepayYear] = useState(currentMonthYear().year)
  const [repaySaving, setRepaySaving] = useState(false)
  const [repayError, setRepayError] = useState('')

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<WorkerAdvance | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const visible = showClosed ? advances : advances.filter(a => a.status === 'active')

  function openNew() {
    setSiteId(''); setEmployees([]); setEmployeeId(''); setAdvanceType('holiday')
    setAmount(''); setInstallment(''); setAdvanceDate(today()); setNotes(''); setError('')
    setNewOpen(true)
  }

  async function handleSiteChange(id: string) {
    setSiteId(id); setEmployeeId(''); setEmployees([])
    if (!id) return
    const supabase = createClient()
    const { data } = await supabase.from('employees')
      .select('id, name, worker_number')
      .eq('site_id', id).eq('active', true)
      .order('worker_number')
    setEmployees((data ?? []) as Employee[])
  }

  async function handleCreate() {
    if (!employeeId) { setError('Select a worker'); return }
    const amountNum = parseFloat(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) { setError('Enter a valid amount'); return }
    const installmentNum = parseFloat(installment) || 0
    if (advanceType === 'long_term' && installmentNum <= 0) { setError('Long-term advances need a monthly installment'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase.from('worker_advances').insert({
      employee_id: employeeId,
      advance_type: advanceType,
      amount: amountNum,
      monthly_installment: advanceType === 'long_term' ? installmentNum : 0,
      advance_date: advanceDate,
      notes: notes.trim() || null,
      status: 'active',
    }).select('*, employee:employees(id, name, worker_number, site:sites(id, name))').single()
    if (err) { setError(err.message); setSaving(false); return }
    setAdvances(prev => [{ ...data, repayments: [] } as WorkerAdvance, ...prev])
    toast(`Advance recorded for ${data.employee?.name ?? 'worker'}`)
    setSaving(false); setNewOpen(false)
    router.refresh()
  }

  function openDetail(a: WorkerAdvance) {
    setDetail(a)
    setRepayAmount(String(advanceDueInstallment(a) || advanceBalance(a) || ''))
    const now = currentMonthYear()
    setRepayMonth(now.month); setRepayYear(now.year)
    setRepayError('')
  }

  async function handleCashRepayment() {
    if (!detail) return
    const amountNum = parseFloat(repayAmount)
    const balance = advanceBalance(detail)
    if (!Number.isFinite(amountNum) || amountNum <= 0) { setRepayError('Enter a valid amount'); return }
    if (amountNum > balance) { setRepayError(`Amount exceeds the remaining balance (${formatCurrency(balance)})`); return }
    setRepaySaving(true); setRepayError('')
    const supabase = createClient()
    const { data, error: err } = await supabase.from('advance_repayments').insert({
      advance_id: detail.id,
      month: repayMonth,
      year: repayYear,
      amount: amountNum,
      source: 'cash',
    }).select().single()
    if (err) { setRepayError(err.message); setRepaySaving(false); return }

    let updated: WorkerAdvance = { ...detail, repayments: [...(detail.repayments ?? []), data] }
    if (advanceBalance(updated) <= 0) {
      const { error: setErr } = await supabase.from('worker_advances')
        .update({ status: 'settled' }).eq('id', detail.id)
      if (!setErr) updated = { ...updated, status: 'settled' }
    }
    setAdvances(prev => prev.map(a => a.id === detail.id ? updated : a))
    setDetail(updated)
    setRepayAmount(String(advanceDueInstallment(updated) || ''))
    toast(updated.status === 'settled' ? 'Repayment recorded — advance fully settled' : 'Repayment recorded')
    setRepaySaving(false)
    router.refresh()
  }

  async function handleCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('worker_advances')
      .update({ status: 'cancelled' }).eq('id', cancelTarget.id)
    setCancelling(false)
    if (err) { toast(`Could not cancel: ${err.message}`, 'error'); return }
    setAdvances(prev => prev.map(a => a.id === cancelTarget.id ? { ...a, status: 'cancelled' } : a))
    toast('Advance cancelled — its balance is written off')
    setCancelTarget(null)
    router.refresh()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-blue-600" />
            Advance Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Show settled &amp; cancelled
            </label>
            <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> New Advance</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Worker</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Repaid</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Balance</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Due / Month</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="px-3 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                      <HandCoins className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-gray-500">No {showClosed ? '' : 'active '}advances</p>
                      <p className="text-sm mt-1">Record holiday (Eid) advances and long-term installment advances with &quot;New Advance&quot;.</p>
                    </td>
                  </tr>
                ) : visible.map(a => {
                  const balance = advanceBalance(a)
                  const repaid = Number(a.amount) - balance
                  return (
                    <tr key={a.id} className={`hover:bg-gray-50/50 ${a.status !== 'active' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {a.employee?.name ?? '—'}
                        {a.employee?.worker_number != null && <span className="text-xs text-gray-400 ml-1.5">#{a.employee.worker_number}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{a.employee?.site?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{ADVANCE_TYPE_LABELS[a.advance_type]}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{a.advance_date}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatCurrency(a.amount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatCurrency(repaid)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(balance)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                        {a.status === 'active' ? formatCurrency(advanceDueInstallment(a)) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={STATUS_VARIANT[a.status]}>{ADVANCE_STATUS_LABELS[a.status]}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openDetail(a)} aria-label="Repayments"
                            className="text-gray-400 hover:text-blue-600 p-1 rounded" title="Repayment history / record cash repayment">
                            <History className="h-3.5 w-3.5" />
                          </button>
                          {a.status === 'active' && (
                            <button onClick={() => setCancelTarget(a)} aria-label="Cancel advance"
                              className="text-gray-400 hover:text-red-600 p-1 rounded" title="Cancel (write off)">
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* New advance */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New Advance — سلفة جديدة" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Site *</label>
              <select value={siteId} onChange={e => handleSiteChange(e.target.value)} className={`w-full ${inputCls}`}>
                <option value="">Select site…</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Worker *</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={!siteId}
                className={`w-full ${inputCls} disabled:bg-gray-50`}>
                <option value="">{siteId ? (employees.length ? 'Select worker…' : 'No active workers') : 'Pick a site first'}</option>
                {employees.map(e => <option key={e.id} value={e.id}>#{e.worker_number} — {e.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={advanceType} onChange={e => setAdvanceType(e.target.value as AdvanceType)} className={`w-full ${inputCls}`}>
                {(Object.keys(ADVANCE_TYPE_LABELS) as AdvanceType[]).map(t => (
                  <option key={t} value={t}>{ADVANCE_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {advanceType === 'holiday'
                  ? 'Recovered in full from the next payroll sheet.'
                  : 'Deducted monthly by the installment until settled.'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (EGP) *</label>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={`w-full ${inputCls}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {advanceType === 'long_term' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Installment (EGP) *</label>
                <input type="number" min="0" value={installment} onChange={e => setInstallment(e.target.value)} className={`w-full ${inputCls}`} />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Advance Date</label>
              <input type="date" value={advanceDate} onChange={e => setAdvanceDate(e.target.value)} className={`w-full ${inputCls}`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Record Advance</Button>
          </div>
        </div>
      </Modal>

      {/* Repayment history + cash repayment */}
      <Modal open={detail !== null} onClose={() => setDetail(null)}
        title={detail ? `${detail.employee?.name ?? 'Advance'} — Repayments` : ''} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm bg-gray-50/70 rounded-lg px-4 py-3">
              <div>
                <p className="text-xs text-gray-500">Advance</p>
                <p className="font-mono font-semibold">{formatCurrency(detail.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Repaid</p>
                <p className="font-mono font-semibold text-green-700">{formatCurrency(Number(detail.amount) - advanceBalance(detail))}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Balance</p>
                <p className="font-mono font-bold">{formatCurrency(advanceBalance(detail))}</p>
              </div>
            </div>

            {(detail.repayments ?? []).length > 0 ? (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Period</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Source</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...(detail.repayments ?? [])]
                      .sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
                      .map(r => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-gray-700">{MONTHS[r.month - 1]} {r.year}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{r.source === 'payroll' ? 'Payroll deduction' : 'Cash'}</td>
                          <td className="px-4 py-2 text-right font-mono text-gray-700">{formatCurrency(r.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No repayments yet. Payroll deductions appear here when the sheet is approved.</p>
            )}

            {detail.status === 'active' && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Record cash repayment (outside payroll)</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (EGP)</label>
                    <input type="number" min="0" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} className={`w-full ${inputCls}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
                    <select value={repayMonth} onChange={e => setRepayMonth(parseInt(e.target.value))} className={`w-full ${inputCls}`}>
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                    <select value={repayYear} onChange={e => setRepayYear(parseInt(e.target.value))} className={`w-full ${inputCls}`}>
                      {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {repayError && <p className="text-sm text-red-600">{repayError}</p>}
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleCashRepayment} loading={repaySaving}>Record Repayment</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this advance?"
        message={cancelTarget ? `The remaining balance of ${formatCurrency(advanceBalance(cancelTarget))} EGP for ${cancelTarget.employee?.name ?? 'this worker'} will be written off and no longer deducted from payroll.` : ''}
        confirmLabel="Cancel Advance"
        loading={cancelling}
        onConfirm={handleCancel}
        onClose={() => setCancelTarget(null)}
      />
    </>
  )
}
