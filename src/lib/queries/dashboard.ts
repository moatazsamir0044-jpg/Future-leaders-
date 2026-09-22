// Dashboard data queries — reads from the derived rollup views
// (pv_site_period_rollup / pv_zone_period_rollup), not raw pv_payroll_lines,
// since those views already do the RLS-safe, active-batch-only aggregation
// (see supabase/migrations/20260922000002_pv_derived_views.sql).
//
// No generated Database types exist for this project (see repo root), so the
// Supabase client here is the plain untyped `SupabaseClient` — every query
// result is cast to the interfaces below, which mirror the view/table
// columns as documented in the migrations.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Period {
  year: number
  month: number
}

export interface ZoneRow {
  id: string
  name_ar: string
  name_en: string
  slug: string
}

interface SitePeriodRollupRow {
  site_id: string
  zone_id: string | null
  period_year: number
  period_month: number
  worker_count: number
  total_gross: number
}

interface ZonePeriodRollupRow {
  zone_id: string
  period_year: number
  period_month: number
  site_count: number
  worker_count: number
  total_gross: number
}

export interface CostByZone {
  zoneId: string
  nameAr: string
  nameEn: string
  totalGross: number
}

export interface DashboardKpis {
  currentPeriod: Period | null
  previousPeriod: Period | null
  totalCostCurrent: number
  totalCostPrevious: number | null
  costDeltaPct: number | null
  workerRowsCurrent: number
  sitesReportingCurrent: number
  knownSitesCount: number
  costByZone: CostByZone[]
}

export interface CostBySite {
  siteId: string
  nameAr: string
  nameEn: string | null
  zoneId: string | null
  totalGross: number
}

export interface CostTrendPoint {
  periodLabel: string
  year: number
  month: number
  total: number
  [zoneSlug: string]: number | string
}

function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/** The most recent periods with any rollup data, newest first. Small data
 * volume (low thousands of rows/month across a handful of periods), so
 * dedup happens client-side rather than via a DISTINCT the postgrest query
 * builder can't express directly. */
export async function getAvailablePeriods(supabase: SupabaseClient, limit = 24): Promise<Period[]> {
  const { data, error } = await supabase
    .from('pv_site_period_rollup')
    .select('period_year, period_month')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(2000)

  if (error || !data) return []

  const rows = data as Array<{ period_year: number; period_month: number }>
  const seen = new Set<string>()
  const periods: Period[] = []
  for (const row of rows) {
    const key = `${row.period_year}-${row.period_month}`
    if (seen.has(key)) continue
    seen.add(key)
    periods.push({ year: row.period_year, month: row.period_month })
    if (periods.length >= limit) break
  }
  return periods
}

export async function getZones(supabase: SupabaseClient): Promise<ZoneRow[]> {
  const { data, error } = await supabase.from('pv_zones').select('id, name_ar, name_en, slug').order('name_en')
  if (error || !data) return []
  return data as ZoneRow[]
}

/** KPI summary for the dashboard landing page. Gracefully returns an
 * all-zero/empty shape when nothing has been imported yet — the dashboard
 * must not crash on a fresh database. */
