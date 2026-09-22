-- Enforce in the database the rules the UI only pretended to enforce.
--
-- Everything here closes a gap that was reachable with nothing but the public
-- anon key and a valid session, because the app's authorisation lived in
-- React and PostgREST never saw it:
--
--   1. `user_profiles` let a user UPDATE their own row with no restriction on
--      `role`, so any 'finance' account could promote itself to 'admin' with a
--      single PATCH.
--   2. payroll_periods / expense_reports were `for all using (authenticated)`,
--      so any signed-in user could set status='approved' and rewrite
--      total_gross / total_net directly, bypassing the admin-only buttons.
--   3. Nothing stopped edits to an approved sheet's line items, so approval
--      guaranteed nothing about the figures it approved.
--   4. Sheet and report totals were computed in the browser and written back
--      read-modify-write, so two concurrent editors silently lost each other's
--      figures. They are now derived by trigger and clients cannot set them.
--   5. approval_logs' CHECK constraint rejected 'reset_to_draft' — the exact
--      value the app writes — so every reset dropped its audit row.

-- ─── 0. Privileged contexts ────────────────────────────────────────────────
-- Migrations, backfills and the service-role client run without an end-user
-- JWT. They must not be caught by the guards below, which exist to constrain
-- what a signed-in browser session can do. RLS still bars the anon role, so
-- treating "no authenticated user" as privileged does not open anything up.
create or replace function public.is_privileged_context()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is null or coalesce(auth.role(), '') = 'service_role';
$$;

-- ─── 1. Role assignment is admin-only ──────────────────────────────────────
-- Users keep editing their own display name; only an admin may change a role.
-- The WITH CHECK on the self-update policy pins `role` to its current value,
-- which is what actually blocks the escalation (a missing WITH CHECK on an
-- UPDATE policy falls back to USING, which said nothing about `role`).
drop policy if exists "users can update own profile" on public.user_profiles;
create policy "users can update own profile" on public.user_profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.user_profiles p where p.id = auth.uid())
  );

drop policy if exists "admins update all profiles" on public.user_profiles;
create policy "admins update all profiles" on public.user_profiles
  for update
  using (public.is_plpm_admin())
  with check (public.is_plpm_admin());

-- The system must never end up with zero admins: an org that demotes its last
-- admin can no longer manage sites, roles, or approvals at all.
create or replace function public.enforce_last_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.user_profiles where role = 'admin') <= 1 then
    raise exception 'Cannot remove the last admin — promote another user first'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_last_admin on public.user_profiles;
create trigger trg_enforce_last_admin
  before update of role on public.user_profiles
  for each row execute function public.enforce_last_admin();

-- ─── 2. Only admins may approve, reject, or reopen ─────────────────────────
-- RLS cannot see the *previous* row on UPDATE, so the transition rules live
-- in a trigger. It also rejects transitions that skip a step (draft is not
-- directly approvable) and stamps the audit columns server-side so they
-- cannot be forged by the client.
create or replace function public.enforce_workflow_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  -- Data-fix migrations and service-role jobs set status directly.
  if public.is_privileged_context() then
    return new;
  end if;

  -- draft ⇄ submitted → approved / rejected; approved and rejected reopen to draft.
  allowed := case old.status
    when 'draft'     then array['submitted']
    when 'submitted' then array['approved', 'rejected', 'draft']
    when 'approved'  then array['draft']
    when 'rejected'  then array['draft', 'submitted']
    else array[]::text[]
  end;

  if not (new.status = any (allowed)) then
    raise exception 'Invalid status transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Approving and rejecting are the reviewer's decisions, and undoing an
  -- approval is privileged because it reopens figures that were signed off.
  -- Reopening a *rejected* sheet is not: that is its author picking up the
  -- correction they were asked for, and gating it on an admin would make a
  -- rejection a dead end only an admin could clear.
  if new.status in ('approved', 'rejected')
     or (old.status = 'approved' and new.status = 'draft') then
    if not public.is_plpm_admin() then
      raise exception 'Only an admin can approve, reject, or reopen an approved record'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Audit columns are set here, never trusted from the client payload.
  if new.status = 'submitted' then
    new.submitted_by := auth.uid();
    new.submitted_at := now();
    new.approved_by := null;
    new.approved_at := null;
  elsif new.status = 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
    new.rejection_notes := null;
  elsif new.status = 'rejected' then
    -- Deliberately not approved_by: a column named "approved by" holding the
    -- person who rejected the sheet would be read back as an approval. Who
    -- rejected it, and why, is in approval_logs.
    new.approved_by := null;
    new.approved_at := null;
  elsif new.status = 'draft' then
    new.submitted_by := null;
    new.submitted_at := null;
    new.approved_by := null;
    new.approved_at := null;
    new.rejection_notes := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payroll_periods_workflow on public.payroll_periods;
