import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { z } from "zod";

const bodySchema = z.object({
  org_id: z.string().uuid(),
  token: z.string().min(10).max(64),
  cedula: z.string().trim().min(3).max(40),
  kind: z.enum(["in", "out"]),
});

// Basic per-IP rate limit (same pattern as log-request.ts): 10 marks / minute.
const WINDOW_MS = 60_000;
const MAX = 10;
const hits = new Map<string, number[]>();
function rateLimited(key: string) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > MAX;
}

function hashIp(ip: string | null): string | null {
  const salt = process.env.APP_METRICS_SALT;
  if (!ip || !salt) return null;
  return createHash("sha256").update(salt + ip).digest("hex").slice(0, 24);
}

function computeToken(orgId: string, dateISO: string): string {
  const salt = process.env.APP_METRICS_SALT ?? "";
  return createHash("sha256").update(`${salt}|${orgId}|${dateISO}`).digest("hex").slice(0, 20);
}

export const Route = createFileRoute("/api/public/attendance/mark")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!process.env.APP_METRICS_SALT) {
            return Response.json({ ok: false, error: "service_unavailable" }, { status: 503 });
          }
          const ip = request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
          if (rateLimited(ip ?? "unknown")) {
            return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
          }
          const raw = await request.json();
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) return Response.json({ ok: false, error: "bad_payload" }, { status: 400 });
          const { org_id, token, cedula, kind } = parsed.data;

          const today = new Date().toISOString().slice(0, 10);
          const expected = computeToken(org_id, today);
          if (token !== expected) {
            return Response.json({ ok: false, error: "token_invalido_o_expirado" }, { status: 401 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: member, error: mErr } = await supabaseAdmin
            .from("team_members")
            .select("id, full_name, archived")
            .eq("org_id", org_id)
            .eq("cedula", cedula)
            .maybeSingle();
          if (mErr) {
            console.error("[attendance] lookup error", mErr);
            return Response.json({ ok: false, error: "lookup_failed" }, { status: 500 });
          }
          if (!member || (member as any).archived) {
            return Response.json({ ok: false, error: "cedula_no_encontrada" }, { status: 404 });
          }

          const { error: iErr } = await supabaseAdmin.from("attendance_marks" as any).insert({
            org_id,
            member_id: (member as any).id,
            kind,
            cedula_used: cedula,
            ip_hash: hashIp(ip),
            day_token: token,
          });
          if (iErr) {
            console.error("[attendance] insert error", iErr);
            return Response.json({ ok: false, error: "insert_failed" }, { status: 500 });
          }
          return Response.json({
            ok: true,
            full_name: (member as any).full_name,
            kind,
            at: new Date().toISOString(),
          });
        } catch (e) {
          console.error("[attendance/mark] failed", e);
          return Response.json({ ok: false, error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});