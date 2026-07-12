import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Trash2, Download, Search, Loader2, FileText } from "lucide-react";

import {
  listDocuments, createDocumentUpload, registerDocument,
  getDocumentDownloadUrl, deleteDocument,
  type DocumentRow,
} from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [
    { title: "Qanta — Documentos" },
    { name: "description", content: "Repositorio de documentos por organización con subida segura." },
  ] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["documents", ""],
      queryFn: () => listDocuments({ data: {} }),
    });
  },
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: DocumentsPage,
});

function humanSize(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

function DocumentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const docsQ = useSuspenseQuery({
    queryKey: ["documents", ""],
    queryFn: () => listDocuments({ data: {} }),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return docsQ.data;
    return docsQ.data.filter((d) =>
      d.name.toLowerCase().includes(term) ||
      (d.description ?? "").toLowerCase().includes(term) ||
      d.tags.some((t) => t.toLowerCase().includes(term)),
    );
  }, [q, docsQ.data]);

  const removeDoc = useMutation({
    mutationFn: (id: string) => deleteDocument({ data: { id } }),
    onSuccess: () => {
      toast.success("Documento eliminado");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  async function download(row: DocumentRow) {
    try {
      const { url, name } = await getDocumentDownloadUrl({ data: { id: row.id } });
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo descargar");
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { path, signedUrl } = await createDocumentUpload({
          data: { name: file.name, mime_type: file.type || undefined },
        });
        const put = await fetch(signedUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error(`Fallo al subir ${file.name}`);
        await registerDocument({
          data: {
            name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            storage_path: path,
            tags: [],
          },
        });
      }
      toast.success("Archivos subidos");
      qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al subir");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl">Documentos</h1>
          <p className="text-sm text-muted-foreground">Sube y organiza los archivos de tu organización.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Upload className="mr-1 size-4" />}
            Subir
          </Button>
        </div>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
        className={
          "glass rounded-2xl border-2 border-dashed p-8 text-center text-sm transition-colors " +
          (dragOver ? "border-primary bg-primary/5" : "border-border/60 text-muted-foreground")
        }
      >
        Arrastra archivos aquí para subirlos.
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Tamaño</th>
              <th className="px-3 py-2">Etiquetas</th>
              <th className="px-3 py-2">Subido</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-t border-border/40">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    {d.name}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{d.mime_type ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{humanSize(Number(d.size_bytes))}</td>
                <td className="px-3 py-2 space-x-1">
                  {d.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => download(d)} title="Descargar">
                    <Download className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeDoc.mutate(d.id)} title="Eliminar">
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sin documentos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
