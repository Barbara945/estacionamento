-- Migração: ampliar "Contas a Pagar" com campos avançados.
-- Rode este SQL no Supabase (SQL Editor) se você já possui a tabela accounts_payable criada.

alter table accounts_payable
  add column if not exists supplier_tax_id text,
  add column if not exists document_number text,
  add column if not exists original_amount numeric(10,2) not null default 0,
  add column if not exists net_amount numeric(10,2) not null default 0,
  add column if not exists issue_date date,
  add column if not exists competence_date date,
  add column if not exists cost_center text,
  add column if not exists payment_method text,
  add column if not exists bank_account text,
  add column if not exists barcode text,
  add column if not exists approval_status text not null default 'Em aberto',
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists recurrence text,
  add column if not exists recurrence_day int,
  add column if not exists attachment_urls jsonb not null default '[]'::jsonb,
  add column if not exists bank_reference text,
  add column if not exists reconciled boolean not null default false,
  add column if not exists reconciled_at timestamptz;

-- Compat: se você já usava "amount" como valor, copie para net_amount (opcional)
update accounts_payable
set net_amount = amount
where (net_amount is null or net_amount = 0) and amount is not null;

create index if not exists idx_accounts_payable_status on accounts_payable(status);
