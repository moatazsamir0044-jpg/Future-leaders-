'use client'

import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 mb-4">
          <AlertTriangle className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-500 mt-2">
          The page could not be loaded. This is usually temporary — try again, and if it keeps happening contact your administrator.
        </p>
        {error?.message && (
          <p className="text-xs text-gray-400 mt-2 font-mono break-all">{error.message}</p>
        )}
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button onClick={reset}>Try again</Button>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
