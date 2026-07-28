import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithModuleAccess } from "./permissions";

export type AccountingPolicy = {
  id: string;
  org_id: string;
  title: string;
  content: string;
  category: string;
  order_index: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const US_GAAP: Array<{ title: string; content: string }> = [
  { title: "Reconocimiento de ingresos (ASC 606)", content: "Se reconocen los ingresos siguiendo el modelo de 5 pasos: identificar el contrato con el cliente, identificar las obligaciones de desempeño, determinar el precio de la transacción, asignar el precio a cada obligación, y reconocer el ingreso cuando (o a medida que) se cumple cada obligación de desempeño." },
  { title: "Base de medición", content: "Los activos y pasivos se registran principalmente a costo histórico, con revaluaciones limitadas a los casos específicamente permitidos por US GAAP." },
  { title: "Valuación de inventarios", content: "Se permite el método LIFO (últimas entradas, primeras salidas), además de PEPS y costo promedio ponderado, según lo defina la administración de forma consistente entre periodos." },
  { title: "Depreciación de activos fijos", content: "Los activos se deprecian por el método de línea recta o acelerado según la naturaleza del activo, sobre su vida útil estimada." },
  { title: "Consolidación", content: "La consolidación de entidades se basa en el modelo de participación con derecho a voto (voting interest model) y, cuando aplique, en el modelo de entidad de interés variable (VIE)." },
  { title: "Clasificación de gastos", content: "Los gastos se presentan por función o por naturaleza, de forma consistente entre periodos contables." },
];

const NIIF: Array<{ title: string; content: string }> = [
  { title: "Reconocimiento de ingresos (NIIF 15)", content: "Se reconocen los ingresos siguiendo el modelo de 5 pasos: identificar el contrato, identificar las obligaciones de desempeño, determinar el precio de la transacción, asignar el precio, y reconocer el ingreso al satisfacer cada obligación de desempeño." },
  { title: "Medición a valor razonable (NIIF 13)", content: "Determinados activos, en particular propiedades de inversión y activos biológicos, se miden a valor razonable con cambios reconocidos en resultados o en otro resultado integral, según corresponda." },
  { title: "Valuación de inventarios (NIC 2)", content: "Los inventarios se valúan al menor entre el costo y el valor neto realizable, usando el método PEPS o costo promedio ponderado. No se permite el método LIFO." },
  { title: "Arrendamientos (NIIF 16)", content: "Todo arrendamiento con plazo mayor a 12 meses se reconoce como un activo por derecho de uso y un pasivo por arrendamiento en el balance, salvo exenciones para activos de bajo valor." },
  { title: "Deterioro de activos (NIC 36)", content: "Los activos se someten a pruebas de deterioro cuando existan indicios; el importe recuperable es el mayor entre el valor de uso y el valor razonable menos costos de venta." },
  { title: "Presentación de estados financieros (NIC 1)", content: "Los estados financieros se presentan de forma comparativa con el periodo anterior, con notas explicativas de las políticas contables aplicadas." },
];

export const listAccountingPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountingPolicy[]> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance/policies", "member");
    const { data, error } = await context.supabase
      .from("accounting_policies" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("order_index")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AccountingPolicy[];
  });

const PolicyInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(8000).default(""),
  category: z.string().trim().max(40).default("custom"),
  order_index: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

export const upsertAccountingPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PolicyInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance/policies", "admin");
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("accounting_policies" as never).select("org_id").eq("id", data.id).single();
      if (!existing || (existing as any).org_id !== orgId) throw new Error("Política no encontrada");
    }
    const { data: out, error } = await context.supabase
      .from("accounting_policies" as never)
      .upsert({ ...data, org_id: orgId } as never)
      .select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteAccountingPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance/policies", "admin");
    const { error } = await context.supabase
      .from("accounting_policies" as never).delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const seedAccountingPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ template: z.enum(["blank", "us_gaap", "niif"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance/policies", "admin");
    const { count, error: cErr } = await context.supabase
      .from("accounting_policies" as never)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) return { inserted: 0, skipped: true };

    if (data.template === "blank") {
      // Marca el "inicio desde cero" con una política editable vacía.
      const { error } = await context.supabase.from("accounting_policies" as never).insert({
        org_id: orgId,
        title: "Política contable",
        content: "",
        category: "blank",
        order_index: 0,
      } as never);
      if (error) throw new Error(error.message);
      return { inserted: 1, skipped: false };
    }

    const set = data.template === "us_gaap" ? US_GAAP : NIIF;
    const rows = set.map((p, i) => ({
      org_id: orgId,
      title: p.title,
      content: p.content,
      category: data.template,
      order_index: i,
    }));
    const { error } = await context.supabase.from("accounting_policies" as never).insert(rows as never);
    if (error) throw new Error(error.message);
    return { inserted: rows.length, skipped: false };
  });
