// Lightweight CSV + PDF helpers (client-side only)

export function toCsv<T extends Record<string, unknown>>(rows: T[], headers?: (keyof T)[]): string {
  if (rows.length === 0) return "";
  const cols = headers ?? (Object.keys(rows[0]) as (keyof T)[]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : String(v);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const head = cols.map((c) => escape(String(c))).join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\n");
  return head + "\n" + body;
}

export function downloadFile(filename: string, content: string | Blob, mime = "text/csv;charset=utf-8") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv<T extends Record<string, unknown>>(filename: string, rows: T[], headers?: (keyof T)[]) {
  downloadFile(filename, toCsv(rows, headers));
}