-- Search support indexes for the payroll viewer.
--
-- Worker names aren't a reliable join key (worker_number isn't stable/unique
-- across files, and spelling drifts between sheets), so the search/filter UI
-- leans on fuzzy name search: a trigram index on worker_name, driving
-- `ilike '%...%'` and `%` similarity queries efficiently even at low
-- thousands of rows without a sequential scan.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_pv_payroll_lines_worker_name_trgm
  on public.pv_payroll_lines
  using gin (worker_name extensions.gin_trgm_ops);

-- Supports the records/search UI's dependent site + period filters.
create index if not exists idx_pv_payroll_lines_site_period
  on public.pv_payroll_lines (site_id, period_year, period_month);

-- Supports period-only filtering (e.g. "this month across all zones") and
-- the dashboard/rollup queries that group by period first.
create index if not exists idx_pv_payroll_lines_period_lookup
  on public.pv_payroll_lines (period_year, period_month);
