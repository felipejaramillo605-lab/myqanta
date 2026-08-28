import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Public holidays via Nager.Date (https://date.nager.at) — free, no API key,
 * open source. Results are cached in `public.public_holidays_cache` per
 * (country, year) so we hit the API at most once per country/year.
 */

type Client = SupabaseClient<Database>;

export type Holiday = { date: string; name: string };

const NAGER_BASE = "https://date.nager.at/api/v3";

function normCountry(code: string | null | undefined) {
  const c = (code ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : "CO";
}

export async function getOrgCountry(supabase: Client, orgId: string): Promise<string> {
  const { data } = await supabase
    .from("organizations")
    .select("country_code")
    .eq("id", orgId)
    .maybeSingle();
  return normCountry((data as any)?.country_code);
}

async function readCache(supabase: Client, country: string, year: number): Promise<Holiday[]> {
  const { data } = await supabase
    .from("public_holidays_cache" as never)
    .select("holiday_date, name")
    .eq("country_code", country)
    .eq("year", year);
  return ((data ?? []) as any[]).map((r) => ({ date: String(r.holiday_date), name: String(r.name) }));
}

async function writeCache(supabase: Client, country: string, year: number, list: Holiday[]) {
  if (list.length === 0) return;
  await supabase.from("public_holidays_cache" as never).upsert(
    list.map((h) => ({
      country_code: country,
      year,
      holiday_date: h.date,
      name: h.name,
      fetched_at: new Date().toISOString(),
    })) as never,
    { onConflict: "country_code,year,holiday_date" } as never,
  );
}

/**
 * Returns the public holidays for a country/year. Never throws: on network or
 * country errors it returns whatever is cached (possibly an empty list).
 */
export async function getPublicHolidays(
  countryCode: string,
  year: number,
  supabase?: Client,
): Promise<Holiday[]> {
  const country = normCountry(countryCode);
  if (supabase) {
    const cached = await readCache(supabase, country, year);
    if (cached.length > 0) return cached;
  }
  try {
    const res = await fetch(`${NAGER_BASE}/PublicHolidays/${year}/${country}`);
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{ date?: string; localName?: string; name?: string }>;
    const list: Holiday[] = (Array.isArray(json) ? json : [])
      .filter((h) => typeof h.date === "string")
      .map((h) => ({ date: h.date as string, name: h.localName || h.name || "Festivo" }));
    if (supabase && list.length > 0) {
      try {
        await writeCache(supabase, country, year, list);
      } catch {
        /* cache write is best-effort */
      }
    }
    return list;
  } catch {
    return [];
  }
}

function isoDays(start: string, end: string): string[] {
  const s = Date.parse(start + "T00:00:00Z");
  const e = Date.parse(end + "T00:00:00Z");
  if (!isFinite(s) || !isFinite(e) || e < s) return [];
  const out: string[] = [];
  for (let t = s; t <= e; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Business days between two ISO dates (inclusive), excluding weekends and the
 * public holidays of the given country. Falls back to the plain calendar
 * difference when no holiday data is available.
 */
export async function countBusinessDays(
  startDate: string,
  endDate: string,
  countryCode: string,
  supabase?: Client,
): Promise<number> {
  const dates = isoDays(startDate, endDate);
  if (dates.length === 0) return 1;

  const years = Array.from(new Set(dates.map((d) => Number(d.slice(0, 4)))));
  const holidays = new Set<string>();
  for (const y of years) {
    for (const h of await getPublicHolidays(countryCode, y, supabase)) holidays.add(h.date.slice(0, 10));
  }

  let count = 0;
  for (const d of dates) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(d)) continue;
    count += 1;
  }
  return Math.max(count, 1);
}
