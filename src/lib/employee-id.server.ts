import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function randomChunk(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * employee_id = first 4 digits of cedula + first 4 letters of position (uppercase,
 * no accents/spaces, padded with "X") + DD + MM + 4 random alphanumeric chars.
 */
export function buildEmployeeId(cedula: string, position: string | null | undefined, date: Date): string {
  const digits = (cedula.match(/\d/g) ?? []).join("").slice(0, 4).padEnd(4, "0");
  const letters = stripDiacritics(position ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${digits}${letters}${dd}${mm}${randomChunk(4)}`;
}

/**
 * Builds an employee_id that does not collide with the UNIQUE (org_id, employee_id)
 * index. Retries up to 5 times.
 */
export async function generateUniqueEmployeeId(
  supabase: SupabaseClient<Database>,
  orgId: string,
  cedula: string,
  position: string | null | undefined,
  date: Date,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = buildEmployeeId(cedula, position, date);
    const { data, error } = await supabase
      .from("team_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("employee_id", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
  }
  throw new Error("No se pudo generar un ID de empleado único, inténtalo de nuevo");
}