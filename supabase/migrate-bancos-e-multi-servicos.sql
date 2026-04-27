-- Migração: Bancos + multi-serviços por agendamento + conta de recebimento em pagamentos
-- Rode este SQL no Supabase (SQL Editor).

-- 1) Bancos / contas
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Banco', -- Banco / Carteira / Dinheiro
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_bank_accounts_name on bank_accounts(name);

-- Sugestões iniciais (opcional):
insert into bank_accounts (name, type)
select * from (values
  ('Dinheiro (Caixa)', 'Dinheiro'),
  ('Pix (Principal)', 'Carteira')
) as v(name, type)
where not exists (select 1 from bank_accounts where bank_accounts.name = v.name);

-- 2) Pagamentos: conta de recebimento
alter table payments
  add column if not exists bank_account text;

-- 3) Multi-serviços por agendamento
create table if not exists appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  service_id uuid not null references services(id),
  qty int not null default 1,
  unit_price numeric(10,2) not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_appointment_services_appointment_id on appointment_services(appointment_id);
create index if not exists idx_appointment_services_service_id on appointment_services(service_id);

-- Backfill: se você já tinha agendamentos com service_id, cria 1 item por agendamento (só se ainda não existir)
insert into appointment_services (appointment_id, service_id, qty, unit_price)
select a.id, a.service_id, 1, coalesce(a.total_value, s.price, 0)
from appointments a
left join services s on s.id = a.service_id
where a.service_id is not null
  and not exists (select 1 from appointment_services x where x.appointment_id = a.id);
