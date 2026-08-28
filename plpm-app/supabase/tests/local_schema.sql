create extension if not exists "uuid-ossp";
create schema if not exists auth;
-- Stand-in for Supabase's auth.uid(); production supplies the real one.
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table sites (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  name_ar text,
  service_type text not null default 'hk' check (service_type in ('hk','ls','fm','other')),
  client_name text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  sheet_key text
);
create unique index sites_sheet_key_unique on sites (lower(btrim(sheet_key))) where sheet_key is not null;

create table payroll_periods (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid not null references sites(id),
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2020 and 2100),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_by uuid, approved_by uuid,
  submitted_at timestamptz, approved_at timestamptz,
  rejection_notes text,
  total_gross numeric not null default 0,
  total_net numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (site_id, month, year)
);

create table payroll_records (
  id uuid primary key default uuid_generate_v4(),
  period_id uuid not null references payroll_periods(id),
  employee_id uuid,
  site_id uuid not null references sites(id),
  worker_number integer,
  employee_name text not null,
  attendance_days numeric not null default 0,
  absence_days numeric not null default 0,
  net_days numeric not null default 0,
  monthly_leave_days numeric not null default 0,
  annual_leave_days numeric not null default 0,
  absence_no_permission numeric not null default 0,
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
  created_at timestamptz not null default now(),
  holiday_extra_days numeric not null default 0
);

create table approval_logs (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('payroll','expense')),
  entity_id uuid not null,
  action text not null check (action in ('created','submitted','approved','rejected','reset')),
  performed_by uuid,
  notes text,
  performed_at timestamptz not null default now()
);

create role authenticated;

insert into sites (id, name, sheet_key) values
  ('11111111-1111-1111-1111-111111111111', 'Mall of Egypt - HK', 'MOE HK'),
  ('22222222-2222-2222-2222-222222222222', 'Arkan Plaza - HK', 'Arkan HK');
