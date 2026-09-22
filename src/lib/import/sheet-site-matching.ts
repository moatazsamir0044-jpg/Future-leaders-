// Proposes an existing pv_sites row for an incoming sheet tab, or signals
// "create new site" when nothing matches — site rosters aren't fixed across
// months (a site can first appear mid-year), so "no match" is an expected,
// first-class outcome, not an error.
//
// The lookup itself is behind a small interface (SiteLookup) rather than a
// concrete Supabase call so this module's matching *logic* — try sheet_key
// first, fall back to trigram similarity, otherwise propose a new site — is
// unit-testable against a fake lookup, independent of a live database.
// createSupabaseSiteLookup() below is the real adapter, used by
// commit-batch.ts / the (future) import review UI.

export interface SiteRecord {
  id: string
  zoneId: string | null
  nameAr: string
  sheetKey: string | null
}

export interface SiteMatchScope {
  /** null means the standalone-site scope, matching pv_sites.zone_id = null. */
  zoneId: string | null
}

export interface SiteLookup {
  findBySheetKey(scope: SiteMatchScope, sheetKey: string): Promise<SiteRecord | null>
  findSimilarByName(
    scope: SiteMatchScope,
    name: string,
    limit?: number,
  ): Promise<Array<{ site: SiteRecord; similarity: number }>>
}

export type SiteMatchProposal =
  | { kind: 'sheet_key_match'; site: SiteRecord }
  | { kind: 'name_similarity_match'; site: SiteRecord; similarity: number }
  | { kind: 'create_new'; suggestedNameAr: string }

// Below this trigram similarity score, a candidate is treated as noise
// rather than a real match — the review UI should offer "create new site"
// instead of a low-confidence guess.
const SIMILARITY_THRESHOLD = 0.4

/**
 * Builds the proposed name for a newly-created site: the workbook's own
 * "الموقع / X" label plus the sheet tab name, e.g. "مول مصر (MOE HK)".
 *
 * The hint alone is not safe to use as-is — confirmed by direct inspection
 * of the real files, several distinct sheets in the same workbook can share
 * the identical "الموقع" label (seven منطقة اكتوبر sheets all say "مول
 * مصر"; two others both say "اركان بلازا"). The sheet tab name is always
 * distinct, so appending it guarantees two different sheets never propose
 * the same name even when the human-readable hint collides. Falls back to
 * the bare sheet name when no hint was found in the workbook at all.
 */
export function buildSuggestedSiteName(sheetName: string, siteNameHint: string | null): string {
  const trimmedSheetName = sheetName.trim()
  if (!siteNameHint) return trimmedSheetName
  return `${siteNameHint} (${trimmedSheetName})`
}

/**
 * Proposes a site for the given sheet tab name, within the given scope
 * (a zone, or the standalone-site scope when zoneId is null). Tries an
 * exact sheet_key match first (a sheet re-imported against the same site it
 * was matched to before), then the best trigram name match above the
 * threshold, then falls back to "create new site". Matching itself is
 * always keyed on the sheet tab name (stable across months, confirmed by
 * direct inspection) — siteNameHint only affects the suggested name shown
 * for a brand-new site, never the matching logic.
 */
export async function proposeSiteForSheet(
  lookup: SiteLookup,
  scope: SiteMatchScope,
  sheetName: string,
  siteNameHint: string | null = null,
): Promise<SiteMatchProposal> {
  const trimmedName = sheetName.trim()

  const bySheetKey = await lookup.findBySheetKey(scope, trimmedName)
  if (bySheetKey) return { kind: 'sheet_key_match', site: bySheetKey }

  const candidates = await lookup.findSimilarByName(scope, trimmedName)
  const best = candidates
    .filter((c) => c.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)[0]

  if (best) return { kind: 'name_similarity_match', site: best.site, similarity: best.similarity }

  return { kind: 'create_new', suggestedNameAr: buildSuggestedSiteName(trimmedName, siteNameHint) }
}

// Narrow structural shape of the supabase-js client methods this adapter
// uses, so it isn't coupled to a specific @supabase/supabase-js version's
// full generic surface.
export interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      ilike(column: string, pattern: string): {
        eq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }>
        is(column: string, value: null): PromiseLike<{ data: unknown; error: unknown }>
      }
    }
  }
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

interface RawSiteRow {
  id: string
  zone_id: string | null
  name_ar: string
  sheet_key: string | null
}

function toSiteRecord(row: RawSiteRow): SiteRecord {
  return { id: row.id, zoneId: row.zone_id, nameAr: row.name_ar, sheetKey: row.sheet_key }
}

/**
 * Real adapter backed by Supabase: sheet_key exact match via a plain
 * `.ilike()` query, and trigram similarity via the pv_match_sites_by_name
 * RPC (20260922000004_pv_site_matching_fn.sql) — PostgREST has no filter
 * operator that exposes similarity() as an orderable score, so that ranking
 * has to happen inside a Postgres function.
 */
export function createSupabaseSiteLookup(supabase: SupabaseLike): SiteLookup {
  return {
    async findBySheetKey(scope, sheetKey) {
      if (!sheetKey) return null
      const query = supabase.from('pv_sites').select('id, zone_id, name_ar, sheet_key').ilike('sheet_key', sheetKey)
      const scoped = scope.zoneId ? query.eq('zone_id', scope.zoneId) : query.is('zone_id', null)
      const { data, error } = await scoped
      if (error || !data) return null
      const rows = data as RawSiteRow[]
      return rows.length > 0 ? toSiteRecord(rows[0]) : null
    },

    async findSimilarByName(scope, name, limit = 5) {
      const { data, error } = await supabase.rpc('pv_match_sites_by_name', {
        p_zone_id: scope.zoneId,
        p_name: name,
        p_limit: limit,
      })
      if (error || !data) return []
      const rows = data as Array<RawSiteRow & { similarity: number }>
      return rows.map((row) => ({ site: toSiteRecord(row), similarity: row.similarity }))
    },
  }
}
