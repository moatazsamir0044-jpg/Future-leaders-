import { describe, expect, it } from 'vitest'
import { proposeSiteForSheet, type SiteLookup, type SiteRecord } from './sheet-site-matching'

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
})
