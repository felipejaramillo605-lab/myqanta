import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Trash2, Upload } from "lucide-react";

import { analyzeResume, deleteResumeReview, listResumeReviews, type ResumeReviewRow } from "@/lib/hr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const REC_LABEL: Record<string, string> = { strong: "Recomendado", maybe: "A considerar", no: "No encaja" };
const REC_COLOR: Record<string, string> = {
  strong: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  maybe: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  no: "bg-rose-500/15 text-rose-500 border-rose-500/30",
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 75 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-rose-500";
  return (
    <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-full border border-border/60 bg-muted/20">
      <span className={`font-mono text-lg leading-none ${tone}`}>{score}</span>
      <span className="text-[10px] text-muted-foreground">/100</span>
    </div>
  );
}

export function HrResumeReviews() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [roleTarget, setRoleTarget] = useState("");
  const [requirements, setRequirements] = useState("");

  const reviewsQ = useQuery({ queryKey: ["hr-resumes"], queryFn: () => listResumeReviews() });

  const analyze = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await readAsDataUrl(file);
      return analyzeResume({
        data: {
          file_data_url: dataUrl,
          mime: file.type as "application/pdf",
          file_name: file.name,
          ...(roleTarget.trim() ? { role_target: roleTarget.trim() } : {}),
          ...(requirements.trim() ? { requirements: requirements.trim() } : {}),
        },
      });
    },
    onSuccess: (row) => {
      toast.success(`${row.candidate_name} analizado — puntaje ${row.score}/100`);
      qc.invalidateQueries({ queryKey: ["hr-resumes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "El análisis falló"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteResumeReview({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-resumes"] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Formato no soportado. Usa PDF, JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("El archivo supera 8 MB.");
      return;
    }
    analyze.mutate(file);
  };

  const rows = (reviewsQ.data ?? []) as ResumeReviewRow[];

  return (
    <div className="space-y-4">
      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" />
          <span className="font-medium">Análisis de hojas de vida con IA</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="role-target">Cargo o vacante</Label>
            <Input
              id="role-target"
              placeholder="Ej. Editor de video senior"
              value={roleTarget}
              onChange={(e) => setRoleTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="role-reqs">Requisitos (opcional)</Label>
            <Textarea
              id="role-reqs"
              rows={2}
              placeholder="Premiere, After Effects, 3+ años, portafolio de redes"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={analyze.isPending}>
            {analyze.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Upload className="mr-1 size-4" />}
            {analyze.isPending ? "Analizando…" : "Subir hoja de vida"}
          </Button>
          <span className="text-xs text-muted-foreground">PDF, JPG, PNG o WEBP · máx. 8 MB</span>
        </div>
      </div>

      {rows.length === 0 && !reviewsQ.isLoading && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 size-5" />
          Aún no hay hojas de vida analizadas. Sube un CV y la IA calculará el ajuste al cargo.
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="glass rounded-2xl p-4">
            <div className="flex items-start gap-4">
              <ScoreRing score={r.score} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.candidate_name}</span>
                  <Badge variant="outline" className={REC_COLOR[r.recommendation]}>
                    {REC_LABEL[r.recommendation] ?? r.recommendation}
                  </Badge>
                  {r.position_applied && (
                    <span className="text-xs text-muted-foreground">{r.position_applied}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {Number(r.experience_years) > 0 ? `${r.experience_years} años exp.` : "exp. no detectada"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{r.summary}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(r.strengths ?? []).length > 0 && (
                    <div className="text-xs">
                      <span className="text-emerald-500">Fortalezas</span>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {(r.strengths ?? []).map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {(r.gaps ?? []).length > 0 && (
                    <div className="text-xs">
                      <span className="text-amber-500">Brechas</span>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {(r.gaps ?? []).map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                {(r.skills ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(r.skills ?? []).slice(0, 12).map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {r.email && <span>{r.email}</span>}
                  {r.phone && <span>{r.phone}</span>}
                  {r.file_name && <span className="truncate">{r.file_name}</span>}
                </div>
              </div>
              <Button variant="ghost" size="icon" title="Eliminar" onClick={() => remove.mutate(r.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
