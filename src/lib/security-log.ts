import { supabase } from "@/integrations/supabase/client";

export type SecuritySeverity = "info" | "warn" | "critical";

export type LogSecurityEventInput = {
  event_type: string;
  severity?: SecuritySeverity;
  message?: string;
  email?: string;
  path?: string;
  meta?: Record<string, unknown>;
};

/**
 * Fire-and-forget writer for the security audit log.
 * Uses the SECURITY DEFINER RPC so anon (failed logins) can log too.
 * Never throws — logging must not break user flows.
 */
export async function logSecurityEvent(input: LogSecurityEventInput): Promise<void> {
  try {
    const args: Record<string, unknown> = {
      _event_type: input.event_type,
      _severity: input.severity ?? "info",
      _meta: input.meta ?? {},
    };
    if (input.message) args._message = input.message;
    if (input.email) args._email = input.email;
    const path = input.path ?? (typeof window !== "undefined" ? window.location.pathname : undefined);
    if (path) args._path = path;
    await supabase.rpc("log_security_event", args as never);
  } catch {
    /* swallow */
  }
}

const RLS_PATTERNS = [
  /permission denied for/i,
  /row-level security/i,
  /violates row-level security/i,
  /new row violates/i,
  /insufficient_privilege/i,
  /42501/,
];

export function isRlsError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  return RLS_PATTERNS.some((r) => r.test(msg));
}