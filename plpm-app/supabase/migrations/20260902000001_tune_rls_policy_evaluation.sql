-- Makes row-level security cheap to evaluate. No policy here grants access to
-- anything it did not grant before; only the cost of reaching the same answer
-- changes.
--
-- Two problems, both flagged by the Supabase performance linter across every
-- table in the schema:
--
-- 1. `auth.role()`, `auth.uid()` and `is_plpm_admin()` were called bare, so
--    Postgres treated them as volatile per-row expressions and re-executed
--    them for every row scanned. Wrapping each in a scalar subquery turns it
--    into an InitPlan that runs once per statement. On the payroll tables
--    that is one call instead of ~6,000.
--
-- 2. Seventeen tables carried a `FOR ALL` policy and a `FOR SELECT` policy
--    with identical USING clauses. `FOR ALL` already covers SELECT, so every
--    read evaluated the same predicate twice. The duplicate is dropped; the
--    `FOR ALL` policy left behind is what was already deciding the outcome.
--
-- `sites`, `user_profiles` and `approval_logs` keep both of their policies:
-- there the SELECT policy has a different USING clause from its sibling
-- (a plain authenticated read alongside an admin-only write, for instance),
-- so it is doing real work and dropping it would change who can read what.

-- 1. Drop the duplicated read policies, and re-create the surviving ALL
--    policies with the auth call hoisted out of the per-row path.

drop policy if exists "authenticated read advance_repayments" on public.advance_repayments;
drop policy if exists "authenticated manage advance_repayments" on public.advance_repayments;
create policy "authenticated manage advance_repayments" on public.advance_repayments
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read clients" on public.clients;
drop policy if exists "authenticated manage clients" on public.clients;
create policy "authenticated manage clients" on public.clients
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read contract_sites" on public.contract_sites;
drop policy if exists "authenticated manage contract_sites" on public.contract_sites;
create policy "authenticated manage contract_sites" on public.contract_sites
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read contracts" on public.contracts;
drop policy if exists "authenticated manage contracts" on public.contracts;
create policy "authenticated manage contracts" on public.contracts
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read custody_accounts" on public.custody_accounts;
drop policy if exists "authenticated manage custody_accounts" on public.custody_accounts;
create policy "authenticated manage custody_accounts" on public.custody_accounts
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read custody_transactions" on public.custody_transactions;
drop policy if exists "authenticated manage custody_transactions" on public.custody_transactions;
create policy "authenticated manage custody_transactions" on public.custody_transactions
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated users read employees" on public.employees;
drop policy if exists "authenticated users manage employees" on public.employees;
create policy "authenticated users manage employees" on public.employees
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read expense_accommodation" on public.expense_accommodation;
drop policy if exists "authenticated manage expense_accommodation" on public.expense_accommodation;
create policy "authenticated manage expense_accommodation" on public.expense_accommodation
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read expense_items" on public.expense_items;
drop policy if exists "authenticated manage expense_items" on public.expense_items;
create policy "authenticated manage expense_items" on public.expense_items
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated users read expense_reports" on public.expense_reports;
drop policy if exists "authenticated users manage expense_reports" on public.expense_reports;
create policy "authenticated users manage expense_reports" on public.expense_reports
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read expense_transportation" on public.expense_transportation;
drop policy if exists "authenticated manage expense_transportation" on public.expense_transportation;
create policy "authenticated manage expense_transportation" on public.expense_transportation
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read invoice_deductions" on public.invoice_deductions;
drop policy if exists "authenticated manage invoice_deductions" on public.invoice_deductions;
create policy "authenticated manage invoice_deductions" on public.invoice_deductions
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read invoices" on public.invoices;
drop policy if exists "authenticated manage invoices" on public.invoices;
create policy "authenticated manage invoices" on public.invoices
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated users read payroll_periods" on public.payroll_periods;
drop policy if exists "authenticated users manage payroll_periods" on public.payroll_periods;
create policy "authenticated users manage payroll_periods" on public.payroll_periods
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated users read payroll_records" on public.payroll_records;
drop policy if exists "authenticated users manage payroll_records" on public.payroll_records;
create policy "authenticated users manage payroll_records" on public.payroll_records
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read site_budgets" on public.site_budgets;
drop policy if exists "authenticated manage site_budgets" on public.site_budgets;
create policy "authenticated manage site_budgets" on public.site_budgets
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated read worker_advances" on public.worker_advances;
drop policy if exists "authenticated manage worker_advances" on public.worker_advances;
create policy "authenticated manage worker_advances" on public.worker_advances
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

