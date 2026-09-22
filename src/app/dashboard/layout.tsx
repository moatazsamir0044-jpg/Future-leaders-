import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Topbar } from '@/components/layout/topbar'

// Defense in depth alongside src/proxy.ts: proxy redirects unauthenticated
// /dashboard/** requests to /login before this ever renders, but a Server
// Function bypassing the matcher (or a future refactor loosening it) should
// not be able to reach real data — verify auth here too, per Next's own
// data-security guidance for Proxy.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={user.email ?? null} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
