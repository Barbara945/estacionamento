-- Cria a tabela completa de "Contas a Pagar" (use em um projeto novo, ou se ainda não existir)
create table if not exists accounts_payable (
  id uuid primary key default gen_random_uuid(),

  supplier text,
  supplier_tax_id text,
  document_number text,

  original_amount numeric(10,2) not null default 0,
  net_amount numeric(10,2) not null default 0,

  issue_date date,
  due_date date not null,
  competence_date date,

  category text,
  cost_center text,

  payment_method text,
  bank_account text,
  barcode text,

  status text not null default 'Pendente',
  approval_status text not null default 'Em aberto',
  approved_by text,
  approved_at timestamptz,

  recurrence text,
  recurrence_day int,

  attachment_urls jsonb not null default '[]'::jsonb,

  bank_reference text,
  reconciled boolean not null default false,
  reconciled_at timestamptz,

  posted_to_cash boolean not null default false,
  notes text,
  created_at timestamptz default now(),

  -- compat
  amount numeric(10,2) not null default 0,
  paid_at timestamptz
);

create index if not exists idx_accounts_payable_due_date on accounts_payable(due_date);
create index if not exists idx_accounts_payable_status on accounts_payable(status);
