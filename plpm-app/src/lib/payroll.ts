// The payroll formula. It decides what every worker is paid, so it lives here
// rather than inside the table component: it is the one piece of logic in this
// app that most needs to be readable and directly testable.

export interface PayrollInputs {
  net_days: number
  holiday_extra_days: number
  overtime_hours: number
  less_hours: number
  daily_wage: number
  bonuses: number
  transportation_amount: number
  advance: number
  insurance: number
  deductions: number
  penalties: number
}

/** Hours in a standard working day, used to price overtime and short hours. */
export const HOURS_PER_DAY = 8

/**
 * Rounds to piastres, half away from zero.
 *
 * The obvious `Math.round(x * 100) / 100` is wrong for currency: 1.005 * 100
 * is 100.49999999999999 in binary floating point, so an exact half rounds
 * *down* and every such amount loses a piastre. Scaling through the decimal
 * string sidesteps that, because JavaScript prints the shortest representation
 * that round-trips ("1.005") and re-parsing it at the shifted exponent lands on
 * 100.5 exactly.
 */
export function round2(x: number): number {
  if (!Number.isFinite(x)) return 0
  const scaled = Number(`${x}e2`)
  // Very large or exponent-formatted values fall back to plain arithmetic.
  if (!Number.isFinite(scaled)) return Math.round(x * 100) / 100
  // Math.round breaks ties toward +Infinity, which would round -1.005 to -1.00
  // while rounding 1.005 to 1.01. Round the magnitude and restore the sign.
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled))
  return Number(`${rounded}e-2`)
}

/**
 * gross = (net days + holiday extra days) × daily wage
 *       + (overtime hours − less hours) × (daily wage ÷ 8)
 *       + bonuses + transport allowance
 * net   = gross − advance − insurance − deductions − penalties
 */
export function calcPayrollTotals(input: PayrollInputs): { gross: number; net: number } {
  const hourlyRate = input.daily_wage / HOURS_PER_DAY
  const gross =
    (input.net_days + input.holiday_extra_days) * input.daily_wage +
    (input.overtime_hours - input.less_hours) * hourlyRate +
    input.bonuses +
    input.transportation_amount
  const net =
    gross - input.advance - input.insurance - input.deductions - input.penalties
  return { gross: round2(gross), net: round2(net) }
}

/** Parses a form field that may be blank or malformed; blank means zero. */
export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : 0
}