create trigger trg_payroll_periods_workflow
  before update on public.payroll_periods
  for each row execute function public.enforce_workflow_transition();

drop trigger if exists trg_expense_reports_workflow on public.expense_reports;
create trigger trg_expense_reports_workflow
  before update on public.expense_reports
  for each row execute function public.enforce_workflow_transition();

-- ─── 3. Approved and submitted sheets are frozen ───────────────────────────
-- A sheet under review or already approved must not have its figures moved.
-- Reopening it to draft (admin-only, above) is the way to edit again.
create or replace function public.reject_if_parent_locked(p_status text)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_privileged_context() then
    return;
  end if;
  if p_status in ('submitted', 'approved') then
    raise exception 'This sheet is % and cannot be edited — reopen it to draft first', p_status
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.guard_payroll_record_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  parent uuid := coalesce(new.period_id, old.period_id);
  st text;
begin
  select status into st from public.payroll_periods where id = parent;
  -- A cascade delete from the period itself leaves no parent row to check.
  if st is not null then
    perform public.reject_if_parent_locked(st);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_payroll_records on public.payroll_records;
create trigger trg_guard_payroll_records
  before insert or update or delete on public.payroll_records
  for each row execute function public.guard_payroll_record_edit();

create or replace function public.guard_expense_line_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  parent uuid := coalesce(new.report_id, old.report_id);
  st text;
begin
  select status into st from public.expense_reports where id = parent;
  if st is not null then
    perform public.reject_if_parent_locked(st);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_expense_transportation on public.expense_transportation;
create trigger trg_guard_expense_transportation
  before insert or update or delete on public.expense_transportation
  for each row execute function public.guard_expense_line_edit();

drop trigger if exists trg_guard_expense_accommodation on public.expense_accommodation;
create trigger trg_guard_expense_accommodation
  before insert or update or delete on public.expense_accommodation
  for each row execute function public.guard_expense_line_edit();

drop trigger if exists trg_guard_expense_items on public.expense_items;
create trigger trg_guard_expense_items
  before insert or update or delete on public.expense_items
  for each row execute function public.guard_expense_line_edit();

-- ─── 4. Totals are derived, never supplied ─────────────────────────────────
-- Recomputed from the line rows on every change, so two people editing the
-- same sheet can no longer overwrite each other's totals with a stale sum.
create or replace function public.recalc_payroll_period_totals()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  parent uuid := coalesce(new.period_id, old.period_id);
begin
  update public.payroll_periods p
     set total_gross = coalesce(t.gross, 0),
         total_net   = coalesce(t.net, 0)
    from (
      select sum(total_gross) as gross, sum(net_salary) as net
        from public.payroll_records where period_id = parent
    ) t
   where p.id = parent;
  return null;
end;
$$;

drop trigger if exists trg_recalc_payroll_totals on public.payroll_records;
create trigger trg_recalc_payroll_totals
  after insert or update or delete on public.payroll_records
  for each row execute function public.recalc_payroll_period_totals();

create or replace function public.recalc_expense_report_totals()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  parent uuid := coalesce(
    case when tg_table_name = 'expense_transportation' then coalesce(new.report_id, old.report_id) end,
    case when tg_table_name = 'expense_accommodation'  then coalesce(new.report_id, old.report_id) end,
    case when tg_table_name = 'expense_items'          then coalesce(new.report_id, old.report_id) end
  );
  v_transport numeric;
  v_accom numeric;
  v_other numeric;
begin
  select coalesce(sum(total), 0) into v_transport
    from public.expense_transportation where report_id = parent;
  select coalesce(sum(rent_amount), 0) into v_accom
    from public.expense_accommodation where report_id = parent;
  select coalesce(sum(amount), 0) into v_other
    from public.expense_items where report_id = parent;

  update public.expense_reports
     set total_transportation = v_transport,
         total_accommodation  = v_accom,
         total_other          = v_other,
         grand_total          = v_transport + v_accom + v_other
   where id = parent;
  return null;
