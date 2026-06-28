export const EXPENSE_CATEGORIES = [
  "aseo_personal",
  "comida",
  "transferencias",
  "ingresos_nomina",
  "otros_gastos",
  "alcohol",
  "seguros",
  "suscripciones",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return typeof v === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

/** Heuristic to pre-fill the category from a description in ES/EN. */
export function suggestCategory(text: string | null | undefined): ExpenseCategory {
  const s = (text ?? "").toLowerCase();
  if (!s) return "otros_gastos";
  if (/(salario|nomina|nómina|payroll|sueldo|wage)/.test(s)) return "ingresos_nomina";
  if (/(transfer|envio|envío|wire|remesa|zelle|bizum)/.test(s)) return "transferencias";
  if (/(seguro|insurance|póliza|poliza)/.test(s)) return "seguros";
  if (/(netflix|spotify|suscrip|subscription|hosting|saas|adobe|notion|disney|hbo|prime|icloud|youtube premium)/.test(s)) return "suscripciones";
  if (/(vino|cerveza|whisky|ron|alcohol|liquor|bar |licor|tequila|vodka)/.test(s)) return "alcohol";
  if (/(restaurante|comida|food|grocery|super|market|mercado|cafe|café|panader|carnicer|verduler|pizza|burger)/.test(s)) return "comida";
  if (/(shampoo|jabon|jabón|pasta dental|aseo|higiene|toallas|papel higi|desodorante|crema|cepillo)/.test(s)) return "aseo_personal";
  return "otros_gastos";
}

export type DecimalSeparator = "auto" | "comma" | "dot";

/** Parse a number string respecting the user-selected decimal separator. */
export function parseNumberWithSeparator(value: unknown, sep: DecimalSeparator = "auto"): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  let cleaned = value.replace(/[^0-9,.-]/g, "").replace(/(?!^)-/g, "").trim();
  if (!cleaned) return 0;
  if (sep === "comma") {
    // user says: thousands = ".", decimals = ","
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (sep === "dot") {
    // user says: thousands = ",", decimals = "."
    cleaned = cleaned.replace(/,/g, "");
  } else {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma !== -1 && lastDot !== -1) {
      cleaned = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
    } else if (lastComma !== -1) {
      const afterComma = cleaned.length - lastComma - 1;
      cleaned = afterComma <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
    }
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}