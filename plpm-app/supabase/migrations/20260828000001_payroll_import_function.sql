-- Atomic payroll sheet import.
--
-- The importer sends one site's parsed rows here and this function does the
-- whole replacement in a single transaction: no half-written sheet, no
-- duplicated rows when the same file is uploaded twice, and no possibility of
-- the period's totals disagreeing with the rows underneath them.
--
-- It deliberately does not compute anybody's pay. Every figure is stored as
-- the site's own sheet had it; the only arithmetic here is summing the rows to
-- fill the period header, which is the same sum the sheet UI already shows.

create or replace function public.import_payroll_sheet(
  p_site_id uuid,
  p_month   integer,
  p_year    integer,
  p_rows    jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_period_id uuid;
  v_status    text;
  v_inserted  integer;
  v_replaced  integer := 0;
  v_gross     numeric;
  v_net       numeric;
begin
  if p_site_id is null then
    raise exception 'A site is required.' using errcode = '22023';
  end if;
  if p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Month must be between 1 and 12 (got %).', p_month using errcode = '22023';
  end if;
  if p_year is null or p_year < 2020 or p_year > 2100 then
    raise exception 'Year must be between 2020 and 2100 (got %).', p_year using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'Refusing to import a sheet with no rows.' using errcode = '22023';
  end if;

  if not exists (select 1 from sites where id = p_site_id) then
    raise exception 'Unknown site %.', p_site_id using errcode = '23503';
  end if;

  -- Every row must be attributable to a person before anything is written.
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(employee_name text)
    where r.employee_name is null or btrim(r.employee_name) = ''
  ) then
    raise exception 'Every imported row must carry an employee name.' using errcode = '23514';
  end if;

  select id, status into v_period_id, v_status
  from payroll_periods
  where site_id = p_site_id and month = p_month and year = p_year
  for update;

  -- A sheet that has been sent for approval, or already approved, is a record
  -- someone has signed off on. An import must never overwrite one silently.
  if v_period_id is not null and v_status not in ('draft', 'rejected') then
    raise exception
      'This site''s %/% sheet is already "%" and cannot be overwritten by an import. Reset it to draft first.',
      p_month, p_year, v_status
      using errcode = '55006';
  end if;

  if v_period_id is null then
    insert into payroll_periods (site_id, month, year, status, total_gross, total_net)
    values (p_site_id, p_month, p_year, 'draft', 0, 0)
    returning id into v_period_id;
  else
    select count(*) into v_replaced from payroll_records where period_id = v_period_id;
    delete from payroll_records where period_id = v_period_id;
  end if;

  insert into payroll_records (
    period_id, site_id, employee_id, worker_number, employee_name, notes,
    attendance_days, absence_days, net_days, monthly_leave_days, annual_leave_days,
    absence_no_permission, holiday_extra_days, overtime_hours, less_hours,
    base_monthly_salary, daily_wage, bonuses, transportation_amount,
    transportation_category, advance, insurance, deductions, penalties,
    total_gross, net_salary
  )
  select
    v_period_id, p_site_id, null, r.worker_number, btrim(r.employee_name), nullif(btrim(coalesce(r.notes, '')), ''),
    coalesce(r.attendance_days, 0), coalesce(r.absence_days, 0), coalesce(r.net_days, 0),
    coalesce(r.monthly_leave_days, 0), coalesce(r.annual_leave_days, 0),
    coalesce(r.absence_no_permission, 0), coalesce(r.holiday_extra_days, 0),
    coalesce(r.overtime_hours, 0), coalesce(r.less_hours, 0),
    coalesce(r.base_monthly_salary, 0), coalesce(r.daily_wage, 0), coalesce(r.bonuses, 0),
    coalesce(r.transportation_amount, 0), coalesce(r.transportation_category, 0),
    coalesce(r.advance, 0), coalesce(r.insurance, 0), coalesce(r.deductions, 0),
    coalesce(r.penalties, 0), coalesce(r.total_gross, 0), coalesce(r.net_salary, 0)
  from jsonb_to_recordset(p_rows) as r(
    worker_number          integer,
    employee_name          text,
    notes                  text,
    attendance_days        numeric,
    absence_days           numeric,
    net_days               numeric,
    monthly_leave_days     numeric,
    annual_leave_days      numeric,
    absence_no_permission  numeric,
    holiday_extra_days     numeric,
    overtime_hours         numeric,
    less_hours             numeric,
    base_monthly_salary    numeric,
    daily_wage             numeric,
    bonuses                numeric,
    transportation_amount  numeric,
    transportation_category numeric,
    advance                numeric,
    insurance              numeric,
    deductions             numeric,
    penalties              numeric,
    total_gross            numeric,
    net_salary             numeric
  );

  get diagnostics v_inserted = row_count;

  if v_inserted <> jsonb_array_length(p_rows) then
    raise exception 'Expected to write % rows but wrote %.', jsonb_array_length(p_rows), v_inserted
      using errcode = 'data_exception';
  end if;

  select coalesce(sum(total_gross), 0), coalesce(sum(net_salary), 0)
    into v_gross, v_net
  from payroll_records
  where period_id = v_period_id;

  update payroll_periods
     set total_gross = v_gross,
         total_net   = v_net
   where id = v_period_id;

  insert into approval_logs (entity_type, entity_id, action, performed_by, notes)
  values ('payroll', v_period_id, 'created', auth.uid(),
          format('Excel import: %s rows written%s.', v_inserted,
                 case when v_replaced > 0 then format(', replacing %s', v_replaced) else '' end));

  return jsonb_build_object(
    'period_id',   v_period_id,
    'inserted',    v_inserted,
    'replaced',    v_replaced,
    'total_gross', v_gross,
    'total_net',   v_net
  );
end;
$$;

comment on function public.import_payroll_sheet(uuid, integer, integer, jsonb) is
  'Replaces one site''s payroll sheet for a month in a single transaction. Refuses submitted/approved periods. Stores the sheet''s own figures without recomputing them.';

-- Supabase's default privileges on the public schema grant EXECUTE on every new
-- function to anon as well as authenticated, so anon has to be revoked by name;
-- revoking from PUBLIC alone does not remove it. Row-level security would
-- already refuse an anonymous caller's writes, but importing payroll is not
-- something a signed-out request should be able to reach at all.
revoke all on function public.import_payroll_sheet(uuid, integer, integer, jsonb) from public;
revoke all on function public.import_payroll_sheet(uuid, integer, integer, jsonb) from anon;
grant execute on function public.import_payroll_sheet(uuid, integer, integer, jsonb) to authenticated;