end;
$$;

drop trigger if exists trg_recalc_expense_totals_transport on public.expense_transportation;
create trigger trg_recalc_expense_totals_transport
  after insert or update or delete on public.expense_transportation
  for each row execute function public.recalc_expense_report_totals();

drop trigger if exists trg_recalc_expense_totals_accom on public.expense_accommodation;
create trigger trg_recalc_expense_totals_accom
  after insert or update or delete on public.expense_accommodation
  for each row execute function public.recalc_expense_report_totals();

drop trigger if exists trg_recalc_expense_totals_items on public.expense_items;
create trigger trg_recalc_expense_totals_items
  after insert or update or delete on public.expense_items
  for each row execute function public.recalc_expense_report_totals();

-- Line totals are products of their own inputs; keep them consistent too.
create or replace function public.set_transportation_line_total()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.total := coalesce(new.daily_cost, 0) * coalesce(new.days_count, 0);
  return new;
end;
$$;

drop trigger if exists trg_transportation_line_total on public.expense_transportation;
create trigger trg_transportation_line_total
  before insert or update on public.expense_transportation
  for each row execute function public.set_transportation_line_total();

-- A client PATCH that names the derived columns is ignored rather than
-- honoured, so an old client can never write a wrong total.
create or replace function public.freeze_derived_totals()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Backfills and service-role corrections are allowed to set totals.
  if public.is_privileged_context() then
    return new;
  end if;
  if tg_table_name = 'payroll_periods' then
    new.total_gross := old.total_gross;
    new.total_net := old.total_net;
  else
    new.total_transportation := old.total_transportation;
    new.total_accommodation := old.total_accommodation;
    new.total_other := old.total_other;
    new.grand_total := old.grand_total;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_freeze_payroll_totals on public.payroll_periods;
create trigger trg_freeze_payroll_totals
  before update on public.payroll_periods
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.freeze_derived_totals();

drop trigger if exists trg_freeze_expense_totals on public.expense_reports;
create trigger trg_freeze_expense_totals
  before update on public.expense_reports
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.freeze_derived_totals();

-- Backfill any drift the browser-maintained totals left behind.
update public.payroll_periods p
   set total_gross = coalesce(t.gross, 0),
       total_net   = coalesce(t.net, 0)
  from (
    select period_id, sum(total_gross) as gross, sum(net_salary) as net
      from public.payroll_records group by period_id
  ) t
 where p.id = t.period_id
   and (p.total_gross is distinct from coalesce(t.gross, 0)
     or p.total_net   is distinct from coalesce(t.net, 0));

-- ─── 5. Audit trail ────────────────────────────────────────────────────────
-- The app writes 'reset_to_draft'; the constraint only allowed 'reset', so
-- every reopen silently failed its log insert.
alter table public.approval_logs drop constraint if exists approval_logs_action_check;
update public.approval_logs set action = 'reset_to_draft' where action = 'reset';
alter table public.approval_logs add constraint approval_logs_action_check
  check (action in ('created', 'submitted', 'approved', 'rejected', 'reset_to_draft'));

-- An audit trail nobody can rewrite: insert-only, and the actor is the caller.
alter table public.approval_logs alter column performed_by set default auth.uid();

create or replace function public.stamp_approval_log_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.performed_by := auth.uid();
  new.performed_at := now();
  return new;
end;
$$;

drop trigger if exists trg_stamp_approval_log_actor on public.approval_logs;
create trigger trg_stamp_approval_log_actor
  before insert on public.approval_logs
  for each row execute function public.stamp_approval_log_actor();

drop policy if exists "approval_logs are append only" on public.approval_logs;
create policy "approval_logs are append only" on public.approval_logs
  for update using (false);

-- ─── 6. Indexes for the cross-site period queries ──────────────────────────
-- The dashboard, approvals and export pages filter on (year, month) with no
-- site, which the existing site-leading composites cannot serve.
create index if not exists idx_payroll_periods_period on public.payroll_periods (year, month);
create index if not exists idx_expense_reports_period on public.expense_reports (year, month);
create index if not exists idx_payroll_periods_status on public.payroll_periods (status);
create index if not exists idx_expense_reports_status on public.expense_reports (status);
create index if not exists idx_advance_repayments_period on public.advance_repayments (year, month);
