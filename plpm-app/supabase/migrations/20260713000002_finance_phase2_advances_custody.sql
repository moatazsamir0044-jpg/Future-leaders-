-- Finance ERP Phase 2: worker advance ledger + cash custody (عهدة)
-- Source: FM questionnaire (docs/finance-erp-requirements.md).
-- Advances are either holiday advances (Eid, recovered in full from the next
-- payroll) or long-term installment advances (supervisor level and up,
-- deducted monthly until settled). Repayments are recorded per month, and
-- payroll-sourced repayments keep a link to the payroll period so approving
-- or un-approving a sheet can create or revert them.
-- Custody covers the InstaPay emergency float and company-vehicle spending,
-- with payee recorded per cash payment (contractor / driver / landlord).

create table if not exists worker_advances (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id),
  advance_type text not null default 'holiday' check (advance_type in ('holiday', 'long_term')),
  amount numeric not null check (amount >= 0),
  monthly_installment numeric not null default 0 check (monthly_installment >= 0),
  advance_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'settled', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists worker_advances_employee_idx on worker_advances (employee_id);
create index if not exists worker_advances_status_idx on worker_advances (status);

create table if not exists advance_repayments (
  id uuid primary key default uuid_generate_v4(),
  advance_id uuid not null references worker_advances(id) on delete cascade,
  payroll_period_id uuid references payroll_periods(id) on delete set null,
  month integer not null check (month between 1 and 12),
  year integer not null,
  amount numeric not null check (amount >= 0),
  source text not null default 'payroll' check (source in ('payroll', 'cash')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists advance_repayments_advance_idx on advance_repayments (advance_id);
create index if not exists advance_repayments_period_idx on advance_repayments (payroll_period_id);

create table if not exists custody_accounts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  name_ar text,
  holder text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists custody_transactions (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references custody_accounts(id) on delete cascade,
  txn_date date not null default current_date,
  type text not null check (type in ('top_up', 'expense')),
  amount numeric not null check (amount >= 0),
  payee text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists custody_transactions_account_idx on custody_transactions (account_id);
create index if not exists custody_transactions_date_idx on custody_transactions (txn_date);

alter table worker_advances enable row level security;
alter table advance_repayments enable row level security;
alter table custody_accounts enable row level security;
alter table custody_transactions enable row level security;

create policy "authenticated read worker_advances" on worker_advances
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage worker_advances" on worker_advances
  for all using (auth.role() = 'authenticated');

create policy "authenticated read advance_repayments" on advance_repayments
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage advance_repayments" on advance_repayments
  for all using (auth.role() = 'authenticated');

create policy "authenticated read custody_accounts" on custody_accounts
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage custody_accounts" on custody_accounts
  for all using (auth.role() = 'authenticated');

create policy "authenticated read custody_transactions" on custody_transactions
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage custody_transactions" on custody_transactions
  for all using (auth.role() = 'authenticated');