-- 2. approval_logs keeps its three separate policies: the append-only UPDATE
--    guard has no equivalent in the others, so they are not duplicates.
drop policy if exists "authenticated read approval_logs" on public.approval_logs;
create policy "authenticated read approval_logs" on public.approval_logs
  for select to authenticated
  using ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated insert approval_logs" on public.approval_logs;
create policy "authenticated insert approval_logs" on public.approval_logs
  for insert to authenticated
  with check ((select auth.role()) = 'authenticated');

-- 3. sites: an authenticated read plus an admin-only write. Both are kept,
--    both get the same treatment.
drop policy if exists "authenticated users read sites" on public.sites;
create policy "authenticated users read sites" on public.sites
  for select to authenticated
  using ((select auth.role()) = 'authenticated');

drop policy if exists "admins manage sites" on public.sites;
create policy "admins manage sites" on public.sites
  for all to authenticated
  using ((select is_plpm_admin()))
  with check ((select is_plpm_admin()));

-- 4. user_profiles is the exception: its auth calls stay bare.
--
--    The own-profile update policy guards against a user changing their own
--    role, and it does that by reading user_profiles inside its own WITH
--    CHECK. That self-reference is what 20260629000003 had to work around.
--    Hoisting any of the auth calls on this table into a scalar subquery
--    makes Postgres re-enter the policy while planning that inner read and
--    raises:
--
--      ERROR: infinite recursion detected in policy for relation "user_profiles"
--
--    on every self-update. The RLS suite catches it, and `is_plpm_admin()` is
--    SECURITY DEFINER so it is not the culprit - the wrapping is. Nothing is
--    lost by leaving these alone: the table holds one row per staff member,
--    so there is no per-row cost here to hoist out of.
--
--    What does change is the role each policy targets. Evaluating them for
--    `anon` only to have the auth check fail was wasted work, and naming
--    `authenticated` lets Postgres skip them outright for signed-out
--    requests. Anonymous access is unchanged: no policy matches it, so it is
--    still refused.
drop policy if exists "users can view own profile" on public.user_profiles;
create policy "users can view own profile" on public.user_profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "users can update own profile" on public.user_profiles;
create policy "users can update own profile" on public.user_profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.user_profiles p where p.id = auth.uid())
  );

drop policy if exists "admins view all profiles" on public.user_profiles;
create policy "admins view all profiles" on public.user_profiles
  for select to authenticated
  using (is_plpm_admin());

-- Deliberately FOR UPDATE and not FOR ALL: widening it to ALL would make it
-- apply to the SELECT inside the role guard above, which is another route
-- into the same recursion.
drop policy if exists "admins update all profiles" on public.user_profiles;
create policy "admins update all profiles" on public.user_profiles
  for update to authenticated
  using (is_plpm_admin())
  with check (is_plpm_admin());

-- 5. Foreign keys with no index behind them. Postgres does not create one
--    automatically, so each of these was a sequential scan on join - and on
--    payroll_records.employee_id that is the join the payroll pages lean on
--    hardest.
create index if not exists approval_logs_performed_by_idx
  on public.approval_logs (performed_by);
create index if not exists contract_sites_site_id_idx
  on public.contract_sites (site_id);
create index if not exists expense_reports_approved_by_idx
  on public.expense_reports (approved_by);
create index if not exists expense_reports_submitted_by_idx
  on public.expense_reports (submitted_by);
create index if not exists payroll_periods_approved_by_idx
  on public.payroll_periods (approved_by);
create index if not exists payroll_periods_submitted_by_idx
  on public.payroll_periods (submitted_by);
create index if not exists payroll_records_employee_id_idx
  on public.payroll_records (employee_id);
