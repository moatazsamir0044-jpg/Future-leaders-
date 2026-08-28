\set ON_ERROR_STOP on
\set QUIET on
create or replace function assert(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS %', label;
  else raise exception 'FAIL %', label; end if;
end $$;

create or replace function rows_json(n int, gross numeric, net numeric, nm text default 'عامل')
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'worker_number', i, 'employee_name', nm || ' ' || i, 'notes', 'مواصلات صباحى',
    'attendance_days', 26, 'absence_days', 0, 'net_days', 26,
    'monthly_leave_days', 0, 'annual_leave_days', 0, 'absence_no_permission', 0,
    'holiday_extra_days', 0, 'overtime_hours', 0, 'less_hours', 0,
    'base_monthly_salary', 4000, 'daily_wage', 129.03, 'bonuses', 0,
    'transportation_amount', 250, 'transportation_category', 1,
    'advance', 0, 'insurance', 440, 'deductions', 0, 'penalties', 0,
    'total_gross', gross, 'net_salary', net))
  from generate_series(1, n) i;
$$;

do $$
declare r jsonb; pid uuid; n int; g numeric; nt numeric; st text; msg text;
begin
  -- 1. first import creates a draft period
  r := import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026, rows_json(3, 1000, 900));
  pid := (r->>'period_id')::uuid;
  perform assert((r->>'inserted')::int = 3, 'inserts every row');
  perform assert((r->>'replaced')::int = 0, 'reports nothing replaced on a first import');
  perform assert((r->>'total_gross')::numeric = 3000, 'returns the summed gross');
  select status, total_gross, total_net into st, g, nt from payroll_periods where id = pid;
  perform assert(st = 'draft', 'creates the period as a draft');
  perform assert(g = 3000 and nt = 2700, 'writes the period totals from the rows');
  select count(*) into n from payroll_records where period_id = pid;
  perform assert(n = 3, 'stores all three records');
  perform assert(exists (select 1 from payroll_records where period_id=pid and notes='مواصلات صباحى'),
    'keeps the section label in notes');
  perform assert(exists (select 1 from approval_logs where entity_id=pid and action='created'),
    'writes an audit log entry');

  -- 2. re-importing the same month replaces, never duplicates
  r := import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026, rows_json(2, 500, 400));
  perform assert((r->>'period_id')::uuid = pid, 'reuses the same period on re-import');
  perform assert((r->>'replaced')::int = 3, 'reports how many rows it replaced');
  select count(*) into n from payroll_records where period_id = pid;
  perform assert(n = 2, 'leaves only the new rows behind');
  select total_gross into g from payroll_periods where id = pid;
  perform assert(g = 1000, 'recomputes the period totals after replacement');

  -- 3. a rejected sheet may be re-imported
  update payroll_periods set status='rejected' where id=pid;
  r := import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026, rows_json(1, 100, 90));
  perform assert((r->>'inserted')::int = 1, 'allows import over a rejected sheet');

  -- 4. a submitted sheet is refused
  update payroll_periods set status='submitted' where id=pid;
  begin
    perform import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026, rows_json(1, 1, 1));
    perform assert(false, 'should refuse a submitted sheet');
  exception when sqlstate '55006' then
    perform assert(true, 'refuses to overwrite a submitted sheet');
  end;

  -- 5. an approved sheet is refused, and is left untouched
  update payroll_periods set status='approved' where id=pid;
  begin
    perform import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026, rows_json(9, 1, 1));
    perform assert(false, 'should refuse an approved sheet');
  exception when sqlstate '55006' then
    select count(*) into n from payroll_records where period_id = pid;
    perform assert(n = 1, 'leaves an approved sheet''s rows untouched');
  end;
  update payroll_periods set status='draft' where id=pid;
end $$;

