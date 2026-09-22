-- Atomic "activate this import batch" function.
--
-- The parser persists a new batch as soon as it finishes parsing, with
-- status = 'processing' and its rows already written to pv_payroll_lines —
-- this is a plain insert under normal RLS, so a dropped connection during
-- upload never loses the preview. Nothing about creating a processing batch
-- needs to be atomic with anything else, so there is no function for it.
--
-- What DOES need to be atomic is the moment a batch is confirmed: superseding
-- whatever batch is currently active for the same scope+period must happen in
-- the same transaction as activating the new one, or a crash between the two
-- steps could leave either zero or two active batches for that scope+period —
-- exactly what the partial unique index in 20260922000000 exists to prevent.
--
-- pv_activate_import_batch(p_batch_id) does both steps in one statement
-- (a single PL/pgSQL function body is one transaction). It accepts a batch in
-- either 'processing' or 'superseded' status, which means the same function
-- implements both flows described in the plan:
--   * commit a new import  — activate a 'processing' batch
--   * restore a prior import — re-activate a 'superseded' batch, which then
--     supersedes whatever is currently active for that scope+period
--
-- security invoker (the default) is intentional: this schema has no
-- admin/role gate, so the function runs as the calling authenticated user and
-- relies on the same RLS update policy everyone else's writes go through.
create or replace function public.pv_activate_import_batch(p_batch_id uuid)
returns public.pv_import_batches
language plpgsql
as $$
declare
  v_batch public.pv_import_batches;
begin
  select * into v_batch
  from public.pv_import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'pv_import_batches row % not found', p_batch_id
      using errcode = 'no_data_found';
  end if;

  if v_batch.status not in ('processing', 'superseded') then
    raise exception
      'batch % has status %, expected processing or superseded',
      p_batch_id, v_batch.status
      using errcode = 'check_violation';
  end if;

  -- Supersede any other batch currently active for the same scope+period.
  -- The scope is exactly one of zone_id / scope_site_id (enforced by
  -- pv_import_batches_scope_check), so exactly one arm of this OR applies.
  update public.pv_import_batches
  set status = 'superseded',
      superseded_by = p_batch_id
  where status = 'active'
    and id <> p_batch_id
    and period_year = v_batch.period_year
    and period_month = v_batch.period_month
    and (
      (v_batch.zone_id is not null and zone_id = v_batch.zone_id)
      or
      (v_batch.scope_site_id is not null and scope_site_id = v_batch.scope_site_id)
    );

  update public.pv_import_batches
  set status = 'active',
      superseded_by = null
  where id = p_batch_id
  returning * into v_batch;

  return v_batch;
end;
$$;

revoke all on function public.pv_activate_import_batch(uuid) from public;
grant execute on function public.pv_activate_import_batch(uuid) to authenticated;
