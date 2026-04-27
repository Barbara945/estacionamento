-- Atualização V33 - Pagamentos com entrada (parcial)
-- 1) adiciona coluna para valor já pago
alter table public.payments
add column if not exists amount_paid numeric not null default 0;

-- 2) preenche para registros antigos (se já estava Pago, considera pago = total)
update public.payments
set amount_paid = case when status = 'Pago' then amount else 0 end
where amount_paid is null;

-- (Opcional) Recarregar schema cache do PostgREST (Supabase)
-- Em SQL Editor:
-- notify pgrst, 'reload schema';
