// Confirm step of the import flow (plan §4): the reviewer has accepted or
// remapped a proposed site per sheet (and possibly asked to create new
// sites). This writes the confirmed pv_payroll_lines rows against the
// batch already created by POST /api/imports/parse, then atomically
// supersedes/activates it via pv_activate_import_batch.
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  activateExistingBatch,
  createSupabaseCommitBatchClient,
  type CommitBatchSheetInput,
} from '@/lib/import/commit-batch'
import type { ConfirmRequestBody } from '@/lib/import/api-types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: ConfirmRequestBody
  try {
    body = (await request.json()) as ConfirmRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body.batchId || !Array.isArray(body.sheets) || body.sheets.length === 0) {
    return NextResponse.json({ error: 'batchId and at least one sheet are required.' }, { status: 400 })
  }

  const sheets: CommitBatchSheetInput[] = []
  for (const sheet of body.sheets) {
    let siteId: string

    if (sheet.resolution.kind === 'existing') {
      siteId = sheet.resolution.siteId
    } else {
      const { data: newSite, error: siteError } = await supabase
        .from('pv_sites')
        .insert({
          zone_id: body.zoneId,
          name_ar: sheet.resolution.nameAr,
          sheet_key: sheet.resolution.sheetKey,
          active: true,
        })
        .select('id')
        .single()

      if (siteError || !newSite) {
        return NextResponse.json(
          { error: `Could not create site for sheet "${sheet.sheetName}": ${siteError?.message}` },
          { status: 500 },
        )
      }
      siteId = newSite.id as string
    }

    sheets.push({ sheetName: sheet.sheetName, siteId, rows: sheet.rows })
  }

  // See the matching comment in src/app/api/imports/parse/route.ts — the
  // cast avoids a tsc "Type instantiation is excessively deep" error when
  // structurally checking the real SupabaseClient against this adapter's
  // narrow interface.
  const client = createSupabaseCommitBatchClient(supabase as unknown as Parameters<typeof createSupabaseCommitBatchClient>[0])

  try {
    const result = await activateExistingBatch(client, body.batchId, body.periodYear, body.periodMonth, sheets)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not activate the import batch.' },
      { status: 500 },
    )
  }
}
