-- =========================================
-- ATUALIZAÇÃO V19 (CONTAS PARTICULARES + PRÓ-LABORE)
-- Rode este SQL no Supabase: SQL Editor
-- Depois: Settings > API > Reload/Refresh schema cache
-- =========================================

-- 1) Adiciona coluna is_personal (Empresa x Particular) na tabela de Contas a Pagar
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='accounts_payable'
  ) THEN
    ALTER TABLE public.accounts_payable
      ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='contas_a_pagar'
  ) THEN
    ALTER TABLE public.contas_a_pagar
      ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2) Cria tabela de Pró-labore
CREATE TABLE IF NOT EXISTS public.pro_labore (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  method text,
  bank_account text,
  notes text,
  posted_to_cash boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_labore_date ON public.pro_labore(date);

-- 3) Pede para o PostgREST recarregar o schema
NOTIFY pgrst, 'reload schema';
