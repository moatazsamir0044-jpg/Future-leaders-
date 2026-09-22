// Restores a superseded batch as active again. pv_activate_import_batch
// accepts a batch in either 'processing' or 'superseded' status and does the
// supersede-current/activate-this swap in one transaction — see
// supabase/migrations/20260922000001_pv_replace_import_batch_fn.sql.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await context.params
  const { data, error } = await supabase.rpc('pv_activate_import_batch', { p_batch_id: id })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ batch: data })
}
