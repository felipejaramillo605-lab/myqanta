
-- ============ INVENTORY / PURCHASES ============
CREATE TYPE public.inv_movement_kind AS ENUM ('purchase','sale','adjustment','transfer');
CREATE TYPE public.inv_party_kind AS ENUM ('supplier','customer');

CREATE TABLE public.inv_parties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind public.inv_party_kind NOT NULL DEFAULT 'supplier',
  name TEXT NOT NULL,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_parties TO authenticated;
GRANT ALL ON public.inv_parties TO service_role;
ALTER TABLE public.inv_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own parties" ON public.inv_parties FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_inv_parties_updated BEFORE UPDATE ON public.inv_parties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inv_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_products TO authenticated;
GRANT ALL ON public.inv_products TO service_role;
ALTER TABLE public.inv_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products" ON public.inv_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_inv_products_updated BEFORE UPDATE ON public.inv_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inv_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inv_products ON DELETE CASCADE,
  party_id UUID REFERENCES public.inv_parties ON DELETE SET NULL,
  kind public.inv_movement_kind NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  source_invoice_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_movements TO authenticated;
GRANT ALL ON public.inv_movements TO service_role;
ALTER TABLE public.inv_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own movements" ON public.inv_movements FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.inv_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  party_id UUID REFERENCES public.inv_parties ON DELETE SET NULL,
  invoice_number TEXT,
  invoice_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  raw_ai_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_invoices TO authenticated;
GRANT ALL ON public.inv_invoices TO service_role;
ALTER TABLE public.inv_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own invoices" ON public.inv_invoices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_inv_invoices_updated BEFORE UPDATE ON public.inv_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PRODUCTIVITY / AGENDA ============
CREATE TYPE public.task_status AS ENUM ('todo','doing','done','archived');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');

CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.habits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cadence TEXT NOT NULL DEFAULT 'daily',
  target_per_period INTEGER NOT NULL DEFAULT 1,
  color TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own habits" ON public.habits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_habits_updated BEFORE UPDATE ON public.habits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.habit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES public.habits ON DELETE CASCADE,
  logged_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  count INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(habit_id, logged_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;
GRANT ALL ON public.habit_logs TO service_role;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own habit_logs" ON public.habit_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
