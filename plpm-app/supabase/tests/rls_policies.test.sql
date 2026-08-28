-- Executable proof that the database refuses what the UI merely hid.
-- Run against a database built from supabase/migrations plus _supabase_shim.sql:
--   psql -d plpm_test -v ON_ERROR_STOP=1 -f supabase/tests/rls_policies.test.sql
-- Any failed expectation raises and aborts; a clean run prints only PASS lines.

set client_min_messages to notice;

create or replace function pg_temp.expect(label text, ok boolean)
returns void language plpgsql as $$
begin
  if ok then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end $$;

-- Runs `stmt` as the given user and reports whether it was rejected.
create or replace function pg_temp.denied(p_user uuid, stmt text)
returns boolean language plpgsql as $$
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute stmt;
    execute 'reset role';
    return false;
  exception when others then
    execute 'reset role';
    return true;
  end;
end $$;

-- Same, but reports whether the statement changed any row (RLS can filter
-- silently instead of raising).
create or replace function pg_temp.rows_changed(p_user uuid, stmt text)
returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt;
  get diagnostics n = row_count;
  execute 'reset role';
  return n;
exception when others then
  execute 'reset role';
  return -1;
end $$;

do $$
declare
  admin_id uuid := '11111111-1111-1111-1111-111111111111';
  finance_id uuid := '22222222-2222-2222-2222-222222222222';
  site_id uuid;
  draft_period uuid;
  approved_period uuid;
  v_report_id uuid;
  n integer;
