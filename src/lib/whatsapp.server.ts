// Server-only WhatsApp dispatcher. Currently mock-only.
// Structured so a real provider (Twilio, GatewayAPI, Meta Cloud API) can be
// wired in by adding a branch to `sendWhatsapp` and setting WHATSAPP_PROVIDER.

export type WhatsappSendResult = {
  provider: string;
  messageId: string;
  ok: true;
  simulated: boolean;
} | {
  provider: string;
  ok: false;
  error: string;
  simulated: boolean;
};

export async function sendWhatsapp(
  phoneE164: string,
  message: string,
  requestedProvider?: string,
): Promise<WhatsappSendResult> {
  const provider = requestedProvider || process.env.WHATSAPP_PROVIDER || "mock";

  if (provider === "mock") {
    // eslint-disable-next-line no-console
    console.info("[whatsapp:mock]", { to: phoneE164, message: message.slice(0, 200) });
    return {
      provider: "mock",
      ok: true,
      simulated: true,
      messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  // Real provider wiring goes here (Twilio / GatewayAPI / Meta). Until an
  // API key is provisioned we refuse to pretend it worked.
  return {
    provider,
    ok: false,
    simulated: false,
    error: `Provider "${provider}" not configured yet. Set WHATSAPP_PROVIDER=mock or wire real credentials.`,
  };
}

// Very light E.164 sanity check (+ and 8-15 digits).
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim().replace(/[\s\-()]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) return null;
  return trimmed;
}