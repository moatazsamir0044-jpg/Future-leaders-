-- Replacing an invoice's deduction lines atomically.
--
-- The editor deleted every deduction row and then inserted the new set as two
-- separate PostgREST calls. If the insert failed — a lost connection, a
-- constraint, a closed laptop — the deductions were gone while the invoice
-- still carried the old `total_deductions`, silently overstating what the
-- client owed. This RPC does both in one transaction and recomputes the
-- invoice's derived amounts from the rows it just wrote.

create or replace function public.replace_invoice_deductions(
  p_invoice_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_total numeric;
  v_gross numeric;
  v_credit numeric;
begin
  -- RLS still applies (security invoker): a caller who cannot see the invoice
  -- cannot change it either.
  if not exists (select 1 from public.invoices where id = p_invoice_id) then
    raise exception 'Invoice not found' using errcode = 'no_data_found';
  end if;

  delete from public.invoice_deductions where invoice_id = p_invoice_id;

  insert into public.invoice_deductions (invoice_id, reason, description, amount, sort_order)
  select
    p_invoice_id,
    coalesce(r->>'reason', 'other'),
    nullif(r->>'description', ''),
    coalesce((r->>'amount')::numeric, 0),
    coalesce((r->>'sort_order')::integer, ordinality::integer - 1)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(r, ordinality);

  select coalesce(sum(amount), 0) into v_total
    from public.invoice_deductions where invoice_id = p_invoice_id;

  select gross_amount, credit_note_amount into v_gross, v_credit
    from public.invoices where id = p_invoice_id;

  -- Keep the stored totals in step with the lines in the same transaction, so
  -- an invoice can never show a deduction total its rows do not support.
  update public.invoices
     set total_deductions = v_total,
         net_amount = coalesce(v_gross, 0) - v_total - coalesce(v_credit, 0)
   where id = p_invoice_id;
end;
$$;

revoke all on function public.replace_invoice_deductions(uuid, jsonb) from public, anon;
grant execute on function public.replace_invoice_deductions(uuid, jsonb) to authenticated, service_role;
