-- Finance ERP Phase 1: clients, contracts, invoices, AR
-- Source: FM questionnaire (docs/finance-erp-requirements.md).
-- One invoice per contract per month; deductions negotiated in a monthly
-- meeting; withholding tax deducted by clients at source; invoices are
-- always settled in full (no partial payments), so collection lives on the
-- invoice row itself. Post-issue amount changes are represented as a credit
-- note amount on the invoice, matching current practice.

create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  name_ar text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists contracts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id),
  name text not null,
  monthly_value numeric not null default 0,
  payment_terms_days integer not null default 30,
  escalation_percent numeric,
  escalation_month integer check (escalation_month between 1 and 12),
  start_date date,
  end_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists contract_sites (
  contract_id uuid not null references contracts(id) on delete cascade,
  site_id uuid not null references sites(id),
  primary key (contract_id, site_id)
);

create table if not exists invoices (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references contracts(id),
  month integer not null check (month between 1 and 12),
  year integer not null,
  is_extra_works boolean not null default false,
  gross_amount numeric not null default 0,
  total_deductions numeric not null default 0,
  net_amount numeric not null default 0,
  withholding_amount numeric not null default 0,
  credit_note_amount numeric not null default 0,
  credit_note_reason text,
  status text not null default 'draft' check (status in
    ('draft', 'agreed', 'sent_to_accountant', 'issued', 'sent_to_client', 'collected')),
  eta_reference text,
  issue_date date,
  due_date date,
  collected_date date,
  collection_method text check (collection_method in ('transfer', 'cheque', 'cash')),
  notes text,
  created_at timestamptz not null default now()
);

-- One regular monthly invoice per contract; extra-works invoices are exempt.
create unique index if not exists invoices_contract_period_unique
  on invoices (contract_id, year, month) where not is_extra_works;

create index if not exists invoices_period_idx on invoices (year, month);
create index if not exists invoices_status_idx on invoices (status);
create index if not exists contracts_client_idx on contracts (client_id);

create table if not exists invoice_deductions (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  reason text not null default 'other' check (reason in
    ('headcount_shortfall', 'evaluation', 'conduct', 'damages', 'other')),
  description text,
  amount numeric not null default 0,
  sort_order integer not null default 0
);

create index if not exists invoice_deductions_invoice_idx on invoice_deductions (invoice_id);

alter table clients enable row level security;
alter table contracts enable row level security;
alter table contract_sites enable row level security;
alter table invoices enable row level security;
alter table invoice_deductions enable row level security;

create policy "authenticated read clients" on clients
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage clients" on clients
  for all using (auth.role() = 'authenticated');

create policy "authenticated read contracts" on contracts
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage contracts" on contracts
  for all using (auth.role() = 'authenticated');

create policy "authenticated read contract_sites" on contract_sites
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage contract_sites" on contract_sites
  for all using (auth.role() = 'authenticated');

create policy "authenticated read invoices" on invoices
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage invoices" on invoices
  for all using (auth.role() = 'authenticated');

create policy "authenticated read invoice_deductions" on invoice_deductions
  for select using (auth.role() = 'authenticated');
create policy "authenticated manage invoice_deductions" on invoice_deductions
  for all using (auth.role() = 'authenticated');
