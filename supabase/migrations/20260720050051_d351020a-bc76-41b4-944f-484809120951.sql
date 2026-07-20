
-- Templates
CREATE TABLE public.journal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  niif_category text NOT NULL,
  is_predefined boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jt_predefined_no_org CHECK (
    (is_predefined = true AND org_id IS NULL) OR (is_predefined = false AND org_id IS NOT NULL)
  )
);
CREATE INDEX journal_templates_org_idx ON public.journal_templates(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX journal_templates_predef_idx ON public.journal_templates(is_predefined) WHERE is_predefined = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_templates TO authenticated;
GRANT ALL ON public.journal_templates TO service_role;
ALTER TABLE public.journal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jt_select_members_or_predef" ON public.journal_templates
  FOR SELECT TO authenticated
  USING (is_predefined = true OR public.is_org_member(org_id, auth.uid()));

CREATE POLICY "jt_insert_own_org" ON public.journal_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    is_predefined = false
    AND org_id IS NOT NULL
    AND public.can_write_org(org_id, auth.uid())
  );

CREATE POLICY "jt_update_own_org" ON public.journal_templates
  FOR UPDATE TO authenticated
  USING (is_predefined = false AND public.can_write_org(org_id, auth.uid()))
  WITH CHECK (is_predefined = false AND public.can_write_org(org_id, auth.uid()));

CREATE POLICY "jt_delete_own_org" ON public.journal_templates
  FOR DELETE TO authenticated
  USING (is_predefined = false AND public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER jt_updated_at BEFORE UPDATE ON public.journal_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lines
CREATE TABLE public.journal_template_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.journal_templates(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('accrual','payment')),
  account_code text,
  account_name text NOT NULL,
  side text NOT NULL CHECK (side IN ('debit','credit')),
  amount_formula text NOT NULL DEFAULT 'total',
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jtl_template_idx ON public.journal_template_lines(template_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_template_lines TO authenticated;
GRANT ALL ON public.journal_template_lines TO service_role;
ALTER TABLE public.journal_template_lines ENABLE ROW LEVEL SECURITY;

-- Access lines through their parent template
CREATE POLICY "jtl_select_via_template" ON public.journal_template_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_templates t
    WHERE t.id = template_id
      AND (t.is_predefined = true OR public.is_org_member(t.org_id, auth.uid()))
  ));

CREATE POLICY "jtl_write_via_template" ON public.journal_template_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_templates t
    WHERE t.id = template_id
      AND t.is_predefined = false
      AND public.can_write_org(t.org_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.journal_templates t
    WHERE t.id = template_id
      AND t.is_predefined = false
      AND public.can_write_org(t.org_id, auth.uid())
  ));

-- Seed 3 predefined NIIF templates
DO $$
DECLARE
  t1 uuid; t2 uuid; t3 uuid;
BEGIN
  INSERT INTO public.journal_templates (org_id, name, niif_category, is_predefined)
    VALUES (NULL, 'Compra de inventario a crédito', 'Inventarios (NIC 2)', true)
    RETURNING id INTO t1;
  INSERT INTO public.journal_template_lines (template_id, step, account_code, account_name, side, amount_formula, order_index) VALUES
    (t1, 'accrual', '1435', 'Inventario', 'debit', 'total', 0),
    (t1, 'accrual', '2205', 'Cuentas por pagar (proveedores)', 'credit', 'total', 1),
    (t1, 'payment', '2205', 'Cuentas por pagar (proveedores)', 'debit', 'total', 0),
    (t1, 'payment', '1105', 'Efectivo y equivalentes', 'credit', 'total', 1);

  INSERT INTO public.journal_templates (org_id, name, niif_category, is_predefined)
    VALUES (NULL, 'Pago de arriendo', 'Gastos operativos (NIC 1)', true)
    RETURNING id INTO t2;
  INSERT INTO public.journal_template_lines (template_id, step, account_code, account_name, side, amount_formula, order_index) VALUES
    (t2, 'accrual', '5120', 'Gasto de arriendo', 'debit', 'total', 0),
    (t2, 'accrual', '2335', 'Cuentas por pagar (arrendador)', 'credit', 'total', 1),
    (t2, 'payment', '2335', 'Cuentas por pagar (arrendador)', 'debit', 'total', 0),
    (t2, 'payment', '1105', 'Efectivo y equivalentes', 'credit', 'total', 1);

  INSERT INTO public.journal_templates (org_id, name, niif_category, is_predefined)
    VALUES (NULL, 'Compra de equipo de oficina', 'Propiedad, planta y equipo (NIC 16)', true)
    RETURNING id INTO t3;
  INSERT INTO public.journal_template_lines (template_id, step, account_code, account_name, side, amount_formula, order_index) VALUES
    (t3, 'accrual', '1524', 'Equipo de oficina', 'debit', 'total', 0),
    (t3, 'accrual', '2205', 'Cuentas por pagar (proveedores)', 'credit', 'total', 1),
    (t3, 'payment', '2205', 'Cuentas por pagar (proveedores)', 'debit', 'total', 0),
    (t3, 'payment', '1105', 'Efectivo y equivalentes', 'credit', 'total', 1);
END $$;
