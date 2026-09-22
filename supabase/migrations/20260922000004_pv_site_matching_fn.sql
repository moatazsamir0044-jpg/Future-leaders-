-- Trigram-ranked site name matching, backing src/lib/import/sheet-site-matching.ts.
--
-- This is one migration beyond the plan's original four for the pv_ schema.
-- It's added here because sheet-site-matching.ts needs to propose an
-- existing site for an incoming sheet tab via "sheet_key exact match, then
-- trigram similarity" (plan §4) — and PostgREST (the API supabase-js talks
-- to) has no filter operator that exposes similarity() as an orderable
-- score. Without this function, the app would fall back to a much weaker
-- ILIKE substring match, defeating the point of the pg_trgm index already
-- built in 20260922000003_pv_search_indexes.sql. Depends on that migration
-- for the pg_trgm extension.
create or replace function public.pv_match_sites_by_name(
  p_zone_id uuid,
  p_name text,
  p_limit integer default 5
)
returns table (
  id uuid,
  zone_id uuid,
  name_ar text,
  sheet_key text,
  similarity real
)
language sql
stable
as $$
  select s.id, s.zone_id, s.name_ar, s.sheet_key,
         similarity(s.name_ar, p_name) as similarity
  from public.pv_sites s
  where
    (p_zone_id is null and s.zone_id is null)
    or (p_zone_id is not null and s.zone_id = p_zone_id)
  order by similarity(s.name_ar, p_name) desc
  limit greatest(p_limit, 1);
$$;

revoke all on function public.pv_match_sites_by_name(uuid, text, integer) from public;
grant execute on function public.pv_match_sites_by_name(uuid, text, integer) to authenticated;
