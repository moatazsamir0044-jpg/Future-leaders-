import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { MONTHS } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

export function getMonthYearOptions(count = 24): { month: number; year: number; label: string }[] {
  const now = new Date()
  const options = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({ month: d.getMonth() + 1, year: d.getFullYear(), label: formatMonthYear(d.getMonth() + 1, d.getFullYear()) })
  }
  return options
}

export function currentMonthYear(): { month: number; year: number } {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export function serviceTypeLabel(type: string): string {
  const map: Record<string, string> = { hk: 'Housekeeping', ls: 'Landscaping', fm: 'Facility Mgmt', other: 'Other' }
  return map[type] ?? type
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 border-gray-200',
    submitted: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}
