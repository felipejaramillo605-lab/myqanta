// Send email via the connected Gmail account through the Lovable connector
// gateway. Server-only.
export type EmailSendResult =
  | { provider: string; ok: true; messageId: string; simulated: boolean }
  | { provider: string; ok: false; error: string; simulated: boolean };

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function toBase64Url(input: string): string {
  // btoa handles ASCII; encode UTF-8 first so accents/emojis survive.
  const utf8 = unescape(encodeURIComponent(input));
  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(to: string, subject: string, body: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ];
  return toBase64Url(lines.join("\r\n"));
}

export async function sendGmail(
  to: string,
  subject: string,
  body: string,
): Promise<EmailSendResult> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) {
    return {
      provider: "gmail",
      ok: false,
      simulated: false,
      error: "Gmail connector no está configurado.",
    };
  }
  try {
    const raw = buildRawEmail(to, subject, body);
    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { provider: "gmail", ok: false, simulated: false, error: `Gmail ${res.status}: ${text.slice(0, 300)}` };
    }
    const json = (await res.json()) as { id?: string };
    return { provider: "gmail", ok: true, simulated: false, messageId: json.id ?? `gmail_${Date.now()}` };
  } catch (e) {
    return { provider: "gmail", ok: false, simulated: false, error: (e as Error).message };
  }
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}
