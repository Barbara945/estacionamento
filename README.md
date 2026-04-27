# Sistema de Caixa + Pagamentos + Agendamento (Prestação de Serviço)

Template pronto (Next.js + Supabase) para você controlar:
- Agenda (agendamentos + status)
- Pagamentos (pendente/pago + método)
- Caixa (abertura/fechamento + entradas/saídas)
- Clientes e Serviços

## 1) Requisitos
- Node.js instalado (LTS)
- Conta no Supabase

## 2) Subir o banco no Supabase
1. Crie um projeto no Supabase
2. Vá em **SQL Editor** → **New Query**
3. Cole e rode o arquivo: `supabase/schema.sql`

> DICA: Para começar rápido, deixe o RLS desativado (padrão).  
> Depois você pode ativar com políticas por usuário.

## 3) Configurar as chaves do Supabase
1. Copie `.env.local.example` para `.env.local`
2. Preencha:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Você encontra em: **Project Settings → API**

## 4) Rodar o projeto no PC
No terminal, dentro da pasta do projeto:

```bash
npm install
npm run dev
```

Abra no navegador:
http://localhost:3000

## 5) Login
O sistema usa login por e-mail/senha do Supabase.
- Na tela de login, clique em **Criar conta** (signup)
- Depois faça login normalmente

## Páginas
- /dashboard
- /agenda (com OS PDF)
- /caixa
- /pagamentos
- /relatorios
- /clientes
- /servicos

## Como evoluir depois (próximos passos)
- Confirmar pagamento automático com Mercado Pago/Stripe
- Relatórios por período (mês/semana)
- Permissões e multiusuário (RLS)
- Impressão de OS e recibos

Se você quiser, posso:
- adicionar "entrega prevista" no agendamento
- adicionar "checklist do carro" no atendimento
- adicionar notificações por WhatsApp


✅ NOVO: Em **Agenda**, o botão **OS PDF** gera a Ordem de Serviço automaticamente.

- /contas-a-pagar (despesas com vencimento)

✅ NOVO: Rode o arquivo `supabase/add-contas-a-pagar.sql` no Supabase para adicionar a tabela em projetos já existentes.


## Contas a Pagar (campos avançados)
- Em projeto já criado: rode `supabase/migrate-contas-a-pagar-v2.sql` no Supabase (SQL Editor).
- Em projeto novo: o `supabase/schema.sql` já inclui tudo.


## Atualização (v5) – Bancos + Multi-serviços + Conta de recebimento
Depois de rodar `supabase/schema.sql`, rode também:
- `supabase/migrate-bancos-e-multi-servicos.sql`

Isso adiciona:
- Página **/bancos** para cadastrar bancos/contas
- Formas de recebimento/pagamento: Pix, Dinheiro, Cartão (Crédito/Débito)
- Mais de 1 serviço por agendamento (tabela `appointment_services`)
- Campo **banco/conta** em Pagamentos

> Se você já tinha agendamentos antigos, a migração faz um *backfill* usando `appointments.service_id`.


## Dashboard (mais claro)
- Pendências: Contas a receber + Contas vencidas.
- Agenda: próximos 7 dias.


## Dashboard
- Agenda por período: filtro por datas (De/Até) + atalhos Próximos 7 dias e Mês atual.


## Contas a Pagar (simples)
- Modal menor e com rolagem.
- Campos: fornecedor, CNPJ/CPF, plano de contas, centro de custo, descrição, emissão, vencimento, valor.
- Único ou Parcelado (gera parcelas mensais).
- Recorrente (Diário/Semanal/Quinzenal/Mensal) cria a próxima ocorrência como previsão.
- Ao marcar como Pago, lança automaticamente como Saída no Caixa (se estiver aberto).


## Pagamentos - Previsão de recebimento
- Novo campo `due_date` (vencimento) em `payments`.
- Quem não paga no dia fica Pendente com vencimento futuro.
- Consulta por Vencimento ou por Data do Agendamento.


## Pagamentos - Totais e vencimento automático
- Cards: Pago (Total), A receber (Total), Em atraso (Total).
- Se `due_date` estiver vazio, o sistema considera +1 dia após o serviço.


## Pagamentos (V14)
- Totais sempre por período (De/Até), independente dos filtros.
- A receber = pendentes.
- Se vencimento estiver vazio, o sistema considera +1 dia após o serviço.


## Agenda - alterar status
- Agora é possível alterar o status diretamente na tabela (Agendado / Em andamento / Concluído / Cancelado). A mudança salva automaticamente no Supabase.


## Relatórios em PDF (V17)
- Menu **Relatórios** → botão **Baixar PDF**.
- Gera PDF com: clientes, serviços, contas a pagar/receber por período, balanço, top serviços e ticket médio.

### Reiniciar o sistema (Windows)
No CMD na pasta do projeto:
- Parar: **CTRL + C**
- Rodar de novo: `npm run dev`
