'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MONTHS, SERVICE_TYPE_LABELS, type ServiceType } from '@/types'
import { useCallback } from 'react'

const SERVICE_TYPES = Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]

export function DashboardFilters({
  currentMonth,
  currentYear,
  currentType,
}: {
  currentMonth: number
  currentYear: number
  currentType?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentMonth}
        onChange={e => update('month', e.target.value)}
        aria-label="Month"
        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        value={currentYear}
        onChange={e => update('year', e.target.value)}
        aria-label="Year"
        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      {currentType !== undefined && (
        <select
          value={currentType}
          onChange={e => update('type', e.target.value)}
          aria-label="Service type"
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Types</option>
          {SERVICE_TYPES.map(t => (
            <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]} ({t.toUpperCase()})</option>
          ))}
        </select>
      )}
    </div>
  )
}
