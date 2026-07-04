import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Called by pg_cron every minute (or on demand) to dispatch due WhatsApp
// reminders. Public route — anon key acts as the shared secret and RLS is
// bypassed via the service role client loaded inside the handler.
export const Route = createFileRoute("/api/public/hooks/process-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabase
          .from("reminders")
          .select("*")
          .eq("status", "pending")
          .lte("scheduled_at", nowIso)
          .order("scheduled_at")
          .limit(50);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const { sendWhatsapp } = await import("@/lib/whatsapp.server");
        let sent = 0;
        let failed = 0;
        for (const r of due ?? []) {
          const res = await sendWhatsapp(r.phone_e164, r.message, r.provider);
          if (res.ok) {
            sent++;
            await supabase
              .from("reminders")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                provider_message_id: res.messageId,
                attempts: (r.attempts ?? 0) + 1,
                error: null,
              })
              .eq("id", r.id);
          } else {
            failed++;
            await supabase
              .from("reminders")
              .update({
                status: (r.attempts ?? 0) >= 2 ? "failed" : "pending",
                attempts: (r.attempts ?? 0) + 1,
                error: res.error,
              })
              .eq("id", r.id);
          }
        }

        return new Response(
          JSON.stringify({ processed: due?.length ?? 0, sent, failed }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});