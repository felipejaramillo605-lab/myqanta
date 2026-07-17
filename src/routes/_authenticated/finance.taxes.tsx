import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileText } from "lucide-react";
import { listTaxDrafts, generateTaxDraft, upsertTaxDraft, deleteTaxDraft } from "@/lib/finance-ext.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/finance/taxes")({
  head: () => ({ meta: [{ title: "Qanta — Impuestos" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: ["tax_drafts"], queryFn: () => listTaxDrafts() });
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-destructive text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: TaxesPage,
});

function TaxesPage() {
  const qc = useQueryClient();
  const q = useSuspenseQuery({ queryKey: ["tax_drafts"], queryFn: () => listTaxDrafts() });
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [gen, setGen] = useState({ period_start: first, period_end: last, tax_type: "vat" as "vat" | "ica" | "other_retention" });

  const genMut = useMutation({
    mutationFn: (d: any) => generateTaxDraft({ data: d }),
    onSuccess: () => { toast.success("Borrador generado"); qc.invalidateQueries({ queryKey: ["tax_drafts"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const saveMut = useMutation({
    mutationFn: (d: any) => upsertTaxDraft({ data: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax_drafts"] }),
  });
  const delMut = useMutation({ mutationFn: (id: string) => deleteTaxDraft({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["tax_drafts"] }) });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Impuestos — borradores</h1>
      <div className="text-xs text-muted-foreground">Estos borradores se prellenan desde la configuración fiscal de tu empresa. Son de revisión manual, no se presentan ante ninguna autoridad.</div>

      <div className="glass rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-2">
        <Input type="date" value={gen.period_start} onChange={(e) => setGen({ ...gen, period_start: e.target.value })} />
        <Input type="date" value={gen.period_end} onChange={(e) => setGen({ ...gen, period_end: e.target.value })} />
        <Select value={gen.tax_type} onValueChange={(v: any) => setGen({ ...gen, tax_type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vat">IVA</SelectItem>
            <SelectItem value="ica">ICA</SelectItem>
            <SelectItem value="other_retention">Otras retenciones</SelectItem>
          </SelectContent>
        </Select>
        <Button className="md:col-span-2" onClick={() => genMut.mutate(gen)}><Plus className="size-4 mr-1" /> Generar borrador</Button>
      </div>

      <div className="space-y-3">
        {q.data.map((d: any) => (
          <div key={d.id} className="glass rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4" />
                <span className="font-medium uppercase">{d.tax_type}</span>
                <span className="text-xs text-muted-foreground">{d.period_start} → {d.period_end}</span>
                <Badge variant={d.status === "reviewed" ? "default" : "secondary"}>{d.status}</Badge>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => saveMut.mutate({ ...d, status: d.status === "reviewed" ? "draft" : "reviewed" })}>
                  {d.status === "reviewed" ? "Marcar borrador" : "Marcar revisado"}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => delMut.mutate(d.id)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
            <pre className="text-xs bg-muted rounded p-3 overflow-auto">{JSON.stringify(d.data, null, 2)}</pre>
            <Textarea placeholder="Notas de revisión" defaultValue={d.notes ?? ""}
              onBlur={(e) => e.target.value !== (d.notes ?? "") && saveMut.mutate({ ...d, notes: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}