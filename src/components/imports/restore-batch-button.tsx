'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { Button } from '@/components/ui/button'

export function RestoreBatchButton({ batchId }: { batchId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleRestore() {
    if (!window.confirm(t('imports.restoreConfirm'))) return
    setIsPending(true)
    try {
      const res = await fetch(`/api/imports/${batchId}/restore`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'restore failed')
      toast.success(t('imports.restoreSuccess'))
      router.refresh()
    } catch {
      toast.error(t('imports.restoreError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleRestore} disabled={isPending}>
      <RotateCcw className="size-3.5" aria-hidden="true" />
      {t('imports.restore')}
    </Button>
  )
}
