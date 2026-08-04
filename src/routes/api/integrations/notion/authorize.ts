import { createFileRoute } from "@tanstack/react-router";

/**
 * Inicia el flujo OAuth de Notion. No lee la sesión (una navegación del
 * navegador no lleva el bearer token): la autorización se demuestra con el
 * `state` firmado que solo `createNotionOAuthState` entrega a admin/owner.
 */
export const Route = createFileRoute("/api/integrations/notion/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const state = new URL(request.url).searchParams.get("state") ?? "";
        try {
          const { notionCredentials, notionRedirectUri, verifyNotionState } = await import(
            "@/lib/notion.server"
          );
          verifyNotionState(state);
          const { clientId } = notionCredentials();
          const params = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            owner: "user",
            redirect_uri: notionRedirectUri(new URL(request.url).origin),
            state,
          });
          return new Response(null, {
            status: 302,
            headers: { Location: `https://api.notion.com/v1/oauth/authorize?${params.toString()}` },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "No se pudo iniciar la conexión.";
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/settings/integrations?notion=error&message=${encodeURIComponent(message)}`,
            },
          });
        }
      },
    },
  },
});