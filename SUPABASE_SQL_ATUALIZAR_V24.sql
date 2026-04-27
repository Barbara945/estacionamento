-- V24: Caixa - tipo de lançamento (Empresa/Particular)
-- Adiciona coluna is_personal para classificar lançamentos do caixa.

alter table public.cash_movements
  add column if not exists is_personal boolean not null default false;

create index if not exists idx_cash_movements_is_personal on public.cash_movements(is_personal);

-- Recarrega cache do PostgREST (evita erro "schema cache")
notify pgrst, 'reload schema';
