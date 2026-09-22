// Upload + parse step of the import flow (plan §4). Persists a `processing`
// pv_import_batches row with `sheet_report` populated immediately after
// parsing — before the reviewer has confirmed anything — so a dropped
// connection during review never loses the per-sheet report. The full
// parsed rows are returned to the client for the review step (POST
// /api/imports/confirm), which is what actually writes pv_payroll_lines.
//
// exceljs's xlsx reader is not Edge-compatible, so this route requires the
// Node runtime (see src/lib/import/parse-workbook.ts).
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseWorkbook } from '@/lib/import/parse-workbook'
import { createSupabaseSiteLookup, proposeSiteForSheet } from '@/lib/import/sheet-site-matching'
import type { ParseResponseBody, ParseResponseSheet } from '@/lib/import/api-types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const scope = formData.get('scope')
  const zoneId = formData.get('zoneId')
  const siteId = formData.get('siteId')
  const periodYear = Number(formData.get('periodYear'))
  const periodMonth = Number(formData.get('periodMonth'))

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A .xlsx file is required.' }, { status: 400 })
  }
  if (scope !== 'zone' && scope !== 'standalone') {
    return NextResponse.json({ error: 'scope must be "zone" or "standalone".' }, { status: 400 })
  }
  if (scope === 'zone' && typeof zoneId !== 'string') {
    return NextResponse.json({ error: 'zoneId is required for a zone import.' }, { status: 400 })
  }
  if (scope === 'standalone' && typeof siteId !== 'string') {
    return NextResponse.json({ error: 'siteId is required for a standalone import.' }, { status: 400 })
  }
  if (!Number.isInteger(periodYear) || !Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    return NextResponse.json({ error: 'A valid periodYear/periodMonth is required.' }, { status: 400 })
  }

  let parsed
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    parsed = await parseWorkbook(buffer)
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this workbook: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    )
  }

  const sheetReport = {
    excludedSheetNames: parsed.excludedSheetNames,
    sheets: parsed.sheets.map((s) => ({
      sheetName: s.sheetName,
      headerFound: s.headerFound,
      headerRowNumber: s.headerRowNumber,
      rowCountsByKind: s.rowCountsByKind,
      unmappedHeaders: s.unmappedHeaders,
      foundEndMarker: s.foundEndMarker,
      hitSafetyCap: s.hitSafetyCap,
      warnings: s.warnings,
    })),
  }
  const workbookWarnings = parsed.warnings.map((w) => `${w.sheetName}: ${w.message}`)

  const { data: batch, error: insertError } = await supabase
    .from('pv_import_batches')
    .insert({
      zone_id: scope === 'zone' ? zoneId : null,
      scope_site_id: scope === 'standalone' ? siteId : null,
      period_year: periodYear,
      period_month: periodMonth,
      source_filename: file.name,
      uploaded_by: user.id,
      status: 'processing',
      sheet_report: sheetReport,
      warnings: workbookWarnings,
    })
    .select('id')
    .single()

  if (insertError || !batch) {
    return NextResponse.json(
      { error: `Could not create the import batch: ${insertError?.message}` },
      { status: 500 },
    )
  }

  // Cast through `unknown`: the real SupabaseClient's generics are deep
  // enough that structurally checking it against the narrow SupabaseLike
  // interface these adapters take makes tsc give up with "Type
  // instantiation is excessively deep". The narrow interface only requires
  // a handful of methods, which the real client always has at runtime.
  const siteLookup = createSupabaseSiteLookup(supabase as unknown as Parameters<typeof createSupabaseSiteLookup>[0])
  const matchScope = { zoneId: scope === 'zone' ? (zoneId as string) : null }

  const sheets: ParseResponseSheet[] = []
  for (const sheet of parsed.sheets) {
    const proposal = sheet.headerFound
      ? await proposeSiteForSheet(siteLookup, matchScope, sheet.sheetName, sheet.siteNameHint)
      : null
    sheets.push({
      sheetName: sheet.sheetName,
      headerFound: sheet.headerFound,
      headerRowNumber: sheet.headerRowNumber,
      rowCountsByKind: sheet.rowCountsByKind,
      unmappedHeaders: sheet.unmappedHeaders,
      warnings: sheet.warnings,
      foundEndMarker: sheet.foundEndMarker,
      hitSafetyCap: sheet.hitSafetyCap,
      proposal,
      rows: sheet.rows,
    })
  }

  const responseBody: ParseResponseBody = {
    batchId: batch.id as string,
    excludedSheetNames: parsed.excludedSheetNames,
    workbookWarnings,
    sheets,
  }
  return NextResponse.json(responseBody)
}