begin
  -- ── fixtures ────────────────────────────────────────────────────────────
  -- Re-runnable: clear anything a previous run left behind.
  delete from public.approval_logs where performed_by in (admin_id, finance_id);
  delete from public.payroll_records where period_id in
    (select id from public.payroll_periods where year = 2099);
  delete from public.payroll_periods where year = 2099;
  delete from public.expense_transportation where report_id in
    (select id from public.expense_reports where year = 2099);
  delete from public.expense_accommodation where report_id in
    (select id from public.expense_reports where year = 2099);
  delete from public.expense_items where report_id in
    (select id from public.expense_reports where year = 2099);
  delete from public.expense_reports where year = 2099;

  insert into auth.users (id, email) values
    (admin_id, 'admin@example.test'), (finance_id, 'finance@example.test')
  on conflict (id) do nothing;
  update public.user_profiles set role = 'admin', full_name = 'Admin' where id = admin_id;
  update public.user_profiles set role = 'finance', full_name = 'Finance' where id = finance_id;

  select id into site_id from public.sites limit 1;

  insert into public.payroll_periods (site_id, month, year, status)
    values (site_id, 1, 2099, 'draft') returning id into draft_period;
  insert into public.payroll_records (period_id, site_id, employee_name, total_gross, net_salary)
    values (draft_period, site_id, 'Test Worker', 1000, 900);

  insert into public.payroll_periods (site_id, month, year, status)
    values (site_id, 2, 2099, 'approved') returning id into approved_period;

  insert into public.expense_reports (site_id, month, year, status)
    values (site_id, 1, 2099, 'draft') returning id into v_report_id;

  -- ── 1. privilege escalation ─────────────────────────────────────────────
  n := pg_temp.rows_changed(finance_id,
    format('update public.user_profiles set role = ''admin'' where id = %L', finance_id));
  perform pg_temp.expect('finance user cannot promote itself to admin',
    n <= 0 and (select role from public.user_profiles where id = finance_id) = 'finance');

  perform pg_temp.expect('finance user can still rename itself',
    pg_temp.rows_changed(finance_id,
      format('update public.user_profiles set full_name = ''Renamed'' where id = %L', finance_id)) = 1);

  perform pg_temp.expect('admin can promote another user',
    pg_temp.rows_changed(admin_id,
      format('update public.user_profiles set role = ''admin'' where id = %L', finance_id)) = 1);
  update public.user_profiles set role = 'finance' where id = finance_id;

  -- ── 2. approval workflow ────────────────────────────────────────────────
  perform pg_temp.expect('finance user cannot approve a payroll sheet',
    pg_temp.denied(finance_id,
      format('update public.payroll_periods set status = ''approved'' where id = %L', draft_period)));

  perform pg_temp.expect('nobody can jump draft -> approved',
    pg_temp.denied(admin_id,
      format('update public.payroll_periods set status = ''approved'' where id = %L', draft_period)));

  perform pg_temp.expect('finance user can submit a draft sheet',
    pg_temp.rows_changed(finance_id,
      format('update public.payroll_periods set status = ''submitted'' where id = %L', draft_period)) = 1);
  perform pg_temp.expect('submitting stamps submitted_by server-side',
    (select submitted_by from public.payroll_periods where id = draft_period) = finance_id);

  perform pg_temp.expect('finance user cannot approve a submitted sheet',
    pg_temp.denied(finance_id,
      format('update public.payroll_periods set status = ''approved'' where id = %L', draft_period)));
  perform pg_temp.expect('admin can approve a submitted sheet',
    pg_temp.rows_changed(admin_id,
      format('update public.payroll_periods set status = ''approved'' where id = %L', draft_period)) = 1);
  perform pg_temp.expect('approving stamps approved_by server-side',
    (select approved_by from public.payroll_periods where id = draft_period) = admin_id);

  perform pg_temp.expect('finance user cannot reopen an approved sheet',
    pg_temp.denied(finance_id,
      format('update public.payroll_periods set status = ''draft'' where id = %L', draft_period)));

  -- Rejection path: an expense report submitted, then rejected by the admin.
  perform pg_temp.rows_changed(finance_id,
    format('update public.expense_reports set status = ''submitted'' where id = %L', v_report_id));
  perform pg_temp.expect('admin can reject a submitted report with a reason',
    pg_temp.rows_changed(admin_id,
      format('update public.expense_reports set status = ''rejected'', rejection_notes = ''Fix the transport lines'' where id = %L', v_report_id)) = 1);
  perform pg_temp.expect('rejection keeps the reviewer note',
    (select rejection_notes from public.expense_reports where id = v_report_id) = 'Fix the transport lines');
  perform pg_temp.expect('rejection does not record an approver',
    (select approved_by from public.expense_reports where id = v_report_id) is null
    and (select approved_at from public.expense_reports where id = v_report_id) is null);
  -- The author must be able to act on a rejection without waiting for an admin.
  perform pg_temp.expect('a rejected report can be reopened by its author',
    pg_temp.rows_changed(finance_id,
      format('update public.expense_reports set status = ''draft'' where id = %L', v_report_id)) = 1);
  perform pg_temp.expect('reopening clears the rejection note',
    (select rejection_notes from public.expense_reports where id = v_report_id) is null);

  -- ── 3. approved sheets are frozen ───────────────────────────────────────
  perform pg_temp.expect('records of an approved sheet cannot be edited',
    pg_temp.denied(finance_id,
      format('update public.payroll_records set net_salary = 1 where period_id = %L', draft_period)));
  perform pg_temp.expect('records cannot be added to an approved sheet',
    pg_temp.denied(finance_id,
      format('insert into public.payroll_records (period_id, site_id, employee_name) values (%L, %L, ''X'')',
             draft_period, site_id)));
  perform pg_temp.expect('records of an approved sheet cannot be deleted',
    pg_temp.denied(finance_id,
      format('delete from public.payroll_records where period_id = %L', draft_period)));
  perform pg_temp.expect('lines cannot be added to an approved expense report',
    pg_temp.denied(finance_id,
      format('insert into public.expense_items (report_id, description, amount) values (%L, ''X'', 5)',
             approved_period)));

  perform pg_temp.expect('admin can reopen an approved sheet',
    pg_temp.rows_changed(admin_id,
      format('update public.payroll_periods set status = ''draft'' where id = %L', draft_period)) = 1);
  perform pg_temp.expect('reopening clears the approval stamp',
    (select approved_by from public.payroll_periods where id = draft_period) is null);
  perform pg_temp.expect('records are editable again once reopened',
    pg_temp.rows_changed(finance_id,
      format('update public.payroll_records set bonuses = 50 where period_id = %L', draft_period)) = 1);

  -- ── 4. derived totals ───────────────────────────────────────────────────
  perform pg_temp.expect('sheet totals track their records',
    (select total_gross from public.payroll_periods where id = draft_period) = 1000
    and (select total_net from public.payroll_periods where id = draft_period) = 900);

  perform pg_temp.rows_changed(admin_id,
    format('update public.payroll_periods set total_gross = 999999 where id = %L', draft_period));
  perform pg_temp.expect('a client cannot overwrite derived sheet totals',
    (select total_gross from public.payroll_periods where id = draft_period) = 1000);

  insert into public.expense_transportation (report_id, vehicle_name, daily_cost, days_count)
    values (v_report_id, 'Van', 100, 3);
  insert into public.expense_items (report_id, description, amount)
    values (v_report_id, 'Materials', 250);
  perform pg_temp.expect('expense line total is derived from cost x days',
    (select total from public.expense_transportation where report_id = v_report_id) = 300);
  perform pg_temp.expect('expense report totals roll up from their lines',
    (select grand_total from public.expense_reports where id = v_report_id) = 550);

  delete from public.expense_items where report_id = v_report_id;
  perform pg_temp.expect('deleting a line rolls the report total back down',
    (select grand_total from public.expense_reports where id = v_report_id) = 300);

  -- ── 5. audit trail ──────────────────────────────────────────────────────
  perform pg_temp.expect('reset_to_draft is a valid audit action',
    not pg_temp.denied(admin_id,
      format('insert into public.approval_logs (entity_type, entity_id, action) values (''payroll'', %L, ''reset_to_draft'')',
             draft_period)));
  perform pg_temp.expect('audit rows record the acting user',
    (select performed_by from public.approval_logs
      where entity_id = draft_period and action = 'reset_to_draft') = admin_id);
  perform pg_temp.expect('audit rows cannot be rewritten',
    pg_temp.rows_changed(admin_id,
      'update public.approval_logs set notes = ''tampered'' where action = ''reset_to_draft''') <= 0);

  -- ── 6. last admin ───────────────────────────────────────────────────────
  perform pg_temp.expect('the last remaining admin cannot be demoted',
    pg_temp.denied(admin_id,
      format('update public.user_profiles set role = ''finance'' where id = %L', admin_id)));

  raise notice 'ALL RLS / TRIGGER EXPECTATIONS PASSED';
end $$;
