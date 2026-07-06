import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { ToastProvider } from '@/components/ui/toast'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <ToastProvider>
      <div className="min-h-screen lg:flex">
        <Sidebar />
        <main className="flex-1 lg:ml-60 min-h-screen overflow-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}
