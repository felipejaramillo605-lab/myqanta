-- ============ FASE 1: tercero obligatorio ============
ALTER TABLE public.fin_accounts
  ADD COLUMN IF NOT EXISTS requires_third_party boolean NOT NULL DEFAULT false;

UPDATE public.fin_accounts
   SET requires_third_party = true
 WHERE code IN ('1305','1355','2205','2335','2365','2367');

CREATE OR REPLACE FUNCTION public.seed_standard_puc(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  parent uuid;
  inserted int := 0;
  tp_codes constant text[] := ARRAY['1305','1355','2205','2335','2365','2367'];
  puc constant text[][] := ARRAY[
    ['1','ACTIVO','asset',''],
    ['11','Disponible','asset','1'],
    ['1105','Caja','asset','11'],
    ['1110','Bancos','asset','11'],
    ['13','Deudores','asset','1'],
    ['1305','Clientes','asset','13'],
    ['1355','Anticipos y avances','asset','13'],
    ['14','Inventarios','asset','1'],
    ['1435','Mercancías no fabricadas por la empresa','asset','14'],
    ['15','Propiedad, planta y equipo','asset','1'],
    ['1524','Equipo de oficina','asset','15'],
    ['1540','Flota y equipo de transporte','asset','15'],
    ['2','PASIVO','liability',''],
    ['22','Proveedores','liability','2'],
    ['2205','Proveedores nacionales','liability','22'],
    ['23','Cuentas por pagar','liability','2'],
    ['2335','Costos y gastos por pagar','liability','23'],
    ['24','Impuestos por pagar','liability','2'],
    ['2365','Retención en la fuente','liability','24'],
    ['2367','Retención de ICA','liability','24'],
    ['2408','Impuesto sobre las ventas por pagar (IVA)','liability','24'],
    ['25','Obligaciones laborales','liability','2'],
    ['2505','Salarios por pagar','liability','25'],
    ['2510','Cesantías consolidadas','liability','25'],
    ['3','PATRIMONIO','equity',''],
    ['31','Capital social','equity','3'],
    ['3115','Aportes sociales','equity','31'],
    ['36','Resultados','equity','3'],
    ['3605','Utilidad del ejercicio','equity','36'],
    ['3610','Pérdida del ejercicio','equity','36'],
    ['4','INGRESOS','income',''],
    ['41','Operacionales','income','4'],
    ['4135','Comercio al por mayor y al por menor','income','41'],
    ['42','No operacionales','income','4'],
    ['4210','Financieros','income','42'],
    ['5','GASTOS','expense',''],
    ['51','Operacionales de administración','expense','5'],
    ['5105','Gastos de personal','expense','51'],
    ['5115','Impuestos','expense','51'],
    ['5135','Servicios','expense','51'],
    ['5195','Diversos','expense','51'],
    ['53','No operacionales','expense','5'],
    ['5305','Gastos financieros','expense','53'],
    ['6','COSTOS DE VENTAS','expense',''],
    ['61','Costo de ventas','expense','6'],
    ['6135','Comercio al por mayor y al por menor','expense','61']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(puc, 1) LOOP
    parent := NULL;
    IF puc[i][4] <> '' THEN
      SELECT id INTO parent FROM public.fin_accounts
        WHERE org_id = _org_id AND code = puc[i][4] LIMIT 1;
    END IF;

    SELECT id INTO rec FROM public.fin_accounts
      WHERE org_id = _org_id AND code = puc[i][1] LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.fin_accounts (org_id, code, name, type, parent_id, active, requires_third_party)
      VALUES (_org_id, puc[i][1], puc[i][2], puc[i][3], parent, true, puc[i][1] = ANY(tp_codes));
      inserted := inserted + 1;
    END IF;
  END LOOP;

  UPDATE public.fin_accounts
     SET requires_third_party = true
   WHERE org_id = _org_id AND code = ANY(tp_codes);

  RETURN inserted;
END $$;

-- ============ FASE 4: periodos de conciliación bancaria ============
CREATE TABLE public.bank_reconciliation_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  statement_balance numeric NOT NULL DEFAULT 0,
  book_balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  closed_by uuid,
  closed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bank_recon_status_chk CHECK (status IN ('draft','closed')),
  CONSTRAINT bank_recon_unique UNIQUE (org_id, bank_account_id, period_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliation_periods TO authenticated;
GRANT ALL ON public.bank_reconciliation_periods TO service_role;
ALTER TABLE public.bank_reconciliation_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_recon_select" ON public.bank_reconciliation_periods
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "bank_recon_write" ON public.bank_reconciliation_periods
  FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE INDEX bank_recon_org_idx ON public.bank_reconciliation_periods (org_id, bank_account_id, period_month);

CREATE TRIGGER update_bank_recon_updated_at
  BEFORE UPDATE ON public.bank_reconciliation_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FASE 4.3: periodos contables ============
CREATE TABLE public.accounting_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  status text NOT NULL DEFAULT 'open',
  closed_by uuid,
  closed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT accounting_period_status_chk CHECK (status IN ('open','closed')),
  CONSTRAINT accounting_period_month_chk CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT accounting_period_year_chk CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT accounting_period_unique UNIQUE (org_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_periods_select" ON public.accounting_periods
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "accounting_periods_write" ON public.accounting_periods
  FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER update_accounting_periods_updated_at
  BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();