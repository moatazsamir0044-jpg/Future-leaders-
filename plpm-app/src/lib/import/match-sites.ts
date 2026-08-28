import { normalizeKey } from './arabic'

export interface SiteRef {
  id: string
  name: string
  name_ar: string | null
  sheet_key: string | null
  active: boolean
}

export type MatchBasis = 'sheet_key' | 'sheet_key_loose' | 'name'

export interface SheetMatch {
  site: SiteRef | null
  basis: MatchBasis | null
  /** Set when more than one site answers to the same tab name. */
  ambiguous: SiteRef[]
}

/** The database's own uniqueness rule for sheet_key: lower(btrim(...)). */
const dbKey = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Work out which site a worksheet belongs to.
 *
 * Matching is deliberately narrow. An exact `sheet_key` is the intended link;
 * the looser passes exist only for the punctuation and letter-form drift that
 * tab names pick up ("ALmza LS", "MOA. HK"). Anything less certain than that
 * returns no match, so the operator picks the site by hand rather than the
 * importer guessing which payroll a thousand rows belong to.
 */
export function matchSheetToSite(sheetName: string, sites: SiteRef[]): SheetMatch {
  const none: SheetMatch = { site: null, basis: null, ambiguous: [] }
  const name = sheetName.trim()
  if (name === '') return none

  const passes: { basis: MatchBasis; hits: SiteRef[] }[] = [
    {
      basis: 'sheet_key',
      hits: sites.filter(s => s.sheet_key && dbKey(s.sheet_key) === dbKey(name)),
    },
    {
      basis: 'sheet_key_loose',
      hits: sites.filter(s => s.sheet_key && normalizeKey(s.sheet_key) === normalizeKey(name)),
    },
    {
      basis: 'name',
      hits: sites.filter(s =>
        normalizeKey(s.name) === normalizeKey(name) ||
        (s.name_ar !== null && normalizeKey(s.name_ar) === normalizeKey(name))),
    },
  ]

  for (const { basis, hits } of passes) {
    if (hits.length === 1) return { site: hits[0], basis, ambiguous: [] }
    if (hits.length > 1) return { site: null, basis: null, ambiguous: hits }
  }
  return none
}
