import { createFileRoute } from "@tanstack/react-router";

const back = (params: Record<string, string>) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: `/settings/integrations?${new URLSearchParams(params).toString()}`,
    },
  });

/**
 * Callback de Notion. La identidad y la organización se derivan del `state`
 * firmado, nunca de la query sin verificar; la escritura usa el cliente
 * privilegiado porque una redirección del navegador no trae sesión.
 */
export const Route = createFileRoute("/api/integrations/notion/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        if (oauthError) return back({ notion: "error", message: oauthError });
        if (!code || !state) return back({ notion: "error", message: "Respuesta incompleta de Notion." });

        try {
          const { verifyNotionState, exchangeNotionCode, notionRedirectUri } = await import(
            "@/lib/notion.server"
          );
          const { org, uid } = verifyNotionState(state);
          const tokens = await exchangeNotionCode(code, notionRedirectUri(url.origin));
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("notion_connections").upsert(
            {
              org_id: org,
              access_token: tokens.access_token,
              workspace_id: tokens.workspace_id ?? null,
              workspace_name: tokens.workspace_name ?? null,
              bot_id: tokens.bot_id ?? null,
              connected_by: uid,
              connected_at: new Date().toISOString(),
            },
            { onConflict: "org_id" },
          );
          if (error) throw new Error(error.message);
          return back({ notion: "connected", workspace: tokens.workspace_name ?? "" });
        } catch (e) {
          const message = e instanceof Error ? e.message : "No se pudo completar la conexión.";
          console.error("Notion callback falló:", message);
          return back({ notion: "error", message });
        }
      },
    },
  },
});