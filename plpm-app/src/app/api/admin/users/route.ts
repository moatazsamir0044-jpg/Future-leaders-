import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

const bodySchema = z.object({
  email: z.string().trim().email(),
  full_name: z.string().trim().min(1),
  role: z.enum(['admin', 'finance']),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: requester } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (requester?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid full name, email, or role' }, { status: 400 })
  }
  const { email, full_name, role } = parsed.data

  let admin: ReturnType<typeof createServiceRoleClient>
  try {
    admin = createServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Server is not configured to create users' }, { status: 500 })
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
  })
  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message ?? 'Failed to invite user' }, { status: 400 })
  }

  // The on_auth_user_created trigger inserts the user_profiles row with the
  // default 'finance' role; promote it here if the admin picked 'admin'.
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .update({ role })
    .eq('id', invited.user.id)
    .select()
    .single()
  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message ?? 'User invited but profile update failed' }, { status: 500 })
  }

  return NextResponse.json({ profile })
}
