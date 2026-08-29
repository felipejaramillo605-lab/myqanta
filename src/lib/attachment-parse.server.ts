/**
 * Server-side parsing of chat attachments that are NOT images/PDF invoices:
 * spreadsheets (.xlsx/.xls/.csv) and Markdown/plain text (.md/.txt).
 * The extracted plain text is injected into Qanta's prompt so it can read
 * financial statements and propose DRAFT journal entries.
 */

export type ParsedAttachment = {
  kind: "spreadsheet" | "text";
  name: string;
  text: string;
  truncated: boolean;
};

const MAX_CHARS = 60_000;

export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const payload = m[3] ?? "";
  try {
    if (m[2]) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mime };
  } catch {
    return null;
  }
}

/** True when the attachment should be read as a document (not OCR'd as an invoice). */
export function isDocumentAttachment(mime: string, name: string): boolean {
  const n = name.toLowerCase();
  return (
    /spreadsheet|excel|csv|markdown|text\/plain/.test(mime) ||
    /\.(xlsx|xlsm|xls|csv|md|markdown|txt)$/.test(n)
  );
}

export async function parseDocumentAttachment(
  dataUrl: string,
  mime: string,
  name: string,
): Promise<ParsedAttachment | { error: string }> {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return { error: "No pude leer el archivo adjunto (data URL inválida)." };
  const n = name.toLowerCase();
  const isSheet = /spreadsheet|excel/.test(mime) || /\.(xlsx|xlsm|xls)$/.test(n);

  try {
    if (isSheet) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(decoded.bytes, { type: "array" });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
        if (csv.trim()) parts.push(`### Hoja: ${sheetName}\n${csv.trim()}`);
      }
      const full = parts.join("\n\n");
      if (!full.trim()) return { error: "El archivo de Excel está vacío o no tiene celdas legibles." };
      return {
        kind: "spreadsheet",
        name,
        text: full.slice(0, MAX_CHARS),
        truncated: full.length > MAX_CHARS,
      };
    }
    const text = new TextDecoder("utf-8").decode(decoded.bytes);
    if (!text.trim()) return { error: "El archivo está vacío." };
    return { kind: "text", name, text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS };
  } catch (e) {
    return {
      error: `No pude interpretar "${name}": ${e instanceof Error ? e.message : "formato no soportado"}. Prueba exportarlo como .xlsx, .csv o .md.`,
    };
  }
}
