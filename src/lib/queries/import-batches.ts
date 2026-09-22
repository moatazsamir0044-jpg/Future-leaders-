import type { SupabaseClient } from '@supabase/supabase-js'

export interface ImportBatchRow {
  id: string
  zone_id: string | null
  scope_site_id: string | null
  period_year: number
  period_month: number
  source_filename: string
  uploaded_by: string | null
  uploaded_at: string
  status: 'processing' | 'active' | 'superseded' | 'failed'
  superseded_by: string | null
  /** Every warning surfaced during parse (unmapped columns, missing
   * اجماليات row, unclassified rows, and — most importantly — any
   * workbook-wide cross-check discrepancy). Stored once at parse time so
   * it stays visible after the import is committed, not just during the
   * fleeting review screen. */
  warnings: string[]
  pv_zones: { name_ar: string; name_en: string } | null
  pv_sites: { name_ar: string; name_en: string | null } | null
}

export async function listImportBatches(supabase: SupabaseClient, limit = 100): Promise<ImportBatchRow[]> {
  const { data, error } = await supabase
    .from('pv_import_batches')
    .select(
      'id, zone_id, scope_site_id, period_year, period_month, source_filename, uploaded_by, uploaded_at, status, superseded_by, warnings, pv_zones(name_ar, name_en), pv_sites!pv_import_batches_scope_site_id_fkey(name_ar, name_en)',
    )
    .order('uploaded_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as unknown as ImportBatchRow[]
}
