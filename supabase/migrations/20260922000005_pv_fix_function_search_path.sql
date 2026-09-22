-- Pin search_path on the two pv_ functions so a session-level search_path
-- change can't redirect an unqualified identifier to a hostile object.
-- (Both functions already qualify every table reference with `public.`, so
-- this closes the theoretical hijack vector rather than fixing a live bug.)
-- Flagged by Supabase's own security advisor (function_search_path_mutable)
-- right after 20260922000000-000004 were applied to the live project.
alter function public.pv_activate_import_batch(uuid) set search_path = public, extensions;
alter function public.pv_match_sites_by_name(uuid, text, integer) set search_path = public, extensions;
