import { createClient } from '@/lib/supabase/server'
import { q, qMaybe } from '@/lib/supabase/query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SiteManager } from '@/components/settings/site-manager'
import { UserManager } from '@/components/settings/user-manager'
import { Settings, MapPin, Users, ShieldAlert } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()

  // Sites and roles are admin-only in the database. Without this check a
  // finance user reached a page whose every control failed on save, and whose
  // user list showed only themselves — confusing rather than secure.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await qMaybe(supabase.from('user_profiles').select('role').eq('id', user.id).single(), 'your profile')
    : { data: null }

  if (profile?.role !== 'admin') {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center mt-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mb-4">
            <ShieldAlert className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Admins only</h1>
          <p className="text-sm text-gray-500 mt-2">
            Managing sites and user accounts requires an admin role. Ask an
            administrator if you need access.
          </p>
        </div>
      </div>
    )
  }

  const [{ data: sites }, { data: profiles }] = await Promise.all([
    q(supabase.from('sites').select('*').order('sort_order'), 'sites'),
    q(supabase.from('user_profiles').select('*').order('full_name'), 'users'),
  ])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage sites and user accounts</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600" /> Sites
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SiteManager sites={sites ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" /> Users
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <UserManager profiles={profiles ?? []} currentUserId={user?.id ?? null} />
        </CardContent>
      </Card>
    </div>
  )
}
