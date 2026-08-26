// Helpers server-only para Obsidian (plugin "Local REST API"). No importar desde el cliente.

const ENC_VERSION = "v1";

function keyMaterial(): string {
  const raw = process.env["OBSIDIAN_ENC_KEY"];
  if (!raw) {
    throw new Error(
      "Falta configurar la clave de cifrado del proyecto (OBSIDIAN_ENC_KEY) para guardar credenciales de Obsidian.",
    );
  }
  return raw;
}

async function aesKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyMaterial()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Cifra la API key del plugin con AES-256-GCM. Formato: `v1.<iv b64>.<ciphertext b64>`. */
export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(),
    new TextEncoder().encode(plain),
  );
  return `${ENC_VERSION}.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [version, ivB64, ctB64] = payload.split(".");
  if (version !== ENC_VERSION || !ivB64 || !ctB64) {
    throw new Error("La credencial de Obsidian guardada no es válida. Vuelve a conectar la integración.");
  }
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      await aesKey(),
      fromB64(ctB64),
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error(
      "No se pudo descifrar la credencial de Obsidian (la clave de cifrado cambió). Vuelve a conectar la integración.",
    );
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
]);

/**
 * Valida la URL del vault. Qanta corre en la nube, así que la API local de
 * Obsidian debe estar publicada por un túnel accesible desde internet
 * (Cloudflare Tunnel, Tailscale Funnel, ngrok…). Además bloquea direcciones
 * internas para evitar SSRF contra la propia infraestructura.
 */
export function normalizeVaultUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("La dirección del vault no es una URL válida (ej. https://mi-vault.trycloudflare.com).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("La dirección del vault debe empezar por https:// o http://.");
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^127\./.test(host);
  if (isPrivate) {
    throw new Error(
      "Esa dirección solo existe dentro de tu red, y Qanta funciona en la nube. Publica la API local de Obsidian con un túnel (Cloudflare Tunnel, Tailscale Funnel o ngrok) y usa esa URL https pública.",
    );
  }
  return `${url.protocol}//${url.host}`;
}

/** Normaliza la carpeta destino dentro del vault (sin barras extra ni rutas relativas). */
export function normalizeFolder(input: string): string {
  const clean = input
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "." && s !== "..")
    .join("/");
  return clean || "Qanta";
}

async function obsidianFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: { method?: string; body?: string; contentType?: string },
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init?.contentType ? { "Content-Type": init.contentType } : {}),
      },
      body: init?.body,
      signal: controller.signal,
      redirect: "error",
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "tiempo de espera agotado" : "no se pudo conectar";
    throw new Error(
      `No se pudo alcanzar la API local de Obsidian (${msg}). Comprueba que Obsidian esté abierto, el plugin "Local REST API" activo y el túnel en marcha.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export type VaultInfo = { authenticated: boolean; service: string | null; version: string | null };

/** Verifica credenciales contra `GET /` del plugin. */
export async function checkVault(baseUrl: string, apiKey: string): Promise<VaultInfo> {
  const { status, text } = await obsidianFetch(baseUrl, apiKey, "/");
  if (status === 401 || status === 403) {
    throw new Error("La clave de API del plugin no es válida (Obsidian respondió 401/403).");
  }
  if (status >= 400) {
    throw new Error(`Obsidian respondió ${status} al verificar la conexión.`);
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error("La URL respondió algo que no parece la API local de Obsidian.");
  }
  const versions = parsed["versions"] as { self?: string } | undefined;
  return {
    authenticated: parsed["authenticated"] === true,
    service: (parsed["service"] as string | undefined) ?? null,
    version: versions?.self ?? null,
  };
}

/** Crea o reemplaza una nota (`PUT /vault/<ruta>`). */
export async function putNote(
  baseUrl: string,
  apiKey: string,
  vaultPath: string,
  markdown: string,
): Promise<void> {
  const encoded = vaultPath.split("/").map(encodeURIComponent).join("/");
  const { status, text } = await obsidianFetch(baseUrl, apiKey, `/vault/${encoded}`, {
    method: "PUT",
    body: markdown,
    contentType: "text/markdown",
  });
  if (status === 401 || status === 403) {
    throw new Error("La clave de API del plugin no es válida (Obsidian respondió 401/403).");
  }
  if (status >= 400) {
    console.error(`Obsidian PUT /vault/${vaultPath} falló [${status}]: ${text.slice(0, 300)}`);
    throw new Error(`Obsidian respondió ${status} al escribir "${vaultPath}".`);
  }
}

export type SyncSnapshot = {
  orgName: string;
  tasks: { title: string; due_date: string | null; status: string; priority: string | null }[];
  events: { title: string; starts_at: string; location: string | null }[];
  lowStock: { name: string; stock: number; min_stock: number; unit: string }[];
  deals: { title: string; stage: string; amount: number | null; currency: string | null }[];
};

const esc = (s: string) => s.replace(/([[\]|])/g, "\\$1");
const fmtDate = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");

/** Construye la nota Markdown del resumen operativo para el vault. */
export function buildSummaryNote(snap: SyncSnapshot, generatedAt: Date): string {
  const day = generatedAt.toISOString().slice(0, 10);
  const lines: string[] = [
    "---",
    `title: "Qanta — Resumen ${day}"`,
    "source: qanta",
    `org: "${snap.orgName.replace(/"/g, "'")}"`,
    `generated: ${generatedAt.toISOString()}`,
    "tags: [qanta, resumen]",
    "---",
    "",
    `# Qanta — Resumen operativo ${day}`,
    "",
    `## Tareas pendientes (${snap.tasks.length})`,
    "",
  ];

  if (snap.tasks.length === 0) lines.push("_Sin tareas pendientes._", "");
  for (const t of snap.tasks) {
    const meta = [t.priority ? `prioridad: ${t.priority}` : null, t.due_date ? `vence: ${t.due_date.slice(0, 10)}` : null]
      .filter(Boolean)
      .join(" · ");
    lines.push(`- [ ] ${esc(t.title)}${meta ? ` — ${meta}` : ""}`);
  }
  lines.push("", `## Agenda próxima (${snap.events.length})`, "");
  if (snap.events.length === 0) lines.push("_Sin eventos próximos._", "");
  for (const e of snap.events) {
    lines.push(`- ${fmtDate(e.starts_at)} — ${esc(e.title)}${e.location ? ` (${esc(e.location)})` : ""}`);
  }
  lines.push("", `## Stock bajo (${snap.lowStock.length})`, "");
  if (snap.lowStock.length === 0) lines.push("_Sin alertas de inventario._", "");
  for (const p of snap.lowStock) {
    lines.push(`- ${esc(p.name)} — ${p.stock} / ${p.min_stock} ${p.unit}`);
  }
  lines.push("", `## Negocios abiertos (${snap.deals.length})`, "");
  if (snap.deals.length === 0) lines.push("_Sin negocios abiertos._", "");
  for (const d of snap.deals) {
    const amount = d.amount == null ? "" : ` — ${d.amount.toLocaleString("es-CO")} ${d.currency ?? ""}`.trimEnd();
    lines.push(`- **${esc(d.title)}** · ${d.stage}${amount}`);
  }
  lines.push("", "---", "_Generado automáticamente por Qanta. Se reescribe en cada sincronización._", "");
  return lines.join("\n");
}
