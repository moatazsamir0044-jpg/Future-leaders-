import { createClient } from '@/lib/supabase/client'
import type { WorkerAdvance } from '@/types'

/** Outstanding balance of an advance. Requires `repayments` to be loaded. */
export function advanceBalance(a: WorkerAdvance): number {
  const repaid = (a.repayments ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  return Number(a.amount) - repaid
}

/**
 * What should be deducted from the next payroll for this advance.
 * Holiday advances are recovered in full; long-term ones by their
 * monthly installment (never more than the remaining balance).
 */
export function advanceDueInstallment(a: WorkerAdvance): number {
  const balance = advanceBalance(a)
  if (balance <= 0) return 0
  if (a.advance_type === 'holiday') return balance
  const installment = Number(a.monthly_installment) || 0
  return installment > 0 ? Math.min(installment, balance) : balance
}

/**
 * Total advance deduction due next payroll per employee, oldest advances
 * first. Used to prefill the payroll sheet's advance column.
 */
export function dueByEmployee(advances: WorkerAdvance[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of advances) {
    if (a.status !== 'active') continue
    map.set(a.employee_id, (map.get(a.employee_id) ?? 0) + advanceDueInstallment(a))
  }
  return map
}

/**
 * Record advance repayments from an approved payroll sheet: each record's
 * advance deduction is allocated against the worker's active advances,
 * oldest first, capped at each advance's remaining balance. Fully repaid
 * advances are marked settled. Idempotent — repayments previously recorded
 * for this period are replaced.
 */
export async function applyPayrollAdvanceRepayments(periodId: string): Promise<string | null> {
  const supabase = createClient()

  const [{ data: period, error: periodErr }, { data: records, error: recErr }] = await Promise.all([
    supabase.from('payroll_periods').select('id, month, year').eq('id', periodId).single(),
    supabase.from('payroll_records')
      .select('employee_id, advance')
      .eq('period_id', periodId)
      .gt('advance', 0)
      .not('employee_id', 'is', null),
  ])
  if (periodErr) return periodErr.message
  if (recErr) return recErr.message
  if (!records || records.length === 0) return null

  // Replace anything a previous approval of this period recorded
  const { error: clearErr } = await supabase.from('advance_repayments')
    .delete().eq('payroll_period_id', periodId)
  if (clearErr) return clearErr.message

  const employeeIds = records.map(r => r.employee_id as string)
  const { data: advances, error: advErr } = await supabase.from('worker_advances')
    .select('*, repayments:advance_repayments(id, amount)')
    .eq('status', 'active')
    .in('employee_id', employeeIds)
    .order('advance_date', { ascending: true })
  if (advErr) return advErr.message
  if (!advances || advances.length === 0) return null

  const byEmployee = new Map<string, WorkerAdvance[]>()
  for (const a of advances as WorkerAdvance[]) {
    const list = byEmployee.get(a.employee_id) ?? []
    list.push(a)
    byEmployee.set(a.employee_id, list)
  }

  const inserts: Record<string, unknown>[] = []
  const settledIds: string[] = []
  for (const rec of records) {
    let remaining = Number(rec.advance ?? 0)
    for (const adv of byEmployee.get(rec.employee_id as string) ?? []) {
      if (remaining <= 0) break
      const balance = advanceBalance(adv)
      if (balance <= 0) continue
      const pay = Math.min(remaining, balance)
      inserts.push({
        advance_id: adv.id,
        payroll_period_id: periodId,
        month: period.month,
        year: period.year,
        amount: pay,
        source: 'payroll',
      })
      if (pay >= balance) settledIds.push(adv.id)
      remaining -= pay
    }
  }
  if (inserts.length === 0) return null

  const { error: insErr } = await supabase.from('advance_repayments').insert(inserts)
  if (insErr) return insErr.message

  if (settledIds.length > 0) {
    const { error: setErr } = await supabase.from('worker_advances')
      .update({ status: 'settled' }).in('id', settledIds)
    if (setErr) return setErr.message
  }
  return null
}

/**
 * Undo the repayments an approval recorded, used when a payroll sheet is
 * reset to draft. Advances that were settled by those repayments go back
 * to active.
 */
export async function revertPayrollAdvanceRepayments(periodId: string): Promise<string | null> {
  const supabase = createClient()

  const { data: repayments, error: repErr } = await supabase.from('advance_repayments')
    .select('advance_id').eq('payroll_period_id', periodId)
  if (repErr) return repErr.message
  if (!repayments || repayments.length === 0) return null

  const advanceIds = Array.from(new Set(repayments.map(r => r.advance_id)))
  const { error: delErr } = await supabase.from('advance_repayments')
    .delete().eq('payroll_period_id', periodId)
  if (delErr) return delErr.message

  // Reopen advances that are no longer fully repaid
  const { data: affected, error: affErr } = await supabase.from('worker_advances')
    .select('*, repayments:advance_repayments(id, amount)')
    .in('id', advanceIds)
    .eq('status', 'settled')
  if (affErr) return affErr.message
  const reopenIds = ((affected ?? []) as WorkerAdvance[])
    .filter(a => advanceBalance(a) > 0)
    .map(a => a.id)
  if (reopenIds.length > 0) {
    const { error: reopenErr } = await supabase.from('worker_advances')
      .update({ status: 'active' }).in('id', reopenIds)
    if (reopenErr) return reopenErr.message
  }
  return null
}
