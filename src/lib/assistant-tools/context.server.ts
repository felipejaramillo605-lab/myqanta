import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type ActionRecord = {
  tool: string;
  params: Record<string, JsonValue>;
  result: Record<string, JsonValue>;
  status: "ok" | "error";
};

/**
 * Shared context handed to every assistant tool group. `record` pushes the
 * action into the reply payload AND persists it into `ai_actions` for audit.
 * `org_id` is never supplied by the model: each tool resolves it server-side.
 */
export type AssistantToolCtx = {
  supabase: SupabaseClient<Database>;
  userId: string;
  record: (rec: ActionRecord, orgId: string) => Promise<void>;
};

/** Wrap a tool body so every outcome is audited with a single call site. */
export async function audited<T extends Record<string, JsonValue>>(
  ctx: AssistantToolCtx,
  tool: string,
  params: Record<string, JsonValue>,
  orgId: string,
  run: () => Promise<{ ok: true; result: T } | { ok: false; error: string; extra?: Record<string, JsonValue> }>,
): Promise<Record<string, JsonValue>> {
  let outcome: Awaited<ReturnType<typeof run>>;
  try {
    outcome = await run();
  } catch (e) {
    outcome = { ok: false, error: e instanceof Error ? e.message : "unknown_error" };
  }
  if (outcome.ok) {
    await ctx.record({ tool, params, result: outcome.result, status: "ok" }, orgId);
    return { ok: true, ...outcome.result };
  }
  await ctx.record(
    { tool, params, result: { error: outcome.error, ...(outcome.extra ?? {}) }, status: "error" },
    orgId,
  );
  return { ok: false, error: outcome.error, ...(outcome.extra ?? {}) };
}

export type Match<T> = { kind: "one"; row: T } | { kind: "none" } | { kind: "many"; labels: string[] };

/**
 * Fuzzy name resolution shared by every tool: never guess when ambiguous —
 * return the candidate labels so Qanta can ask the user.
 */
export function resolveOne<T>(rows: T[] | null | undefined, label: (row: T) => string): Match<T> {
  const list = rows ?? [];
  if (list.length === 0) return { kind: "none" };
  if (list.length === 1) return { kind: "one", row: list[0]! };
  return { kind: "many", labels: list.map(label) };
}

export function ambiguous(query: string, labels: string[]): string {
  return `Varios registros coinciden con "${query}": ${labels.join(", ")}. Pide al usuario que precise.`;
}
