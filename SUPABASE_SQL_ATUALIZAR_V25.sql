-- V25: Extrato + categoria de saída no Caixa
-- 1) Adiciona coluna category em cash_movements (tipo de saída / categoria)
-- 2) Recarrega cache do PostgREST

alter table public.cash_movements
  add column if not exists category text;

create index if not exists idx_cash_movements_category on public.cash_movements(category);

notify pgrst, 'reload schema';
