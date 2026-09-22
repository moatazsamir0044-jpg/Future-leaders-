-- Derived rollup views for the payroll viewer. Plain SQL views, not
-- materialized: data volume is low thousands of rows/month, so the
-- staleness/refresh complexity of a materialized view isn't worth it.
--
-- All three are created WITH (security_invoker = true). Without that option,
-- a view checks privileges and evaluates RLS policies as the VIEW OWNER, not
-- the querying user — which would silently bypass the "authenticated only"
-- policies on pv_payroll_lines / pv_import_batches for anyone who can select
-- from the view. security_invoker = true makes each view enforce RLS exactly
-- as if the underlying tables were queried directly.
--
-- Only 'worker' and 'non_worker_cost' rows are summed into money totals.
-- 'subtotal' rows are the sheet's own pre-aggregated subtotal lines — summing
-- them alongside the rows they subtotal would double-count. 'unknown' rows
-- are excluded from sums (to avoid corrupting a rollup with an unclassified
-- row that might itself be a subtotal or duplicate) but are never deleted —
-- they stay fully visible via the row-level search/browse UI, per the
-- "nothing is ever silently lost" design.

-- ─── Per site, per period ───────────────────────────────────────────────────
-- Replicates the source workbook's own `Total` tab: sums from active-batch
-- lines only.
create or replace view public.pv_site_period_rollup
  with (security_invoker = true) as
select
  s.id as site_id,
  s.zone_id,
  l.period_year,
  l.period_month,
  count(*) filter (where l.row_kind = 'worker') as worker_count,
  coalesce(sum(l.total_gross) filter (where l.row_kind in ('worker', 'non_worker_cost')), 0) as total_gross,
  coalesce(sum(l.net_salary) filter (where l.row_kind in ('worker', 'non_worker_cost')), 0) as net_salary,
  coalesce(sum(l.insurance) filter (where l.row_kind in ('worker', 'non_worker_cost')), 0) as insurance,
  coalesce(sum(l.deductions) filter (where l.row_kind in ('worker', 'non_worker_cost')), 0) as deductions,
  coalesce(sum(l.advance) filter (where l.row_kind in ('worker', 'non_worker_cost')), 0) as advance,
  coalesce(sum(l.bonuses) filter (where l.row_kind in ('worker', 'non_worker_cost')), 0) as bonuses,
  coalesce(sum(l.transportation_amount) filter (where l.row_kind in ('worker', 'non_worker_cost')), 0) as transportation_amount
from public.pv_payroll_lines l
join public.pv_import_batches b on b.id = l.batch_id and b.status = 'active'
join public.pv_sites s on s.id = l.site_id
group by s.id, s.zone_id, l.period_year, l.period_month;

-- ─── Per zone, per period ───────────────────────────────────────────────────
create or replace view public.pv_zone_period_rollup
  with (security_invoker = true) as
select
  zone_id,
  period_year,
  period_month,
  count(*) as site_count,
  sum(worker_count) as worker_count,
  sum(total_gross) as total_gross,
  sum(net_salary) as net_salary,
  sum(insurance) as insurance,
  sum(deductions) as deductions,
  sum(advance) as advance,
  sum(bonuses) as bonuses,
  sum(transportation_amount) as transportation_amount
from public.pv_site_period_rollup
where zone_id is not null
group by zone_id, period_year, period_month;

-- ─── Month-over-month, per site ─────────────────────────────────────────────
-- Replicates the source workbook's `مقارنه` (comparison) tab: a lag()-based
-- delta per site. Positive delta = increase, matching the source's
-- red-for-increase convention (the UI, not this view, owns that coloring).
create or replace view public.pv_month_over_month
  with (security_invoker = true) as
select
  site_id,
  zone_id,
  period_year,
  period_month,
  worker_count,
  total_gross,
  net_salary,
  worker_count - lag(worker_count) over w as worker_count_delta,
  total_gross - lag(total_gross) over w as total_gross_delta,
  net_salary - lag(net_salary) over w as net_salary_delta
from public.pv_site_period_rollup
window w as (partition by site_id order by period_year, period_month);
