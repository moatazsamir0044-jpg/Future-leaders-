export { cn } from 'cn'

// Kept for src/lib/export/{pdf,excel}.ts (reused wholesale from the old app
// per the plan — not wired into any UI yet this phase, but still needs to
// typecheck). Do not remove without checking those two files first.
import { MONTHS } from '@/types'

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatMonthYear(month: number, year: number): string {
  return `${MONTHS[month - 1]} ${year}`
}
