import { describe, expect, it } from 'vitest'
import { buildSuggestedSiteName, proposeSiteForSheet, type SiteLookup, type SiteRecord } from './sheet-site-matching'

function makeSite(overrides: Partial<SiteRecord> = {}): SiteRecord {
  return { id: 's1', zoneId: 'z1', nameAr: 'زهراء المعادي', sheetKey: 'zahraa-maadi', ...overrides }
}

describe('proposeSiteForSheet', () => {
  it('proposes a sheet_key match when one exists, without even checking name similarity', async () => {
    const site = makeSite()
    let similarityCalled = false
    const lookup: SiteLookup = {
      async findBySheetKey() {
        return site
      },
      async findSimilarByName() {
        similarityCalled = true
        return []
      },
    }

    const proposal = await proposeSiteForSheet(lookup, { zoneId: 'z1' }, 'زهراء المعادي')
    expect(proposal).toEqual({ kind: 'sheet_key_match', site })
    expect(similarityCalled).toBe(false)
  })

  it('falls back to the best name-similarity match above the threshold', async () => {
    const goodMatch = makeSite({ id: 's2', nameAr: 'زهراء' })
    const weakMatch = makeSite({ id: 's3', nameAr: 'موقع آخر تمامًا' })
    const lookup: SiteLookup = {
      async findBySheetKey() {
        return null
      },
      async findSimilarByName() {
        return [
          { site: weakMatch, similarity: 0.1 },
          { site: goodMatch, similarity: 0.85 },
        ]
      },
    }

    const proposal = await proposeSiteForSheet(lookup, { zoneId: 'z1' }, 'زهراء المعادي')
    expect(proposal).toEqual({ kind: 'name_similarity_match', site: goodMatch, similarity: 0.85 })
  })

  it('proposes creating a new site when nothing matches (a site can first appear mid-year)', async () => {
    const lookup: SiteLookup = {
      async findBySheetKey() {
        return null
      },
      async findSimilarByName() {
        return [{ site: makeSite({ id: 's4' }), similarity: 0.05 }] // below threshold
      },
    }

    const proposal = await proposeSiteForSheet(lookup, { zoneId: 'z1' }, 'H Office')
    expect(proposal).toEqual({ kind: 'create_new', suggestedNameAr: 'H Office' })
  })

  it('proposes creating a new site when there are no candidates at all', async () => {
    const lookup: SiteLookup = {
      async findBySheetKey() {
        return null
      },
      async findSimilarByName() {
        return []
      },
    }

    const proposal = await proposeSiteForSheet(lookup, { zoneId: null }, 'Futtaim Admin Buildings')
    expect(proposal.kind).toBe('create_new')
  })

  it('includes the workbook site-name hint in the suggested name for a new site', async () => {
    const lookup: SiteLookup = {
      async findBySheetKey() {
        return null
      },
      async findSimilarByName() {
        return []
      },
    }

    const proposal = await proposeSiteForSheet(lookup, { zoneId: 'z1' }, 'MOE HK', 'مول مصر')
    expect(proposal).toEqual({ kind: 'create_new', suggestedNameAr: 'مول مصر (MOE HK)' })
  })
})

describe('buildSuggestedSiteName', () => {
  it('combines the hint and sheet name so two sheets sharing one hint never collide', () => {
    // Confirmed real case: seven منطقة اكتوبر sheets all carry the
    // identical "الموقع / مول مصر" label — the sheet name is what keeps
    // their proposed names distinct.
    expect(buildSuggestedSiteName('MOE HK', 'مول مصر')).toBe('مول مصر (MOE HK)')
    expect(buildSuggestedSiteName('Magic', 'مول مصر')).toBe('مول مصر (Magic)')
    expect(buildSuggestedSiteName('MOE HK', 'مول مصر')).not.toBe(buildSuggestedSiteName('Magic', 'مول مصر'))
  })

  it('falls back to the bare sheet name when there is no hint', () => {
    expect(buildSuggestedSiteName('Asema', null)).toBe('Asema')
  })

  it('trims the sheet name', () => {
    expect(buildSuggestedSiteName('  Z Park  ', null)).toBe('Z Park')
  })
})
