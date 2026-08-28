import { describe, it, expect } from 'vitest'
import { advanceBalance, advanceDueInstallment, dueByEmployee } from './advances'
import type { WorkerAdvance, AdvanceRepayment } from '@/types'

const repayment = (amount: number): AdvanceRepayment => ({
  id: `r-${amount}-${Math.random()}`,
  advance_id: 'a1', payroll_period_id: null,
  month: 1, year: 2026, amount, source: 'payroll', notes: null,
  created_at: '2026-01-01T00:00:00Z',
})

const advance = (over: Partial<WorkerAdvance> = {}): WorkerAdvance => ({
  id: 'a1',
  employee_id: 'e1',
  advance_type: 'holiday',
  amount: 1000,
  monthly_installment: 0,
  advance_date: '2026-01-01',
  status: 'active',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  repayments: [],
  ...over,
})

describe('advanceBalance', () => {
  it('is the full amount before anything is repaid', () => {
    expect(advanceBalance(advance({ amount: 1000 }))).toBe(1000)
  })

  it('subtracts every recorded repayment', () => {
    expect(advanceBalance(advance({ amount: 1000, repayments: [repayment(300), repayment(200)] }))).toBe(500)
  })

  it('reaches zero when fully repaid', () => {
    expect(advanceBalance(advance({ amount: 1000, repayments: [repayment(1000)] }))).toBe(0)
  })

  it('treats a missing repayments array as none loaded', () => {
    expect(advanceBalance(advance({ amount: 750, repayments: undefined }))).toBe(750)
  })
})

describe('advanceDueInstallment', () => {
  it('recovers a holiday advance in full', () => {
    expect(advanceDueInstallment(advance({ advance_type: 'holiday', amount: 1000 }))).toBe(1000)
  })

  it('recovers only the remaining balance of a part-paid holiday advance', () => {
    expect(advanceDueInstallment(advance({
      advance_type: 'holiday', amount: 1000, repayments: [repayment(600)],
    }))).toBe(400)
  })

  it('takes one installment from a long-term advance', () => {
    expect(advanceDueInstallment(advance({
      advance_type: 'long_term', amount: 1200, monthly_installment: 200,
    }))).toBe(200)
  })

  it('never takes more than the balance on the final installment', () => {
    expect(advanceDueInstallment(advance({
      advance_type: 'long_term', amount: 1200, monthly_installment: 500,
      repayments: [repayment(1000)],
    }))).toBe(200)
  })

  it('falls back to the whole balance when no installment is set', () => {
    expect(advanceDueInstallment(advance({
      advance_type: 'long_term', amount: 800, monthly_installment: 0,
    }))).toBe(800)
  })

  it('is zero once the advance is settled', () => {
    expect(advanceDueInstallment(advance({ amount: 500, repayments: [repayment(500)] }))).toBe(0)
  })

  it('is zero — never negative — if repayments overshoot', () => {
    expect(advanceDueInstallment(advance({ amount: 500, repayments: [repayment(600)] }))).toBe(0)
  })
})

describe('dueByEmployee', () => {
  it('sums every active advance a worker holds', () => {
    const due = dueByEmployee([
      advance({ id: 'a1', employee_id: 'e1', advance_type: 'holiday', amount: 500 }),
      advance({ id: 'a2', employee_id: 'e1', advance_type: 'long_term', amount: 1200, monthly_installment: 200 }),
    ])
    expect(due.get('e1')).toBe(700)
  })

  it('keeps workers separate', () => {
    const due = dueByEmployee([
      advance({ id: 'a1', employee_id: 'e1', amount: 500 }),
      advance({ id: 'a2', employee_id: 'e2', amount: 300 }),
    ])
    expect(due.get('e1')).toBe(500)
    expect(due.get('e2')).toBe(300)
  })

  it('ignores settled and cancelled advances', () => {
    const due = dueByEmployee([
      advance({ id: 'a1', employee_id: 'e1', amount: 500, status: 'settled' }),
      advance({ id: 'a2', employee_id: 'e1', amount: 300, status: 'cancelled' }),
      advance({ id: 'a3', employee_id: 'e1', amount: 100, status: 'active' }),
    ])
    expect(due.get('e1')).toBe(100)
  })

  it('returns nothing for a worker with no active advances', () => {
    expect(dueByEmployee([advance({ status: 'settled' })]).get('e1')).toBeUndefined()
  })
})