do $$
declare n int; g numeric; msg text;
begin
  -- 6. validation refusals
  begin
    perform import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026, '[]'::jsonb);
    perform assert(false, 'should refuse an empty sheet');
  exception when sqlstate '22023' then perform assert(true, 'refuses an empty sheet'); end;

  begin
    perform import_payroll_sheet('11111111-1111-1111-1111-111111111111', 13, 2026, rows_json(1,1,1));
    perform assert(false, 'should refuse month 13');
  exception when sqlstate '22023' then perform assert(true, 'refuses an impossible month'); end;

  begin
    perform import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 1999, rows_json(1,1,1));
    perform assert(false, 'should refuse year 1999');
  exception when sqlstate '22023' then perform assert(true, 'refuses an out-of-range year'); end;

  begin
    perform import_payroll_sheet('99999999-9999-9999-9999-999999999999', 8, 2026, rows_json(1,1,1));
    perform assert(false, 'should refuse an unknown site');
  exception when sqlstate '23503' then perform assert(true, 'refuses an unknown site'); end;

  begin
    perform import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026,
      '[{"employee_name":"  ","total_gross":1,"net_salary":1}]'::jsonb);
    perform assert(false, 'should refuse a nameless row');
  exception when sqlstate '23514' then perform assert(true, 'refuses a row with no employee name'); end;
end $$;

-- 7. atomicity: a failure after the delete must roll the delete back
do $$
declare pid uuid; n int; g numeric;
begin
  select id, total_gross into pid, g from payroll_periods
   where site_id='11111111-1111-1111-1111-111111111111' and month=8 and year=2026;
  select count(*) into n from payroll_records where period_id = pid;
  perform assert(n = 1, 'starts from a known state');
  begin
    -- worker_number is not an integer: this fails during the insert, i.e.
    -- after the existing rows have already been deleted inside the function.
    perform import_payroll_sheet('11111111-1111-1111-1111-111111111111', 8, 2026,
      '[{"worker_number":"not-a-number","employee_name":"عامل","total_gross":1,"net_salary":1}]'::jsonb);
    perform assert(false, 'should fail on a bad worker number');
  exception when others then
    select count(*) into n from payroll_records where period_id = pid;
    perform assert(n = 1, 'rolls the delete back when the insert fails — no rows lost');
    perform assert((select total_gross from payroll_periods where id=pid) = g,
      'leaves the period totals untouched after a failed import');
  end;
end $$;

-- 8. defaults, trimming and null handling
do $$
declare r jsonb; pid uuid; rec payroll_records%rowtype;
begin
  r := import_payroll_sheet('22222222-2222-2222-2222-222222222222', 8, 2026,
    '[{"employee_name":"  محمد أحمد  ","notes":"   ","total_gross":1234.56,"net_salary":1000.5}]'::jsonb);
  pid := (r->>'period_id')::uuid;
  select * into rec from payroll_records where period_id = pid;
  perform assert(rec.employee_name = 'محمد أحمد', 'trims whitespace around the name');
  perform assert(rec.notes is null, 'stores a blank section label as null');
  perform assert(rec.attendance_days = 0 and rec.insurance = 0, 'defaults absent columns to zero');
  perform assert(rec.worker_number is null, 'accepts a row with no worker number');
  perform assert(rec.employee_id is null, 'leaves employee_id null, as the manual form does');
  perform assert(rec.total_gross = 1234.56 and rec.net_salary = 1000.5, 'stores money exactly as given');
  perform assert((select total_gross from payroll_periods where id=pid) = 1234.56, 'totals match the single row');
end $$;

-- 9. scale: 2000 rows in one call, totals exact to the piastre
do $$
declare r jsonb; payload jsonb; expected numeric;
begin
  select jsonb_agg(jsonb_build_object(
           'worker_number', i, 'employee_name', 'عامل ' || i,
           'total_gross', round((2500 + i * 13.37)::numeric, 2),
           'net_salary',  round((2300 + i * 11.11)::numeric, 2)))
    into payload from generate_series(1, 2000) i;
  select sum(round((2500 + i * 13.37)::numeric, 2)) into expected from generate_series(1,2000) i;
  r := import_payroll_sheet('22222222-2222-2222-2222-222222222222', 9, 2026, payload);
  perform assert((r->>'inserted')::int = 2000, 'writes two thousand rows in one call');
  perform assert((r->>'total_gross')::numeric = expected, 'sums two thousand rows exactly');
end $$;

select 'ALL SQL TESTS PASSED' as result;
