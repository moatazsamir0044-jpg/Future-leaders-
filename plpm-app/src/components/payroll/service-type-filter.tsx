'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const TYPES = [
  { value: '', label: 'All' },
  { value: 'hk', label: 'HK' },
  { value: 'ls', label: 'LS' },
  { value: 'fm', label: 'FM' },
  { value: 'other', label: 'Other' },
]

export function ServiceTypeFilter({ current }: { current: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback((type: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (type) params.set('type', type)
    else params.delete('type')
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 bg-gray-50/80">
      {TYPES.map(t => (
        <button
          key={t.value}
          onClick={() => update(t.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            current === t.value
              ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
