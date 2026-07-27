ALTER TABLE public.journal_templates ADD COLUMN IF NOT EXISTS code text;

CREATE OR REPLACE FUNCTION public.seed_standard_puc(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  parent uuid;
  inserted int := 0;
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
      INSERT INTO public.fin_accounts (org_id, code, name, type, parent_id, active)
      VALUES (_org_id, puc[i][1], puc[i][2], puc[i][3], parent, true);
      inserted := inserted + 1;
    END IF;
  END LOOP;
  RETURN inserted;
END $$;

REVOKE ALL ON FUNCTION public.seed_standard_puc(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_standard_puc(uuid) TO authenticated, service_role;

DO $$
DECLARE o record;
BEGIN
  FOR o IN
    SELECT org.id FROM public.organizations org
    WHERE (SELECT count(*) FROM public.fin_accounts a WHERE a.org_id = org.id) < 5
  LOOP
    PERFORM public.seed_standard_puc(o.id);
  END LOOP;
END $$;