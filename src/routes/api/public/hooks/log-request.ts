import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { z } from "zod";

const IP_SALT = process.env.APP_METRICS_SALT;

const hash = (v: string | null | undefined) =>
  v && IP_SALT
    ? createHash("sha256")
        .update(IP_SALT + v)
        .digest("hex")
        .slice(0, 24)
    : null;

const bodySchema = z.object({
  path: z.string().max(300),
  method: z.string().max(10).default("POST"),
  status: z.number().int().min(0).max(999).default(200),
  duration_ms: z.number().int().min(0).max(600000).default(0),
});

// La identidad NUNCA se toma del body: se deriva del bearer token del llamante.
async function identityFromToken(
  token: string | null,
): Promise<{ user_id: string | null; email: string | null }> {
  if (!token || token.split(".").length !== 3) return { user_id: null, email: null };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { user_id: null, email: null };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return { user_id: null, email: null };
    return { user_id: data.user.id, email: data.user.email ?? null };
  } catch {
    return { user_id: null, email: null };
  }
}

// Rate limit en memoria: ventana deslizante de 60s, 60 requests/IP.
// Nota: se resetea si el proceso reinicia y no se comparte entre instancias
// si hay más de un nodo del servidor corriendo — suficiente para frenar abuso
// básico, no reemplaza rate limiting de infraestructura si lo hay.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return arr.length > MAX_PER_WINDOW;
}

export const Route = createFileRoute("/api/public/hooks/log-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!IP_SALT) {
            console.error("[log-request] APP_METRICS_SALT no configurado — rechazando");
            return new Response("service unavailable", { status: 503 });
          }

          const fwd =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null;

          if (isRateLimited(fwd ?? "unknown")) {
            return new Response("too many requests", { status: 429 });
          }

          const raw = await request.json();
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) return new Response("bad payload", { status: 400 });
          const b = parsed.data;

          const ua = request.headers.get("user-agent") ?? null;
          const country = request.headers.get("cf-ipcountry") ?? null;

          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : null;
          const identity = await identityFromToken(token);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("request_metrics").insert({
            user_id: identity.user_id,
            email: identity.email,
            path: b.path,
            method: b.method,
            status: b.status,
            duration_ms: b.duration_ms,
            ip_hash: hash(fwd),
            ua_hash: hash(ua),
            country,
          });
          return new Response(null, { status: 204 });
        } catch (e) {
          console.error("[log-request] failed", e);
          return new Response(null, { status: 204 }); // never break app
        }
      },
    },
  },
});
