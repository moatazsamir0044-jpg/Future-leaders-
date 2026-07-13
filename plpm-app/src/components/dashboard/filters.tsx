'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MONTHS } from '@/types'
import { useCallback } from 'react'

export interface FilterSite {
  id: string
  name: string
  service_type: string
}

const TYPE_OPTIONS = [
  { value: 'hk', label: 'HK' },
  { value: 'ls', label: 'LS' },
  { value: 'fm', label: 'FM' },
  { value: 'other', label: 'Other' },
]

const selectCls = 'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function DashboardFilters({ currentMonth, currentYear, sites, currentSite, currentType }: {
  currentMonth: number
  currentYear: number
  sites?: FilterSite[]
  currentSite?: string
  currentType?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const siteOptions = (sites ?? []).filter(s => !currentType || s.service_type === currentType)

  function handleTypeChange(type: string) {
    // Drop a selected site that doesn't belong to the newly picked type
    const selected = (sites ?? []).find(s => s.id === currentSite)
    const keepSite = selected && (!type || selected.service_type === type)
    update({ type: type || null, site: keepSite ? currentSite ?? null : null })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={currentMonth}
        onChange={e => update({ month: e.target.value })}
        aria-label="Month"
        className={selectCls}
      >
        {MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        value={currentYear}
        onChange={e => update({ year: e.target.value })}
        aria-label="Year"
        className={selectCls}
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      {sites && (
        <>
          <select
            value={currentType ?? ''}
            onChange={e => handleTypeChange(e.target.value)}
            aria-label="Service type"
            className={selectCls}
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={currentSite ?? ''}
            onChange={e => update({ site: e.target.value || null })}
            aria-label="Site"
            className={`${selectCls} max-w-[180px]`}
          >
            <option value="">All Sites</option>
            {siteOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </>
      )}
    </div>
  )
}
