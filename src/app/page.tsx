import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// The proxy already redirects unauthenticated /dashboard visits to /login,
// but a direct hit on "/" itself needs its own decision — there is no
// dashboard-style route here for it to protect.
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? '/dashboard' : '/login')
}