export async function getDashboardKpis(supabase: SupabaseClient): Promise<DashboardKpis> {
  const [periods, zones, knownSitesResult] = await Promise.all([
    getAvailablePeriods(supabase, 2),
    getZones(supabase),
    supabase.from('pv_sites').select('id', { count: 'exact', head: true }).eq('active', true),
  ])

  const knownSitesCount = knownSitesResult.count ?? 0
  const currentPeriod = periods[0] ?? null
  const previousPeriod = periods[1] ?? null

  if (!currentPeriod) {
    return {
      currentPeriod: null,
      previousPeriod: null,
      totalCostCurrent: 0,
      totalCostPrevious: null,
      costDeltaPct: null,
      workerRowsCurrent: 0,
      sitesReportingCurrent: 0,
      knownSitesCount,
      costByZone: [],
    }
  }

  const { data: currentRows } = await supabase
    .from('pv_site_period_rollup')
    .select('site_id, zone_id, period_year, period_month, worker_count, total_gross')
    .eq('period_year', currentPeriod.year)
    .eq('period_month', currentPeriod.month)

  const current = (currentRows ?? []) as SitePeriodRollupRow[]
  const totalCostCurrent = current.reduce((sum, r) => sum + Number(r.total_gross ?? 0), 0)
  const workerRowsCurrent = current.reduce((sum, r) => sum + Number(r.worker_count ?? 0), 0)
  const sitesReportingCurrent = current.length

  let totalCostPrevious: number | null = null
  let costDeltaPct: number | null = null
  if (previousPeriod) {
    const { data: previousRows } = await supabase
      .from('pv_site_period_rollup')
      .select('total_gross')
      .eq('period_year', previousPeriod.year)
      .eq('period_month', previousPeriod.month)
    const previous = (previousRows ?? []) as Array<{ total_gross: number }>
    totalCostPrevious = previous.reduce((sum, r) => sum + Number(r.total_gross ?? 0), 0)
    costDeltaPct = totalCostPrevious > 0 ? ((totalCostCurrent - totalCostPrevious) / totalCostPrevious) * 100 : null
  }

  const zoneById = new Map(zones.map((z) => [z.id, z]))
  const costByZoneMap = new Map<string, number>()
  for (const row of current) {
    if (!row.zone_id) continue
    costByZoneMap.set(row.zone_id, (costByZoneMap.get(row.zone_id) ?? 0) + Number(row.total_gross ?? 0))
  }
  const costByZone: CostByZone[] = Array.from(costByZoneMap.entries())
    .map(([zoneId, totalGross]) => {
      const zone = zoneById.get(zoneId)
      return { zoneId, nameAr: zone?.name_ar ?? zoneId, nameEn: zone?.name_en ?? zoneId, totalGross }
    })
    .sort((a, b) => b.totalGross - a.totalGross)

  return {
    currentPeriod,
    previousPeriod,
    totalCostCurrent,
    totalCostPrevious,
    costDeltaPct,
    workerRowsCurrent,
    sitesReportingCurrent,
    knownSitesCount,
    costByZone,
  }
}

export async function getCostBySite(supabase: SupabaseClient, period: Period): Promise<CostBySite[]> {
  const { data, error } = await supabase
    .from('pv_site_period_rollup')
    .select('site_id, zone_id, total_gross')
    .eq('period_year', period.year)
    .eq('period_month', period.month)

  if (error || !data || data.length === 0) return []

  const rows = data as SitePeriodRollupRow[]
  const siteIds = rows.map((r) => r.site_id)
  const { data: sitesData } = await supabase.from('pv_sites').select('id, name_ar, name_en').in('id', siteIds)
  const sites = (sitesData ?? []) as Array<{ id: string; name_ar: string; name_en: string | null }>
  const siteById = new Map(sites.map((s) => [s.id, s]))

  return rows
    .map((row) => {
      const site = siteById.get(row.site_id)
      return {
        siteId: row.site_id,
        nameAr: site?.name_ar ?? row.site_id,
        nameEn: site?.name_en ?? null,
        zoneId: row.zone_id,
        totalGross: Number(row.total_gross ?? 0),
      }
    })
    .sort((a, b) => b.totalGross - a.totalGross)
}

/** One line per zone plus a "total" line (zones + standalone sites), across
 * every period that has data — feeds the dashboard's cost-trend chart. */
export async function getCostTrend(supabase: SupabaseClient): Promise<{ points: CostTrendPoint[]; zones: ZoneRow[] }> {
  const [zones, zoneRollupResult, siteRollupResult] = await Promise.all([
    getZones(supabase),
    supabase
      .from('pv_zone_period_rollup')
      .select('zone_id, period_year, period_month, total_gross')
      .order('period_year')
      .order('period_month'),
    supabase.from('pv_site_period_rollup').select('period_year, period_month, total_gross').order('period_year').order('period_month'),
  ])

  const zoneRows = (zoneRollupResult.data ?? []) as ZonePeriodRollupRow[]
  const siteRows = (siteRollupResult.data ?? []) as Array<{ period_year: number; period_month: number; total_gross: number }>

  const pointsByPeriod = new Map<string, CostTrendPoint>()

  function pointFor(year: number, month: number): CostTrendPoint {
    const key = periodKey({ year, month })
    let point = pointsByPeriod.get(key)
    if (!point) {
      point = { periodLabel: key, year, month, total: 0 }
      pointsByPeriod.set(key, point)
    }
    return point
  }

  for (const row of siteRows) {
    const point = pointFor(row.period_year, row.period_month)
    point.total = Number(point.total) + Number(row.total_gross ?? 0)
  }

  const zoneById = new Map(zones.map((z) => [z.id, z]))
  for (const row of zoneRows) {
    const point = pointFor(row.period_year, row.period_month)
    const slug = zoneById.get(row.zone_id)?.slug ?? row.zone_id
    point[slug] = Number(point[slug] ?? 0) + Number(row.total_gross ?? 0)
  }

  const points = Array.from(pointsByPeriod.values()).sort((a, b) => a.year - b.year || a.month - b.month)
  return { points, zones }
}
