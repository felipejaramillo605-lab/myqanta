import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/policies")({
  head: () => ({ meta: [{ title: "Qanta — Políticas contables" }] }),
  component: PoliciesPage,
});

function PoliciesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Políticas contables</h1>
      <div className="glass rounded-2xl p-8 text-center space-y-4">
        <FileText className="size-12 mx-auto text-primary" />
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Las políticas contables se gestionan como documentos en el módulo Documentos con la etiqueta
          <code className="mx-1 px-2 py-0.5 rounded bg-muted font-mono text-xs">politica-contable</code>.
          No hay almacenamiento duplicado.
        </p>
        <Link to="/documents" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">
          Abrir en Documentos <ExternalLink className="size-4" />
        </Link>
      </div>
    </div>
  );
}