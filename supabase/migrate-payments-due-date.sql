-- Adiciona vencimento (previsão de recebimento) em pagamentos
alter table public.payments
  add column if not exists due_date date;

create index if not exists idx_payments_due_date on public.payments(due_date);

-- Preencher vencimento para registros antigos:
-- Se não houver due_date, define como 1 dia após a data do serviço.
update public.payments p
set due_date = (date(a.start_time) + interval '1 day')::date
from public.appointments a
where p.due_date is null
  and p.appointment_id = a.id;
