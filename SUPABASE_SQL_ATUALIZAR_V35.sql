-- V35: Bancos - saldo por conta e transferência entre contas
-- 1) Adiciona coluna bank_account em cash_movements (para vincular lançamentos a um banco/conta)
-- 2) Recarrega cache do PostgREST

alter table public.cash_movements
  add column if not exists bank_account text;

create index if not exists idx_cash_movements_bank_account on public.cash_movements(bank_account);

notify pgrst, 'reload schema';
