'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

export function SignOutButton() {
  const { t } = useTranslation()
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleSignOut() {
    setIsPending(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenuItem onSelect={handleSignOut} disabled={isPending} variant="destructive">
      <LogOut className="size-4" aria-hidden="true" />
      {t('nav.signOut')}
    </DropdownMenuItem>
  )
}
