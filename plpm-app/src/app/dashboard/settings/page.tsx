import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SiteManager } from '@/components/settings/site-manager'
import { UserManager } from '@/components/settings/user-manager'
import { Settings, MapPin, Users } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [{ data: sites }, { data: profiles }] = await Promise.all([
    supabase.from('sites').select('*').order('sort_order'),
    supabase.from('user_profiles').select('*').order('full_name'),
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
          <UserManager profiles={profiles ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
