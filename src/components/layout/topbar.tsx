'use client'

import { User } from 'lucide-react'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { LocaleToggle } from '@/components/i18n/locale-toggle'
import { SignOutButton } from '@/components/auth/sign-out-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export function Topbar({ userEmail }: { userEmail: string | null }) {
  const { t } = useTranslation()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:px-6">
      <span className="text-sm font-semibold md:hidden">{t('app.name')}</span>
      <div className="flex flex-1 items-center justify-end gap-2">
        <LocaleToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={userEmail ?? ''}>
              <User className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {userEmail ? (
              <>
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground" dir="ltr">
                  {userEmail}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <SignOutButton />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
