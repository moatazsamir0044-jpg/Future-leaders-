import { describe, it, expect } from 'vitest'
import { matchSheetToSite, type SiteRef } from '../match-sites'

const sites: SiteRef[] = [
  { id: 'a', name: 'Mall of Egypt - HK', name_ar: 'مول مصر - نظافة', sheet_key: 'MOE HK', active: true },
  { id: 'b', name: 'Almaza City Center - LS', name_ar: 'زراعة المول (الماظة)', sheet_key: 'ALmza LS', active: true },
  { id: 'c', name: 'Mall of Arabia - HK', name_ar: 'مول العرب - نظافة', sheet_key: 'MOA. HK', active: true },
  { id: 'd', name: 'Zed Park', name_ar: 'زد بارك', sheet_key: null, active: true },
]

describe('matchSheetToSite', () => {
  it('matches a tab name to its sheet_key', () => {
    expect(matchSheetToSite('MOE HK', sites)).toMatchObject({ site: { id: 'a' }, basis: 'sheet_key' })
  })

  it('ignores case and surrounding spaces, as the database index does', () => {
    expect(matchSheetToSite('  almza ls ', sites)).toMatchObject({ site: { id: 'b' }, basis: 'sheet_key' })
  })

  it('tolerates punctuation drift in a tab name', () => {
    expect(matchSheetToSite('MOA HK', sites)).toMatchObject({ site: { id: 'c' }, basis: 'sheet_key_loose' })
  })

  it('falls back to the site name in either language', () => {
    expect(matchSheetToSite('Zed Park', sites)).toMatchObject({ site: { id: 'd' }, basis: 'name' })
    expect(matchSheetToSite('زد بارك', sites)).toMatchObject({ site: { id: 'd' }, basis: 'name' })
  })

  it('refuses to guess when nothing matches', () => {
    expect(matchSheetToSite('Summary', sites)).toMatchObject({ site: null, basis: null })
    expect(matchSheetToSite('MOE', sites)).toMatchObject({ site: null, basis: null })
    expect(matchSheetToSite('', sites)).toMatchObject({ site: null, basis: null })
  })

  it('reports ambiguity instead of picking one', () => {
    const dupes: SiteRef[] = [
      { id: 'x', name: 'One', name_ar: null, sheet_key: 'Shared', active: true },
      { id: 'y', name: 'Two', name_ar: null, sheet_key: 'shared', active: true },
    ]
    const m = matchSheetToSite('Shared', dupes)
    expect(m.site).toBeNull()
    expect(m.ambiguous.map(s => s.id)).toEqual(['x', 'y'])
  })
})
