-- PLPM baseline schema.
--
-- The core operational tables (sites, employees, payroll, expenses, approval
-- log) were originally created ad-hoc against the hosted project and never
-- captured in a migration, so the database could not be rebuilt from source.
-- This file is that missing baseline: it is the first migration in the
-- sequence and every object it defines is guarded, so it applies cleanly to a
-- fresh database and is a no-op on the existing one.
--
-- NOTE for the existing hosted project: mark this migration as already
-- applied (`supabase migration repair --status applied 20260629000000`)
-- rather than running it, since its objects are already present there.

create extension if not exists "uuid-ossp" with schema extensions;

-- ─── Identity ──────────────────────────────────────────────────────────────
-- One row per auth user. `role` drives every authorisation decision in the
-- app; it is deliberately NOT self-service (see 20260828000001).
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'finance' check (role in ('admin', 'finance')),
  created_at timestamptz not null default now()
);

-- Creates the profile row for every new auth user, defaulting to the
-- least-privileged role. Admins promote from the Settings screen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email, ''), 'finance')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check used by RLS policies. SECURITY DEFINER so that policies on
-- user_profiles can call it without recursing into their own evaluation
-- (Postgres 42P17) — see 20260629000003.
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

-- ─── Operational master data ───────────────────────────────────────────────
create table if not exists public.sites (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  name_ar text,
  service_type text not null default 'hk'
    check (service_type in ('hk', 'ls', 'fm', 'other')),
  client_name text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- Key of the source spreadsheet tab this site was imported from.
  sheet_key text
);

create unique index if not exists sites_sheet_key_unique
  on public.sites (lower(btrim(sheet_key))) where sheet_key is not null;

create table if not exists public.employees (
  id uuid primary key default extensions.uuid_generate_v4(),
  site_id uuid not null references public.sites(id),
  worker_number integer,
  name text not null,
  base_monthly_salary numeric not null default 0,
  daily_wage numeric not null default 0,
  insurance_enrolled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_employees_site on public.employees (site_id);

-- ─── Payroll ───────────────────────────────────────────────────────────────
-- One sheet per site per month, mirroring the source Excel workbooks.
create table if not exists public.payroll_periods (
  id uuid primary key default extensions.uuid_generate_v4(),
  site_id uuid not null references public.sites(id),
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2020 and 2100),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  submitted_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejection_notes text,
  -- Derived from the sheet's records; maintained by trigger, not by clients.
  total_gross numeric not null default 0,
  total_net numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (site_id, month, year)
);

create index if not exists idx_payroll_periods_site on public.payroll_periods (site_id, year, month);

create table if not exists public.payroll_records (
  id uuid primary key default extensions.uuid_generate_v4(),
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  -- Null for rows imported from spreadsheets that predate the roster.
  employee_id uuid references public.employees(id),
  site_id uuid not null references public.sites(id),
  worker_number integer,
  employee_name text not null,
  attendance_days numeric not null default 0,
  absence_days numeric not null default 0,
  net_days numeric not null default 0,
  monthly_leave_days numeric not null default 0,
  annual_leave_days numeric not null default 0,
  absence_no_permission numeric not null default 0,
  holiday_extra_days numeric not null default 0,
  overtime_hours numeric not null default 0,
  less_hours numeric not null default 0,
  base_monthly_salary numeric not null default 0,
  daily_wage numeric not null default 0,
  bonuses numeric not null default 0,
  transportation_amount numeric not null default 0,
  transportation_category numeric not null default 0,
  advance numeric not null default 0,
  insurance numeric not null default 0,
  deductions numeric not null default 0,
  penalties numeric not null default 0,
  total_gross numeric not null default 0,
  net_salary numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_records_period on public.payroll_records (period_id);
create index if not exists idx_payroll_records_site on public.payroll_records (site_id);

-- ─── Site expenses ─────────────────────────────────────────────────────────
create table if not exists public.expense_reports (
  id uuid primary key default extensions.uuid_generate_v4(),
  site_id uuid not null references public.sites(id),
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2020 and 2100),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  submitted_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejection_notes text,
  -- Derived from the line tables; maintained by trigger, not by clients.
  total_transportation numeric not null default 0,
  total_accommodation numeric not null default 0,
  total_other numeric not null default 0,
  grand_total numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (site_id, month, year)
);

create index if not exists idx_expense_reports_site on public.expense_reports (site_id, year, month);

