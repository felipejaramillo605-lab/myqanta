import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Exchange rates via Frankfurter (https://frankfurter.dev) — public, no API key,
 * open source. Results are cached in `public.fx_rate_cache` per (from,to,date)
 * so we never hit the API more than once per pair/day.
 */

type Client = SupabaseClient<Database>;

export type ExchangeRate = {
  from: string;
  to: string;
  rate: number;
  rate_date: string;
  source: "cache" | "api" | "identity";
};

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

function norm(c: string) {
  return (c ?? "").trim().toUpperCase();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function readCache(
  supabase: Client,
  from: string,
  to: string,
  date: string,
): Promise<ExchangeRate | null> {
  const { data } = await supabase
    .from("fx_rate_cache" as never)
    .select("rate, rate_date")
    .eq("from_currency", from)
    .eq("to_currency", to)
    .eq("rate_date", date)
    .maybeSingle();
  if (!data) return null;
  const row = data as any;
  return { from, to, rate: Number(row.rate), rate_date: row.rate_date, source: "cache" };
}

async function writeCache(
  supabase: Client,
  from: string,
  to: string,
  date: string,
  rate: number,
) {
  await supabase
    .from("fx_rate_cache" as never)
    .upsert(
      { from_currency: from, to_currency: to, rate_date: date, rate, fetched_at: new Date().toISOString() } as never,
      { onConflict: "from_currency,to_currency,rate_date" } as never,
    );
}

/**
 * Returns the conversion rate from `from` to `to`. `date` is an ISO date
 * (YYYY-MM-DD); omit it for the latest published rate.
 * Pass `supabase` to enable caching (recommended inside server functions).
 */
export async function getExchangeRate(
  from: string,
  to: string,
  date?: string,
  supabase?: Client,
): Promise<ExchangeRate> {
  const f = norm(from);
  const t = norm(to);
  if (!f || !t) throw new Error("Monedas inválidas para conversión");
  if (f === t) return { from: f, to: t, rate: 1, rate_date: date ?? todayIso(), source: "identity" };

  const cacheKeyDate = date ?? todayIso();
  if (supabase) {
    const cached = await readCache(supabase, f, t, cacheKeyDate);
    if (cached) return cached;
  }

  const path = date ? date : "latest";
  const res = await fetch(`${FRANKFURTER_BASE}/${path}?base=${f}&symbols=${t}`);
  if (!res.ok) throw new Error(`No se pudo obtener la tasa de cambio ${f}/${t} (${res.status})`);
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = json.rates?.[t];
  if (typeof rate !== "number" || !isFinite(rate)) {
    throw new Error(`Tasa de cambio ${f}/${t} no disponible`);
  }
  const rateDate = json.date ?? cacheKeyDate;

  if (supabase) {
    try {
      await writeCache(supabase, f, t, cacheKeyDate, rate);
    } catch {
      /* cache write is best-effort */
    }
  }
  return { from: f, to: t, rate, rate_date: rateDate, source: "api" };
}

export async function getOrgCurrency(supabase: Client, orgId: string): Promise<string> {
  const { data } = await supabase.from("organizations").select("currency").eq("id", orgId).maybeSingle();
  return norm((data as any)?.currency ?? "COP") || "COP";
}

export type Conversion = {
  amount: number;
  converted: number;
  from: string;
  to: string;
  rate: number;
  rate_date: string;
};

/**
 * Converts `amount` from `fromCurrency` into the organization's base currency.
 */
export async function convertToOrgCurrency(
  supabase: Client,
  orgId: string,
  amount: number,
  fromCurrency: string,
  date?: string,
): Promise<Conversion> {
  const to = await getOrgCurrency(supabase, orgId);
  const from = norm(fromCurrency) || to;
  const { rate, rate_date } = await getExchangeRate(from, to, date, supabase);
  return {
    amount,
    converted: Math.round(amount * rate * 100) / 100,
    from,
    to,
    rate,
    rate_date,
  };
}
