'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Search, Upload } from 'lucide-react'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { cn } from '@/lib/utils'
import type { TranslationKey } from '@/lib/i18n/get-dictionary'

const NAV_ITEMS: Array<{ href: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }> = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/dashboard/records', labelKey: 'nav.records', icon: Search },
  { href: '/dashboard/imports', labelKey: 'nav.imports', icon: Upload },
]

export function AppSidebar() {
  const { t } = useTranslation()
  const pathname = usePathname()

  return (
    <aside className="hidden w-60 shrink-0 border-e bg-sidebar text-sidebar-foreground md:flex md:flex-col">
      <div className="flex h-14 items-center px-5">
        <span className="text-sm font-semibold tracking-tight">{t('app.name')}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
