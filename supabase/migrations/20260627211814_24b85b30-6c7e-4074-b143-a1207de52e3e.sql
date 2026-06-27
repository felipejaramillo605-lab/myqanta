
-- ENUM for EBITDA buckets
DO $$ BEGIN
  CREATE TYPE public.finance_bucket AS ENUM (
    'revenue','cogs','opex','depreciation','amortization','interest','tax','other_income','other_expense'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Accounts
CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'bank',
  currency text NOT NULL DEFAULT 'USD',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accounts TO authenticated;
GRANT ALL ON public.finance_accounts TO service_role;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.finance_accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER finance_accounts_updated BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Statements (bank statement uploads)
CREATE TABLE public.finance_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  source_name text NOT NULL,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'pending',
  ai_summary text,
  raw_text text,
  transactions_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_statements TO authenticated;
GRANT ALL ON public.finance_statements TO service_role;
ALTER TABLE public.finance_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own statements" ON public.finance_statements FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER finance_statements_updated BEFORE UPDATE ON public.finance_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Transactions
CREATE TABLE public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  statement_id uuid REFERENCES public.finance_statements(id) ON DELETE SET NULL,
  occurred_on date NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  bucket public.finance_bucket NOT NULL,
  ai_confidence numeric(4,3),
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO authenticated;
GRANT ALL ON public.finance_transactions TO service_role;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.finance_transactions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER finance_transactions_updated BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX finance_tx_user_date ON public.finance_transactions(user_id, occurred_on DESC);
CREATE INDEX finance_tx_bucket ON public.finance_transactions(user_id, bucket);
