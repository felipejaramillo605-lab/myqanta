import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { z } from "zod";

const IP_SALT = process.env.APP_METRICS_SALT ?? "qanta-metrics-salt-v1";

const hash = (v: string | null | undefined) =>
  v ? createHash("sha256").update(IP_SALT + v).digest("hex").slice(0, 24) : null;

const bodySchema = z.object({
  path: z.string().max(300),
  method: z.string().max(10).default("POST"),
  status: z.number().int().min(0).max(999).default(200),
  duration_ms: z.number().int().min(0).max(600000).default(0),
  user_id: z.string().uuid().nullable().optional(),
  email: z.string().max(320).nullable().optional(),
});

export const Route = createFileRoute("/api/public/hooks/log-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json();
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) return new Response("bad payload", { status: 400 });
          const b = parsed.data;

          const fwd = request.headers.get("cf-connecting-ip")
            ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? null;
          const ua = request.headers.get("user-agent") ?? null;
          const country = request.headers.get("cf-ipcountry") ?? null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("request_metrics").insert({
            user_id: b.user_id ?? null,
            email: b.email ?? null,
            path: b.path,
            method: b.method,
            status: b.status,
            duration_ms: b.duration_ms,
            ip_hash: hash(fwd),
            ua_hash: hash(ua),
            country,
          });
          return new Response("ok", { status: 204 });
        } catch (e) {
          console.error("[log-request] failed", e);
          return new Response("ok", { status: 204 }); // never break app
        }
      },
    },
  },
});