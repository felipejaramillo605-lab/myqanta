import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabase } from "@/integrations/supabase/client";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Client-side fire-and-forget: after every server function call, log a
// lightweight metric so the platform owner can see traffic per user & detect
// abuse. The endpoint is public but idempotent — failures are swallowed.
const logRequestMiddleware = createMiddleware({ type: "function" }).client(async (opts) => {
  const { next } = opts;
  const functionId = (opts as unknown as { functionId?: string }).functionId;
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let status = 200;
  try {
    const r = await next();
    return r;
  } catch (e) {
    status = 500;
    throw e;
  } finally {
    if (typeof window !== "undefined") {
      try {
        const dur = Math.round(((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0));
        const { data } = await supabase.auth.getUser();
        const payload = {
          path: `fn:${functionId ?? "unknown"}`,
          method: "POST",
          status,
          duration_ms: dur,
          user_id: data?.user?.id ?? null,
          email: data?.user?.email ?? null,
        };
        void fetch("/api/public/hooks/log-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      } catch { /* ignore */ }
    }
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, logRequestMiddleware],
  requestMiddleware: [errorMiddleware],
}));
