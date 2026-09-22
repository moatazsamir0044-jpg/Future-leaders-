import type { SupabaseClient } from '@supabase/supabase-js'

export interface ZoneOption {
  id: string
  nameAr: string
  nameEn: string
  slug: string
}

export interface SiteOption {
  id: string
  zoneId: string | null
  nameAr: string
  nameEn: string | null
  active: boolean
}

export async function listZones(supabase: SupabaseClient): Promise<ZoneOption[]> {
  const { data, error } = await supabase.from('pv_zones').select('id, name_ar, name_en, slug').order('name_en')
  if (error || !data) return []
  return (data as Array<{ id: string; name_ar: string; name_en: string; slug: string }>).map((z) => ({
    id: z.id,
    nameAr: z.name_ar,
    nameEn: z.name_en,
    slug: z.slug,
  }))
}

/** `zoneId: null` returns standalone sites only; omitted returns every site. */
export async function listSites(supabase: SupabaseClient, zoneId?: string | null): Promise<SiteOption[]> {
  let query = supabase.from('pv_sites').select('id, zone_id, name_ar, name_en, active').order('name_en')
  if (zoneId === null) {
    query = query.is('zone_id', null)
  } else if (zoneId !== undefined) {
    query = query.eq('zone_id', zoneId)
  }
  const { data, error } = await query
  if (error || !data) return []
  return (data as Array<{ id: string; zone_id: string | null; name_ar: string; name_en: string | null; active: boolean }>).map(
    (s) => ({ id: s.id, zoneId: s.zone_id, nameAr: s.name_ar, nameEn: s.name_en, active: s.active }),
  )
}
