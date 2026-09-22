-- PLPM Viewer (pv_) baseline schema.
--
-- Rebuild scope: a narrower, view/search-only payroll system. It does not
-- touch or depend on the original `plpm-app` tables (`sites`, `employees`,
-- `payroll_periods`, `payroll_records`, `expense_*`, `approval_logs`,
-- `user_profiles`) — those are left exactly as they are, no migration or
-- backfill from them. Everything here is additive, under a `pv_` prefix, so
-- there is no naming collision and no risk to the existing data.
--
-- No role matrix / admin gate anywhere in this schema: any authenticated user
-- may read and write. Data-loss protection instead comes from the re-import
-- model (superseded batches are kept, never deleted — see
-- 20260922000001_pv_replace_import_batch_fn.sql).

create extension if not exists "uuid-ossp" with schema extensions;

-- ─── Zones ─────────────────────────────────────────────────────────────────
-- A zone is one of the multi-site Excel workbooks (منطقة اكتوبر, التجمع).
-- A standalone single-site file (e.g. Futtaim Admin Buildings) has no zone —
-- its site's zone_id is null.
create table if not exists public.pv_zones (
  id uuid primary key default extensions.uuid_generate_v4(),
  name_ar text not null,
  name_en text not null,
  slug text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists pv_zones_slug_unique on public.pv_zones (slug);

-- ─── Sites ─────────────────────────────────────────────────────────────────
-- Site rosters are not fixed across months — a site can first appear mid-year
-- (e.g. `H Office` added to التجمع in August), so there is no seed list here;
-- sites are created by the import flow as they are encountered.
create table if not exists public.pv_sites (
  id uuid primary key default extensions.uuid_generate_v4(),
  zone_id uuid references public.pv_zones(id),
  name_ar text not null,
  name_en text,
  legal_entity text,
  -- Key of the source spreadsheet tab this site was imported from (or
  -- matched against on re-import). Scoped uniqueness below.
  sheet_key text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_pv_sites_zone on public.pv_sites (zone_id);

-- Sheet-key uniqueness is scoped: within a zone (two zone workbooks could
-- coincidentally use the same tab name) and, separately, among standalone
-- sites (zone_id is null).
create unique index if not exists pv_sites_zone_sheet_key_unique
  on public.pv_sites (zone_id, lower(btrim(sheet_key)))
  where sheet_key is not null and zone_id is not null;

create unique index if not exists pv_sites_standalone_sheet_key_unique
  on public.pv_sites (lower(btrim(sheet_key)))
  where sheet_key is not null and zone_id is null;

-- ─── Import batches ────────────────────────────────────────────────────────
-- One row per uploaded workbook-scope-period combination. `zone_id` is set
-- for a zone workbook import (covering all its site tabs in one batch);
-- `scope_site_id` is set for a standalone single-site file. Exactly one of
-- the two is set, never both, never neither.
create table if not exists public.pv_import_batches (
  id uuid primary key default extensions.uuid_generate_v4(),
  zone_id uuid references public.pv_zones(id),
  scope_site_id uuid references public.pv_sites(id),
  period_year integer not null check (period_year between 2020 and 2100),
  period_month integer not null check (period_month between 1 and 12),
  source_filename text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  status text not null default 'processing'
    check (status in ('processing', 'active', 'superseded', 'failed')),
  -- Per-sheet parse report: row counts by kind, unmapped headers, totals
  -- cross-check results. Populated as soon as parsing finishes, even before
  -- the batch is confirmed, so a dropped connection never loses the preview.
  sheet_report jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  -- Once superseded, points at the batch that replaced this one.
  superseded_by uuid references public.pv_import_batches(id),
  created_at timestamptz not null default now(),
  constraint pv_import_batches_scope_check check (
    (zone_id is not null and scope_site_id is null) or
    (zone_id is null and scope_site_id is not null)
  )
);

create index if not exists idx_pv_import_batches_zone_period
  on public.pv_import_batches (zone_id, period_year, period_month);
create index if not exists idx_pv_import_batches_site_period
  on public.pv_import_batches (scope_site_id, period_year, period_month);
create index if not exists idx_pv_import_batches_status
  on public.pv_import_batches (status);

-- The core data-integrity guarantee: at most one ACTIVE batch per
-- (zone, period) or (site, period). Re-importing supersedes the previous
-- active batch (status flips to 'superseded') in the same transaction that
-- activates the new one — see 20260922000001.
create unique index if not exists pv_import_batches_active_zone_period_unique
  on public.pv_import_batches (zone_id, period_year, period_month)
  where status = 'active' and zone_id is not null;

create unique index if not exists pv_import_batches_active_site_period_unique
  on public.pv_import_batches (scope_site_id, period_year, period_month)
  where status = 'active' and scope_site_id is not null;

-- ─── Payroll lines ─────────────────────────────────────────────────────────
-- One row per parsed sheet row, of any kind. Rows are never silently
-- dropped: a row that cannot be classified as a worker/subtotal/non-worker
-- cost line is still imported, tagged 'unknown', with its full original
-- content preserved in `raw_row`.
create table if not exists public.pv_payroll_lines (
  id uuid primary key default extensions.uuid_generate_v4(),
  batch_id uuid not null references public.pv_import_batches(id) on delete cascade,
  site_id uuid not null references public.pv_sites(id),
  period_year integer not null check (period_year between 2020 and 2100),
  period_month integer not null check (period_month between 1 and 12),
  sheet_name text not null,
  source_row_number integer not null,
  row_kind text not null default 'unknown'
    check (row_kind in ('worker', 'subtotal', 'non_worker_cost', 'unknown')),
  -- Not unique/stable across files — duplicates exist in the source data.
  worker_number text,
  worker_name text,
  attendance_days numeric,
  absence_days numeric,
  net_days numeric,
  monthly_leave_days numeric,
  annual_leave_days numeric,
  absence_no_permission_days numeric,
  overtime_hours numeric,
  less_hours numeric,
  -- Preserves which drifted Arabic label (اجازه سنوي / اجازت اعياد / اجازت
  -- سنوى / ...) was actually seen on this sheet for the leave column — all
  -- three spellings observed in the real files map to annual_leave_days
  -- above; اجازت اعياد is a spelling drift on the same column, not a
  -- separate "holiday leave" concept.
  leave_label_raw text,
  base_monthly_salary numeric,
  daily_wage numeric,
  bonuses numeric,
  transportation_amount numeric,
  -- Reads as a tier label in the source, not confirmed numeric — kept as
  -- text; revisit if real parsing shows it is consistently numeric.
  transportation_category text,
  advance numeric,
  deductions numeric,
  insurance numeric,
  total_gross numeric,
  net_salary numeric,
  signature_notes text,
  -- Full original row, keyed by literal header text as seen in the sheet.
  -- Nothing is ever silently lost, even for unmapped columns.
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pv_payroll_lines_batch on public.pv_payroll_lines (batch_id);
-- Additional (site_id, period_year, period_month) / (period_year,
-- period_month) btree indexes are added in
-- 20260922000003_pv_search_indexes.sql, alongside the trigram index, so all
-- of the search-supporting indexes live in one place.

-- ─── Seed zones ────────────────────────────────────────────────────────────
insert into public.pv_zones (name_ar, name_en, slug) values
  ('منطقة اكتوبر', 'October Zone', 'october'),
  ('التجمع', 'Tagamoa Zone', 'tagamoa')
on conflict (slug) do nothing;

-- ─── Row level security ────────────────────────────────────────────────────
-- No admin gate: any authenticated user reads and writes. Data-loss
-- protection comes from the supersede-not-delete re-import model, not from
-- restricting who can upload.
alter table public.pv_zones enable row level security;
alter table public.pv_sites enable row level security;
alter table public.pv_import_batches enable row level security;
alter table public.pv_payroll_lines enable row level security;

-- `create policy` has no IF NOT EXISTS, so each policy is created only when
-- absent, mirroring the pattern in 20260629000000_baseline_schema.sql. This
-- keeps the migration replayable.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('pv_zones', 'authenticated read pv_zones',
        'for select using (auth.role() = ''authenticated'')'),
      ('pv_zones', 'authenticated insert pv_zones',
        'for insert with check (auth.role() = ''authenticated'')'),
      ('pv_zones', 'authenticated update pv_zones',
        'for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')'),

      ('pv_sites', 'authenticated read pv_sites',
        'for select using (auth.role() = ''authenticated'')'),
      ('pv_sites', 'authenticated insert pv_sites',
        'for insert with check (auth.role() = ''authenticated'')'),
      ('pv_sites', 'authenticated update pv_sites',
        'for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')'),

      ('pv_import_batches', 'authenticated read pv_import_batches',
        'for select using (auth.role() = ''authenticated'')'),
      ('pv_import_batches', 'authenticated insert pv_import_batches',
        'for insert with check (auth.role() = ''authenticated'')'),
      ('pv_import_batches', 'authenticated update pv_import_batches',
        'for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')'),

      ('pv_payroll_lines', 'authenticated read pv_payroll_lines',
        'for select using (auth.role() = ''authenticated'')'),
      ('pv_payroll_lines', 'authenticated insert pv_payroll_lines',
        'for insert with check (auth.role() = ''authenticated'')'),
      ('pv_payroll_lines', 'authenticated update pv_payroll_lines',
        'for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')')
    ) as t(tbl, pol, body)
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = p.tbl and policyname = p.pol
    ) then
      execute format('create policy %I on public.%I %s', p.pol, p.tbl, p.body);
    end if;
  end loop;
end $$;