create table if not exists public.expense_transportation (
  id uuid primary key default extensions.uuid_generate_v4(),
  report_id uuid not null references public.expense_reports(id) on delete cascade,
  vehicle_name text not null,
  daily_cost numeric not null default 0,
  days_count numeric not null default 0,
  total numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_transport_report on public.expense_transportation (report_id);

create table if not exists public.expense_accommodation (
  id uuid primary key default extensions.uuid_generate_v4(),
  report_id uuid not null references public.expense_reports(id) on delete cascade,
  apartment_name text not null,
  rent_amount numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_accomm_report on public.expense_accommodation (report_id);

create table if not exists public.expense_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  report_id uuid not null references public.expense_reports(id) on delete cascade,
  category text not null default 'other' check (category in
    ('maintenance', 'materials', 'glass_facade', 'spider', 'phone', 'utilities', 'other')),
  description text not null,
  amount numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_items_report on public.expense_items (report_id);

-- ─── Approval audit trail ──────────────────────────────────────────────────
create table if not exists public.approval_logs (
  id uuid primary key default extensions.uuid_generate_v4(),
  entity_type text not null check (entity_type in ('payroll', 'expense')),
  entity_id uuid not null,
  action text not null check (action in
    ('created', 'submitted', 'approved', 'rejected', 'reset_to_draft')),
  performed_by uuid references auth.users(id),
  notes text,
  performed_at timestamptz not null default now()
);

create index if not exists idx_approval_logs_entity on public.approval_logs (entity_type, entity_id);

-- ─── Row level security ────────────────────────────────────────────────────
-- Baseline posture: every signed-in user reads and writes operational data;
-- site definitions and role assignment are admin-only. Approval-specific
-- restrictions are layered on in 20260828000001.
alter table public.user_profiles enable row level security;
alter table public.sites enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_records enable row level security;
alter table public.expense_reports enable row level security;
alter table public.expense_transportation enable row level security;
alter table public.expense_accommodation enable row level security;
alter table public.expense_items enable row level security;
alter table public.approval_logs enable row level security;

-- `create policy` has no IF NOT EXISTS, so each policy is created only when
-- absent. This keeps the migration replayable against the existing project.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('user_profiles', 'users can view own profile',
        'for select using (auth.uid() = id)'),
      ('user_profiles', 'users can update own profile',
        'for update using (auth.uid() = id)'),
      ('sites', 'authenticated users read sites',
        'for select using (auth.role() = ''authenticated'')'),
      ('employees', 'authenticated users read employees',
        'for select using (auth.role() = ''authenticated'')'),
      ('employees', 'authenticated users manage employees',
        'for all using (auth.role() = ''authenticated'')'),
      ('payroll_periods', 'authenticated users read payroll_periods',
        'for select using (auth.role() = ''authenticated'')'),
      ('payroll_periods', 'authenticated users manage payroll_periods',
        'for all using (auth.role() = ''authenticated'')'),
      ('payroll_records', 'authenticated users read payroll_records',
        'for select using (auth.role() = ''authenticated'')'),
      ('payroll_records', 'authenticated users manage payroll_records',
        'for all using (auth.role() = ''authenticated'')'),
      ('expense_reports', 'authenticated users read expense_reports',
        'for select using (auth.role() = ''authenticated'')'),
      ('expense_reports', 'authenticated users manage expense_reports',
        'for all using (auth.role() = ''authenticated'')'),
      ('expense_transportation', 'authenticated read expense_transportation',
        'for select using (auth.role() = ''authenticated'')'),
      ('expense_transportation', 'authenticated manage expense_transportation',
        'for all using (auth.role() = ''authenticated'')'),
      ('expense_accommodation', 'authenticated read expense_accommodation',
        'for select using (auth.role() = ''authenticated'')'),
      ('expense_accommodation', 'authenticated manage expense_accommodation',
        'for all using (auth.role() = ''authenticated'')'),
      ('expense_items', 'authenticated read expense_items',
        'for select using (auth.role() = ''authenticated'')'),
      ('expense_items', 'authenticated manage expense_items',
        'for all using (auth.role() = ''authenticated'')'),
      ('approval_logs', 'authenticated read approval_logs',
        'for select using (auth.role() = ''authenticated'')'),
      ('approval_logs', 'authenticated insert approval_logs',
        'for insert with check (auth.role() = ''authenticated'')')
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
