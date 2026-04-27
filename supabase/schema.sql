-- =========================
-- SISTEMA ESTÉTICA - BANCO
-- =========================

-- CLIENTES
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  car_plate text,
  notes text,
  created_at timestamptz default now()
);

-- SERVIÇOS (ex: higienização, lavagem, espelhamento)
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null default 0,
  duration_minutes int not null default 60,
  created_at timestamptz default now()
);

-- AGENDAMENTOS
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'Agendado', -- Agendado | Em andamento | Finalizado | Cancelado
  notes text,
  total_value numeric(10,2) not null default 0,
  created_at timestamptz default now()
);

-- PAGAMENTOS
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  method text not null, -- Pix | Dinheiro | Cartão | Link
  bank_account text,
  amount numeric(10,2) not null default 0,
  status text not null default 'Pendente', -- Pendente | Pago
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- CAIXA (ABERTURA E FECHAMENTO POR DIA)
create table if not exists cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  initial_amount numeric(10,2) not null default 0,
  final_amount numeric(10,2),
  status text not null default 'Aberto' -- Aberto | Fechado
);

-- MOVIMENTAÇÕES DO CAIXA (ENTRADA/SAÍDA)
create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid references cash_sessions(id) on delete cascade,
  type text not null, -- Entrada | Saída
  description text,
  amount numeric(10,2) not null default 0,
  created_at timestamptz default now()
);

-- =========================
-- ÍNDICES (melhor performance)
-- =========================
create index if not exists idx_appointments_start_time on appointments(start_time);
create index if not exists idx_payments_appointment_id on payments(appointment_id);
create index if not exists idx_cash_movements_session on cash_movements(cash_session_id);


-- CONTAS A PAGAR
create table if not exists accounts_payable (
  id uuid primary key default gen_random_uuid(),

  -- Fornecedor/Credor
  supplier text,
  supplier_tax_id text, -- CNPJ/CPF

  -- Documento/Nota Fiscal
  document_number text,

  -- Valores
  original_amount numeric(10,2) not null default 0,
  net_amount numeric(10,2) not null default 0,

  -- Datas
  issue_date date,
  due_date date not null,
  competence_date date,

  -- Classificação
  category text,
  cost_center text,

  -- Pagamento
  payment_method text,
  bank_account text,
  barcode text,

  -- Controle
  status text not null default 'Pendente', -- Em aberto / Pago / Cancelado etc
  approval_status text not null default 'Em aberto', -- Pendente de Aprovação / Aprovado etc
  approved_by text,
  approved_at timestamptz,

  -- Recorrência (metadados)
  recurrence text, -- Ex: Mensal, Semanal, Anual
  recurrence_day int, -- dia do mês (1-31)

  -- Anexos (links)
  attachment_urls jsonb not null default '[]'::jsonb,

  -- Conciliação
  bank_reference text,
  reconciled boolean not null default false,
  reconciled_at timestamptz,

  -- Integração com o Caixa
  posted_to_cash boolean not null default false,

  notes text,
  created_at timestamptz default now(),

  -- Compat (campo antigo)
  amount numeric(10,2) not null default 0,
  paid_at timestamptz
);

create index if not exists idx_accounts_payable_due_date on accounts_payable(due_date);
create index if not exists idx_accounts_payable_status on accounts_payable(status);


-- BANCOS / CONTAS (para entradas/saídas)
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Banco', -- Banco / Carteira / Dinheiro
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_bank_accounts_name on bank_accounts(name);


-- ITENS DO AGENDAMENTO (mais de um serviço por agendamento)
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
