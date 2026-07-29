import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/send-due-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.REMINDERS_CRON_SECRET ?? process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!secret || !provided || provided !== secret) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processDueReminder } = await import("@/lib/reminders-dispatch.server");

        const { data: due, error } = await supabaseAdmin
          .from("reminders")
          .select("*")
          .eq("status", "pending")
          .lte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(50);

        if (error) {
          console.error("[send-due-reminders] query failed", error);
          return Response.json({ processed: 0, sent: 0, failed: 0, error: error.message }, { status: 200 });
        }

        const rows = due ?? [];
        const results = await Promise.allSettled(
          rows.map((r) => processDueReminder(supabaseAdmin as any, r)),
        );

        let sent = 0;
        let failed = 0;
        for (const res of results) {
          if (res.status === "fulfilled" && res.value.ok) sent++;
          else failed++;
          if (res.status === "rejected") console.error("[send-due-reminders] item failed", res.reason);
        }

        return Response.json({ processed: rows.length, sent, failed }, { status: 200 });
      },
    },
  },
});