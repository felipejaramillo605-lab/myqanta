// Análisis de hojas de vida (CV) con IA: recibe un PDF/imagen en data URL y
// devuelve una evaluación estructurada. Server-only.
import { z } from "zod";

export const ResumeReviewSchema = z.object({
  candidate_name: z.string().default(""),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  position_applied: z.string().nullable().default(null),
  experience_years: z.coerce.number().min(0).max(70).default(0),
  score: z.coerce.number().int().min(0).max(100).default(0),
  recommendation: z.enum(["strong", "maybe", "no"]).default("maybe"),
  summary: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
});

export type ResumeReview = z.infer<typeof ResumeReviewSchema>;

export type ResumeErrorCode =
  | "RESUME_PARSE_FAILED"
  | "RESUME_TOO_LARGE"
  | "RESUME_UNSUPPORTED_FILE"
  | "RESUME_RATE_LIMITED"
  | "RESUME_NO_CREDITS"
  | "RESUME_FAILED";

function extractJsonObject(raw: string): unknown | null {
  const clean = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return null;
  }
}

function strList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0)
    .slice(0, max);
}

export function normalizeResumeReview(value: unknown): ResumeReview | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const parsed = ResumeReviewSchema.safeParse({
    candidate_name: typeof r["candidate_name"] === "string" ? r["candidate_name"].trim() : "",
    email: typeof r["email"] === "string" && r["email"].trim() ? r["email"].trim() : null,
    phone: typeof r["phone"] === "string" && r["phone"].trim() ? r["phone"].trim() : null,
    position_applied:
      typeof r["position_applied"] === "string" && r["position_applied"].trim() ? r["position_applied"].trim() : null,
    experience_years: Number(r["experience_years"] ?? 0) || 0,
    score: Math.round(Number(r["score"] ?? 0) || 0),
    recommendation: ["strong", "maybe", "no"].includes(String(r["recommendation"]))
      ? String(r["recommendation"])
      : "maybe",
    summary: typeof r["summary"] === "string" ? r["summary"].trim() : "",
    strengths: strList(r["strengths"]),
    gaps: strList(r["gaps"]),
    skills: strList(r["skills"], 20),
  });
  return parsed.success ? parsed.data : null;
}

export type AnalyzeResumeInput = {
  file_data_url: string;
  mime: string;
  /** Cargo/vacante contra el que se evalúa la hoja de vida. */
  role_target?: string | null;
  /** Requisitos o notas del cargo (opcional). */
  requirements?: string | null;
  apiKey: string;
};

export async function analyzeResumeFile(
  input: AnalyzeResumeInput,
): Promise<{ ok: true; data: ResumeReview } | { ok: false; error: ResumeErrorCode }> {
  const approxBytes = Math.floor((input.file_data_url.length * 3) / 4);
  if (approxBytes > 8 * 1024 * 1024) return { ok: false, error: "RESUME_TOO_LARGE" };

  const target = input.role_target?.trim();
  const reqs = input.requirements?.trim();
  const system = `Eres un reclutador senior. Analiza la hoja de vida (CV) adjunta y devuelve SOLO JSON válido (sin markdown ni comentarios) con esta forma exacta:
{
  "candidate_name": string,
  "email": string|null,
  "phone": string|null,
  "position_applied": string|null,
  "experience_years": number,
  "score": number,
  "recommendation": "strong"|"maybe"|"no",
  "summary": string,
  "strengths": string[],
  "gaps": string[],
  "skills": string[]
}
Reglas: "score" de 0 a 100 midiendo el ajuste al cargo${target ? ` "${target}"` : " descrito en el CV"}. "recommendation": "strong" si score>=75, "maybe" si 50-74, "no" si <50. "summary": 2-3 frases en español. "strengths" y "gaps": máximo 5 puntos concretos cada uno. "skills": tecnologías y habilidades detectadas. Si un dato no aparece usa null (o 0 / []). Devuelve solo JSON.${reqs ? `\nRequisitos del cargo a considerar: ${reqs}` : ""}`;

  const isPdf = input.mime === "application/pdf";
  const userContent = isPdf
    ? [
        { type: "text" as const, text: "Evalúa esta hoja de vida." },
        { type: "file" as const, data: input.file_data_url, mediaType: input.mime, filename: "cv.pdf" },
      ]
    : [
        { type: "text" as const, text: "Evalúa esta hoja de vida." },
        { type: "image" as const, image: input.file_data_url },
      ];

  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const { generateText } = await import("ai");
  const gateway = createLovableAiGatewayProvider(input.apiKey);

  try {
    const res = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      system,
      messages: [{ role: "user", content: userContent }],
    });
    const normalized = normalizeResumeReview(extractJsonObject((res.text ?? "").trim()));
    if (!normalized) return { ok: false, error: "RESUME_PARSE_FAILED" };
    return { ok: true, data: normalized };
  } catch (err: unknown) {
    const e = err as { message?: string; statusCode?: number; status?: number; cause?: { statusCode?: number } };
    const status = e?.statusCode ?? e?.status ?? e?.cause?.statusCode;
    const msg = String(e?.message ?? "");
    if (status === 429 || /rate.?limit/i.test(msg)) return { ok: false, error: "RESUME_RATE_LIMITED" };
    if (status === 402 || /credit|payment.required/i.test(msg)) return { ok: false, error: "RESUME_NO_CREDITS" };
    if (/unsupported|mime|document has no pages|invalid.*image/i.test(msg))
      return { ok: false, error: "RESUME_UNSUPPORTED_FILE" };
    return { ok: false, error: "RESUME_FAILED" };
  }
}
