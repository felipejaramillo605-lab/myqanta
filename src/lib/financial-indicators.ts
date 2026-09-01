import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { signedBalance } from "./accounting-core";


export type IndicatorValue = { value: number | null; label: string | null };

export type FinancialIndicators = {
  totals: {
    activo_corriente: number;
    activo_no_corriente: number;
    activo_total: number;
    pasivo_corriente: number;
    pasivo_total: number;
    patrimonio: number;
    ingresos: number;
    gastos: number;
    utilidad_neta: number;
    inventarios: number;
  };
  indicators: {
    razon_corriente: IndicatorValue;
    prueba_acida: IndicatorValue;
    endeudamiento_total: IndicatorValue;
    razon_autonomia: IndicatorValue;
    roi: IndicatorValue;
    roe: IndicatorValue;
  };
};

function ratio(num: number, den: number): number | null {
  if (!den) return null;
  return num / den;
}

/**
 * Computes the six financial ratios from POSTED journal lines of one org.
 * Shared by the Reports server function and the Qanta assistant tool — the
 * caller is responsible for resolving `orgId` and checking module access.
 */
export async function computeFinancialIndicators(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<FinancialIndicators> {
  const { data, error } = await supabase
    .from("fin_journal_lines" as never)
    .select("debit, credit, fin_accounts!inner(code, type, is_current), fin_journal_entries!inner(status)")
    .eq("org_id", orgId)
    .eq("fin_journal_entries.status", "posted");
  if (error) throw new Error(error.message);

  let activoCorriente = 0, activoNoCorriente = 0, activoTotal = 0;
  let pasivoCorriente = 0, pasivoTotal = 0, patrimonio = 0;
  let ingresos = 0, gastos = 0, inventarios = 0;

  for (const l of (data ?? []) as any[]) {
    const acc = Array.isArray(l.fin_accounts) ? l.fin_accounts[0] : l.fin_accounts;
    if (!acc) continue;
    const debit = Number(l.debit ?? 0);
    const credit = Number(l.credit ?? 0);
    const code = String(acc.code ?? "");
    // Shared sign convention (see accounting-core.signedBalance).
    const bal = signedBalance(acc.type, debit, credit);
    switch (acc.type) {
      case "asset": {
        activoTotal += bal;
        if (acc.is_current === true) activoCorriente += bal;
        else if (acc.is_current === false) activoNoCorriente += bal;
        if (code.startsWith("14")) inventarios += bal;
        break;
      }
      case "liability": {
        pasivoTotal += bal;
        if (acc.is_current === true) pasivoCorriente += bal;
        break;
      }
      case "equity":
        patrimonio += bal;
        break;
      case "income":
        ingresos += bal;
        break;
      case "expense":
        gastos += bal;
        break;
    }
  }


  const utilidadNeta = ingresos - gastos;
  const patrimonioTotal = patrimonio + utilidadNeta;

  const wrap = (value: number | null, labeler: (v: number) => string): IndicatorValue =>
    value === null ? { value: null, label: null } : { value, label: labeler(value) };

  return {
    totals: {
      activo_corriente: activoCorriente,
      activo_no_corriente: activoNoCorriente,
      activo_total: activoTotal,
      pasivo_corriente: pasivoCorriente,
      pasivo_total: pasivoTotal,
      patrimonio: patrimonioTotal,
      ingresos,
      gastos,
      utilidad_neta: utilidadNeta,
      inventarios,
    },
    indicators: {
      razon_corriente: wrap(ratio(activoCorriente, pasivoCorriente), (v) =>
        v >= 1.5 ? "saludable" : v >= 1 ? "ajustado" : "riesgo",
      ),
      prueba_acida: wrap(ratio(activoCorriente - inventarios, pasivoCorriente), (v) =>
        v >= 1 ? "saludable" : "riesgo",
      ),
      endeudamiento_total: wrap(ratio(pasivoTotal, activoTotal), (v) =>
        v < 0.4 ? "bajo" : v <= 0.6 ? "moderado" : "alto",
      ),
      razon_autonomia: wrap(ratio(patrimonioTotal, activoTotal), (v) =>
        v >= 0.5 ? "sólida" : "dependiente de terceros",
      ),
      roi: wrap(ratio(utilidadNeta, activoTotal), (v) => (v > 0 ? "positivo" : "negativo")),
      roe: wrap(ratio(utilidadNeta, patrimonioTotal), (v) => (v > 0 ? "positivo" : "negativo")),
    },
  };
}
