import { createClient as createAdminClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './config'

// Service-role client for privileged server-only operations (e.g. creating
// auth users). Unlike the anon key, this key must never reach the browser -
// only import this file from route handlers / server actions.
export function createServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createAdminClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
