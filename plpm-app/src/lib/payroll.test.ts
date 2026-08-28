import { describe, it, expect } from 'vitest'
import { calcPayrollTotals, toNumber, round2, HOURS_PER_DAY, type PayrollInputs } from './payroll'

const base: PayrollInputs = {
  net_days: 0, holiday_extra_days: 0, overtime_hours: 0, less_hours: 0,
  daily_wage: 0, bonuses: 0, transportation_amount: 0,
  advance: 0, insurance: 0, deductions: 0, penalties: 0,
}
const inputs = (over: Partial<PayrollInputs>): PayrollInputs => ({ ...base, ...over })

describe('calcPayrollTotals', () => {
  it('pays worked days at the daily wage', () => {
    expect(calcPayrollTotals(inputs({ net_days: 26, daily_wage: 200 })).gross).toBe(5200)
  })

  it('pays holiday extra days at the same daily wage', () => {
    const { gross } = calcPayrollTotals(inputs({ net_days: 26, holiday_extra_days: 2, daily_wage: 200 }))
    expect(gross).toBe(5600)
  })

  it('prices an overtime hour at an eighth of the daily wage', () => {
    const { gross } = calcPayrollTotals(inputs({ daily_wage: 240, overtime_hours: 8 }))
    expect(gross).toBe(240)
    expect(240 / HOURS_PER_DAY).toBe(30)
  })

  it('docks short hours at the same hourly rate', () => {
    const { gross } = calcPayrollTotals(inputs({ net_days: 10, daily_wage: 240, less_hours: 4 }))
    expect(gross).toBe(2400 - 120)
  })

  it('adds bonuses and the transport allowance to gross', () => {
    const { gross } = calcPayrollTotals(inputs({
      net_days: 20, daily_wage: 100, bonuses: 300, transportation_amount: 450,
    }))
    expect(gross).toBe(2750)
  })

  it('subtracts every deduction to reach net', () => {
    const { gross, net } = calcPayrollTotals(inputs({
      net_days: 26, daily_wage: 200,
      advance: 500, insurance: 150, deductions: 75, penalties: 25,
    }))
    expect(gross).toBe(5200)
    expect(net).toBe(5200 - 500 - 150 - 75 - 25)
  })

  it('rounds to piastres rather than leaving binary float noise', () => {
    // 0.1 + 0.2 style drift: 3 days at 33.33 is 99.99, not 99.98999999999999
    const { gross } = calcPayrollTotals(inputs({ net_days: 3, daily_wage: 33.33 }))
    expect(gross).toBe(99.99)
    expect(Number.isInteger(gross * 100)).toBe(true)
  })

  it('handles half-day attendance, which the form allows', () => {
    expect(calcPayrollTotals(inputs({ net_days: 25.5, daily_wage: 200 })).gross).toBe(5100)
  })

  it('lets net go negative when deductions exceed earnings', () => {
    // Recovering a large advance can legitimately wipe out a month's pay; the
    // figure must not be silently clamped to zero.
    const { net } = calcPayrollTotals(inputs({ net_days: 5, daily_wage: 100, advance: 900 }))
    expect(net).toBe(-400)
  })

  it('is zero for an untouched row', () => {
    expect(calcPayrollTotals(base)).toEqual({ gross: 0, net: 0 })
  })

  it('never yields NaN when the daily wage is zero', () => {
    const { gross, net } = calcPayrollTotals(inputs({ overtime_hours: 5, daily_wage: 0 }))
    expect(gross).toBe(0)
    expect(net).toBe(0)
  })
})

describe('toNumber', () => {
  it('treats a blank field as zero', () => {
    expect(toNumber('')).toBe(0)
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
  })

  it('treats unparseable text as zero rather than NaN', () => {
    expect(toNumber('abc')).toBe(0)
  })

  it('parses decimals and negatives', () => {
    expect(toNumber('12.5')).toBe(12.5)
    expect(toNumber('-3')).toBe(-3)
  })

  it('rejects non-finite numbers', () => {
    expect(toNumber(Infinity)).toBe(0)
    expect(toNumber(NaN)).toBe(0)
  })
})

describe('round2', () => {
  it('rounds to the nearest piastre', () => {
    expect(round2(2.344)).toBe(2.34)
    expect(round2(2.346)).toBe(2.35)
    expect(round2(99.99)).toBe(99.99)
    expect(round2(0)).toBe(0)
  })

  it('rounds an exact half away from zero', () => {
    // Math.round(1.005 * 100) is 100, not 101, because 1.005 * 100 evaluates
    // to 100.49999999999999 — every exact half used to lose a piastre.
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.345)).toBe(2.35)
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(-2.345)).toBe(-2.35)
  })

  it('is symmetric about zero', () => {
    for (const x of [1.005, 2.345, 0.125, 7.891, 1234.567]) {
      expect(round2(-x)).toBe(-round2(x))
    }
  })

  it('returns zero rather than NaN for non-finite input', () => {
    expect(round2(NaN)).toBe(0)
    expect(round2(Infinity)).toBe(0)
  })
})
