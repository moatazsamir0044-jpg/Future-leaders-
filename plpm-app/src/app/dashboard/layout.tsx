import { createClient } from '@/lib/supabase/server'
import { qMaybe } from '@/lib/supabase/query'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { ToastProvider } from '@/components/ui/toast'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Drives which nav entries appear. Authorisation itself lives in the
  // database — this only keeps the menu honest about what the user can reach.
  const { data: profile } = await qMaybe(
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
    'your profile',
  )

  return (
    <ToastProvider>
      <div className="min-h-screen lg:flex">
        <Sidebar isAdmin={profile?.role === 'admin'} />
        <main className="flex-1 lg:ml-60 min-h-screen overflow-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}
