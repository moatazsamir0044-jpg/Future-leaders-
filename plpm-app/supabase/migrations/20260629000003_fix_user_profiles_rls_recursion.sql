-- Fix infinite recursion (Postgres 42P17) in user_profiles RLS policies.
--
-- The "admins" policies on user_profiles selected FROM user_profiles, which
-- re-evaluated the same policies -> infinite recursion. Because the `sites`
-- "admins manage sites" policy also selected from user_profiles, EVERY query
-- that touched `sites` (directly, or via an embedded join such as the
-- dashboard's payroll_periods?select=*,site:sites(...)) returned HTTP 500.
-- This is why the dashboard rendered but showed no payroll/expense/site data.
--
-- Fix: evaluate admin status through a SECURITY DEFINER function that bypasses
-- RLS, so there is no recursive policy evaluation. The pre-existing is_admin()
-- checks a different table (public.profiles), so we add a dedicated function
-- for the PLPM user_profiles table.

create or replace function public.is_plpm_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- user_profiles: replace self-referential policies
drop policy if exists "admins view all profiles" on public.user_profiles;
create policy "admins view all profiles" on public.user_profiles
  for select using (public.is_plpm_admin());

drop policy if exists "admins update all profiles" on public.user_profiles;
create policy "admins update all profiles" on public.user_profiles
  for update using (public.is_plpm_admin());

-- sites: replace the inline user_profiles subquery with the same function
drop policy if exists "admins manage sites" on public.sites;
create policy "admins manage sites" on public.sites
  for all using (public.is_plpm_admin()) with check (public.is_plpm_admin());
