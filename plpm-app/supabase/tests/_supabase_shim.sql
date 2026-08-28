-- Minimal stand-in for the parts of a Supabase database the migrations rely
-- on (auth schema, auth.uid()/auth.role(), the extensions schema and roles),
-- so migrations and RLS policies can be exercised on a plain PostgreSQL
-- instance in CI. Never applied to a real Supabase project — the platform
-- provides all of this already.

create schema if not exists auth;
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public, extensions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on auth.users to authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase derives these from the request JWT; locally we read the same GUCs
-- PostgREST sets, so tests can impersonate a user with `set local`.
create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_setting('role', true));
$$;
