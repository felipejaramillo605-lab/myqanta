
-- Customers
CREATE TABLE public.sales_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  tax_id text,
  email text,
  phone text,
  address text,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_customers TO authenticated;
GRANT ALL ON public.sales_customers TO service_role;
ALTER TABLE public.sales_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers read" ON public.sales_customers FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_owner(auth.uid()));
CREATE POLICY "customers write" ON public.sales_customers FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_sales_customers_updated BEFORE UPDATE ON public.sales_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sales_customers_org ON public.sales_customers(org_id);

-- Invoices
CREATE TABLE public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  number int,
  customer_id uuid REFERENCES public.sales_customers(id) ON DELETE SET NULL,
  customer_name_snapshot text,
  issue_date date NOT NULL DEFAULT current_date,
  due_date date,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  notes text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices read" ON public.sales_invoices FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_owner(auth.uid()));
CREATE POLICY "invoices write" ON public.sales_invoices FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_sales_invoices_updated BEFORE UPDATE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sales_invoices_org_date ON public.sales_invoices(org_id, issue_date DESC);
CREATE INDEX idx_sales_invoices_status ON public.sales_invoices(org_id, status);

-- Items
CREATE TABLE public.sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.inv_products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_items TO authenticated;
GRANT ALL ON public.sales_invoice_items TO service_role;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items read" ON public.sales_invoice_items FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_owner(auth.uid()));
CREATE POLICY "items write" ON public.sales_invoice_items FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE INDEX idx_sales_items_invoice ON public.sales_invoice_items(invoice_id);

-- Payments
CREATE TABLE public.sales_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  paid_on date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  finance_transaction_id uuid REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_payments TO authenticated;
GRANT ALL ON public.sales_payments TO service_role;
ALTER TABLE public.sales_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read" ON public.sales_payments FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_owner(auth.uid()));
CREATE POLICY "payments write" ON public.sales_payments FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE INDEX idx_sales_payments_invoice ON public.sales_payments(invoice_id);

-- Numbering function
CREATE OR REPLACE FUNCTION public.next_invoice_number(_org_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NOT public.can_write_org(_org_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COALESCE(MAX(number), 0) + 1 INTO n
    FROM public.sales_invoices WHERE org_id = _org_id;
  RETURN n;
END $$;
