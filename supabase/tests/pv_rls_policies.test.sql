-- Executable proof that the pv_* schema refuses what the UI merely hides.
-- Run against a database built from supabase/migrations plus
-- _supabase_shim.sql:
--   psql -d plpm_test -v ON_ERROR_STOP=1 -f supabase/tests/pv_rls_policies.test.sql
-- Any failed expectation raises and aborts; a clean run prints only PASS
-- lines. Self-contained: this file is run in its own psql invocation (see
-- supabase/tests/run.sh), so it defines its own pg_temp helpers rather than
-- relying on anything rls_policies.test.sql declared.

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

-- Runs `stmt` as the anonymous role and reports whether it was rejected or
-- silently filtered to zero rows. Either outcome means anon cannot write.
create or replace function pg_temp.anon_blocked(stmt text)
returns boolean language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  execute stmt;
  get diagnostics n = row_count;
  execute 'reset role';
  return n = 0;
exception when others then
  execute 'reset role';
  return true;
end $$;

-- Returns how many rows the anonymous role can actually see, so a read
-- policy that silently stops filtering is caught rather than assumed.
create or replace function pg_temp.anon_visible_rows(stmt text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  execute stmt into n;
  execute 'reset role';
  return n;
exception when others then
  execute 'reset role';
  return 0;
end $$;

do $$
declare
  v_user1 uuid := '55555555-5555-5555-5555-555555555555';
  v_user2 uuid := '66666666-6666-6666-6666-666666666666';
  v_zone_id uuid;
  v_site_id uuid;
  v_standalone_site_id uuid;
  v_batch1 uuid;
  v_batch2 uuid;
  v_batch3 uuid;
  v_batch4 uuid;
  v_line1 uuid;
  v_active_count integer;
begin
  -- ── fixtures ────────────────────────────────────────────────────────────
  -- Re-runnable: clear anything a previous run left behind.
  delete from public.pv_payroll_lines where sheet_name = 'pv-rls-test-sheet';
  delete from public.pv_import_batches where source_filename like 'pv-rls-test-%';
  delete from public.pv_sites where sheet_key in ('pv-rls-test-site', 'pv-rls-test-standalone-site');
  delete from public.pv_zones where slug = 'pv-rls-test-zone';

  insert into auth.users (id, email) values
    (v_user1, 'pv-rls-user1@example.test'),
    (v_user2, 'pv-rls-user2@example.test')
  on conflict (id) do nothing;

  -- ── 1. anonymous callers cannot read or write any pv_* table ───────────
  perform pg_temp.expect('anon cannot read pv_zones',
    pg_temp.anon_visible_rows('select count(*) from public.pv_zones') = 0);
  perform pg_temp.expect('anon cannot insert pv_zones',
    pg_temp.anon_blocked(
      'insert into public.pv_zones (name_ar, name_en, slug) values (''X'', ''X'', ''pv-rls-anon-zone'')'));

  perform pg_temp.expect('anon cannot read pv_sites',
    pg_temp.anon_visible_rows('select count(*) from public.pv_sites') = 0);
  perform pg_temp.expect('anon cannot insert pv_sites',
    pg_temp.anon_blocked(
      'insert into public.pv_sites (name_ar, sheet_key) values (''X'', ''pv-rls-anon-site'')'));

  perform pg_temp.expect('anon cannot read pv_import_batches',
    pg_temp.anon_visible_rows('select count(*) from public.pv_import_batches') = 0);

  perform pg_temp.expect('anon cannot read pv_payroll_lines',
    pg_temp.anon_visible_rows('select count(*) from public.pv_payroll_lines') = 0);

  perform pg_temp.expect('anon cannot execute pv_activate_import_batch',
    not has_function_privilege('anon', 'public.pv_activate_import_batch(uuid)', 'execute'));

  -- ── 2. authenticated callers can read and write ─────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.pv_zones (name_ar, name_en, slug)
    values ('اختبار RLS', 'RLS Test Zone', 'pv-rls-test-zone')
    returning id into v_zone_id;

  insert into public.pv_sites (zone_id, name_ar, sheet_key)
    values (v_zone_id, 'موقع اختبار', 'pv-rls-test-site')
    returning id into v_site_id;

  insert into public.pv_sites (name_ar, sheet_key)
    values ('موقع مستقل اختبار', 'pv-rls-test-standalone-site')
    returning id into v_standalone_site_id;

  insert into public.pv_import_batches
      (zone_id, period_year, period_month, source_filename, uploaded_by, status)
    values (v_zone_id, 2099, 1, 'pv-rls-test-batch-1.xlsx', v_user1, 'processing')
    returning id into v_batch1;

  insert into public.pv_import_batches
      (zone_id, period_year, period_month, source_filename, uploaded_by, status)
    values (v_zone_id, 2099, 1, 'pv-rls-test-batch-2.xlsx', v_user2, 'processing')
    returning id into v_batch2;

  insert into public.pv_payroll_lines
      (batch_id, site_id, period_year, period_month, sheet_name, source_row_number,
       row_kind, worker_name, total_gross)
    values (v_batch1, v_site_id, 2099, 1, 'pv-rls-test-sheet', 5, 'worker', 'عامل اختبار', 1000)
    returning id into v_line1;

  execute 'reset role';

  perform pg_temp.expect('authenticated user can create a zone', v_zone_id is not null);
  perform pg_temp.expect('authenticated user can create a site', v_site_id is not null);
  perform pg_temp.expect('authenticated user can create two processing batches for the same scope+period',
    v_batch1 is not null and v_batch2 is not null);
  perform pg_temp.expect('authenticated user can insert a payroll line', v_line1 is not null);
  perform pg_temp.expect('authenticated user can read the payroll line back',
    (select count(*) from public.pv_payroll_lines where id = v_line1) = 1);

  perform pg_temp.expect('anon cannot write pv_payroll_lines',
    pg_temp.anon_blocked(
      format('insert into public.pv_payroll_lines
                (batch_id, site_id, period_year, period_month, sheet_name, source_row_number, row_kind)
              values (%L, %L, 2099, 1, ''pv-rls-test-sheet'', 1, ''worker'')',
             v_batch1, v_site_id)));

  -- ── 3. a batch must have exactly one of zone_id / scope_site_id ────────
  perform pg_temp.expect('a batch cannot have both zone_id and scope_site_id set',
    pg_temp.denied(v_user1,
      format('insert into public.pv_import_batches
                (zone_id, scope_site_id, period_year, period_month, source_filename, status)
              values (%L, %L, 2099, 2, ''pv-rls-test-bad-both.xlsx'', ''processing'')',
             v_zone_id, v_site_id)));

  perform pg_temp.expect('a batch cannot have neither zone_id nor scope_site_id set',
    pg_temp.denied(v_user1,
      'insert into public.pv_import_batches
         (period_year, period_month, source_filename, status)
       values (2099, 2, ''pv-rls-test-bad-neither.xlsx'', ''processing'')'));

  -- ── 4. pv_activate_import_batch supersedes-and-activates atomically ────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.pv_activate_import_batch(v_batch1);
  execute 'reset role';

  perform pg_temp.expect('activating batch 1 makes it active',
    (select status from public.pv_import_batches where id = v_batch1) = 'active');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.pv_activate_import_batch(v_batch2);
  execute 'reset role';

  perform pg_temp.expect('activating batch 2 supersedes batch 1',
    (select status from public.pv_import_batches where id = v_batch1) = 'superseded'
    and (select superseded_by from public.pv_import_batches where id = v_batch1) = v_batch2
    and (select status from public.pv_import_batches where id = v_batch2) = 'active');

  select count(*) into v_active_count
    from public.pv_import_batches
    where zone_id = v_zone_id and period_year = 2099 and period_month = 1 and status = 'active';
  perform pg_temp.expect('exactly one active batch remains for the zone+period',
    v_active_count = 1);

  -- ── 5. the partial unique index is the real backstop, not just the
  --      function's own logic ─────────────────────────────────────────────
  -- Bypass pv_activate_import_batch entirely and try to force a second
  -- concurrently-active batch for the same scope+period with a raw UPDATE.
  perform pg_temp.expect(
    'the partial unique index rejects a second concurrently-active batch for the same zone+period',
    pg_temp.denied(v_user1,
      format('update public.pv_import_batches set status = ''active'' where id = %L', v_batch1)));

  -- Restoring a superseded batch (the plan's "restore" action) re-activates
  -- it and supersedes whatever is currently active for that scope+period.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.pv_activate_import_batch(v_batch1);
  execute 'reset role';

  perform pg_temp.expect('restoring batch 1 supersedes batch 2',
    (select status from public.pv_import_batches where id = v_batch1) = 'active'
    and (select status from public.pv_import_batches where id = v_batch2) = 'superseded'
    and (select superseded_by from public.pv_import_batches where id = v_batch2) = v_batch1);

  -- ── 6. same guarantee for a standalone-site scope, not just a zone ─────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.pv_import_batches
      (scope_site_id, period_year, period_month, source_filename, uploaded_by, status)
    values (v_standalone_site_id, 2099, 3, 'pv-rls-test-batch-3.xlsx', v_user1, 'processing')
    returning id into v_batch3;
  perform public.pv_activate_import_batch(v_batch3);

  insert into public.pv_import_batches
      (scope_site_id, period_year, period_month, source_filename, uploaded_by, status)
    values (v_standalone_site_id, 2099, 3, 'pv-rls-test-batch-4.xlsx', v_user1, 'processing')
    returning id into v_batch4;
  perform public.pv_activate_import_batch(v_batch4);

  execute 'reset role';

  perform pg_temp.expect('activating batch 4 supersedes batch 3 for the same site+period',
    (select status from public.pv_import_batches where id = v_batch3) = 'superseded'
    and (select status from public.pv_import_batches where id = v_batch4) = 'active');

  perform pg_temp.expect(
    'the partial unique index rejects a second concurrently-active batch for the same site+period',
    pg_temp.denied(v_user1,
      format('update public.pv_import_batches set status = ''active'' where id = %L', v_batch3)));

  raise notice 'ALL PV RLS / CONSTRAINT EXPECTATIONS PASSED';
end $$;
