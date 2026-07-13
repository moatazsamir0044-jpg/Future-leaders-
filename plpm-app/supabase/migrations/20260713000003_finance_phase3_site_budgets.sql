-- Finance ERP Phase 3: per-site monthly budgets
-- Source: FM questionnaire — a budget per site exists and performance is
-- compared against it. Powers the morning report: planned headcount vs the
-- active roster (shortfall flags) and payroll/expense actuals vs budget.

create table if not exists site_budgets (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid not null references sites(id),
  month integer not null check (month between 1 and 12),
  year integer not null,
  planned_headcount integer not null default 0 check (planned_headcount >= 0),
  budget_payroll numeric not null default 0 check (budget_payroll >= 0),
  budget_expenses numeric not null default 0 check (budget_expenses >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (site_id, year, month)
);

create index if not exists site_budgets_period_idx on site_budgets (year, month);

alter table site_budgets enable row level security;

create policy "authenticated read site_budgets" on site_budgets
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage site_budgets" on site_budgets
  for all using (auth.role() = 'authenticated');
