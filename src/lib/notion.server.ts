// Helpers server-only para la API de Notion. No importar desde el cliente.

import { createHmac, timingSafeEqual } from "node:crypto";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export function notionCredentials() {
  const clientId = process.env["NOTION_CLIENT_ID"];
  const clientSecret = process.env["NOTION_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error(
      "Falta configurar NOTION_CLIENT_ID / NOTION_CLIENT_SECRET en los secretos del proyecto.",
    );
  }
  return { clientId, clientSecret };
}

export function notionRedirectUri(origin?: string) {
  const explicit = process.env["NOTION_REDIRECT_URI"];
  if (explicit) return explicit;
  const base = process.env["NOTION_REDIRECT_ORIGIN"] || origin || "https://myqanta.lovable.app";
  return `${base.replace(/\/$/, "")}/api/integrations/notion/callback`;
}

// ---- state firmado (HMAC con NOTION_CLIENT_SECRET) ----

const b64u = (b: Buffer) => b.toString("base64url");

function stateSignature(payload: string): string {
  const { clientSecret } = notionCredentials();
  return b64u(createHmac("sha256", clientSecret).update(payload).digest());
}

export function signNotionState(orgId: string, userId: string): string {
  const payload = b64u(
    Buffer.from(JSON.stringify({ org: orgId, uid: userId, exp: Date.now() + 10 * 60_000 })),
  );
  return `${payload}.${stateSignature(payload)}`;
}

export function verifyNotionState(state: string): { org: string; uid: string } {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) throw new Error("Estado de OAuth inválido.");
  const expected = Buffer.from(stateSignature(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    throw new Error("Estado de OAuth inválido.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    org?: string; uid?: string; exp?: number;
  };
  if (!parsed.org || !parsed.uid || !parsed.exp || parsed.exp < Date.now()) {
    throw new Error("El enlace de conexión con Notion expiró. Inténtalo de nuevo.");
  }
  return { org: parsed.org, uid: parsed.uid };
}

export async function notionFetch(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Notion API ${path} falló [${res.status}]: ${text}`);
    throw new Error(`Notion respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

export async function exchangeNotionCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = notionCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${NOTION_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Notion token exchange falló [${res.status}]: ${text}`);
    throw new Error(`No se pudo completar la conexión con Notion (${res.status}).`);
  }
  return JSON.parse(text) as {
    access_token: string;
    workspace_id?: string;
    workspace_name?: string;
    bot_id?: string;
  };
}

export function plainTitle(db: any): string {
  const t = db?.title;
  if (Array.isArray(t)) return t.map((r: any) => r?.plain_text ?? "").join("").trim() || "(sin título)";
  return "(sin título)";
}

type Contact = {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  stage?: string | null;
};

/**
 * Mapea el contacto a las propiedades que REALMENTE existen en la base de datos
 * destino (match por nombre, sin distinguir mayúsculas ni acentos). El título
 * siempre recibe el nombre; el resto se omite si la propiedad no existe.
 */
export function buildContactProperties(
  dbProperties: Record<string, { id: string; type: string }>,
  contact: Contact,
): Record<string, unknown> {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const byName = new Map<string, { key: string; type: string }>();
  let titleKey: string | null = null;
  for (const [key, def] of Object.entries(dbProperties ?? {})) {
    if (def.type === "title") titleKey = key;
    byName.set(norm(key), { key, type: def.type });
  }

  const props: Record<string, unknown> = {};
  if (titleKey) {
    props[titleKey] = { title: [{ text: { content: contact.name.slice(0, 200) } }] };
  }

  const assign = (candidates: string[], value: string | null) => {
    if (!value) return;
    for (const c of candidates) {
      const hit = byName.get(norm(c));
      if (!hit || hit.type === "title") continue;
      if (hit.type === "email") props[hit.key] = { email: value };
      else if (hit.type === "phone_number") props[hit.key] = { phone_number: value };
      else if (hit.type === "rich_text") props[hit.key] = { rich_text: [{ text: { content: value.slice(0, 1900) } }] };
      else if (hit.type === "url") props[hit.key] = { url: value };
      else if (hit.type === "select") props[hit.key] = { select: { name: value.slice(0, 100) } };
      else continue;
      return;
    }
  };

  assign(["email", "correo", "e-mail"], contact.email);
  assign(["phone", "telefono", "teléfono", "phone number"], contact.phone);
  assign(["company", "empresa", "compañia", "compañía", "organizacion", "organización"], contact.company);
  assign(["stage", "etapa", "estado", "status", "pipeline"], contact.stage ?? null);
  return props;
}
