import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Briefcase, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getBusinessContext } from "@/lib/business-context.functions";
import { setViewMode, getOrgViewPreferences } from "@/lib/custom-roles.functions";
import { usePermissions } from "@/lib/use-permissions";

// Módulos que se ocultan por defecto en modo Personal.
const PERSONAL_HIDDEN = [
  "/finance/journal",
  "/finance/policies",
  "/finance/parties",
  "/finance/banks",
  "/finance/taxes",
  "/finance/reconciliation",
  "/inventory",
  "/sales",
  "/hr",
  "/hr/org-chart",
  "/hr/attendance",
  "/team",
  "/crm",
  "/approvals",
];

export function ViewModeOnboardingDialog() {
  const { isOwner } = usePermissions();
  const qc = useQueryClient();
  const getCtx = useServerFn(getBusinessContext);
  const getPrefs = useServerFn(getOrgViewPreferences);
  const saveFn = useServerFn(setViewMode);

  const { data: ctx } = useQuery({
    queryKey: ["business-context"],
    queryFn: () => getCtx({ data: undefined as never }),
    staleTime: 60_000,
    enabled: isOwner,
  });
  const { data: prefs } = useQuery({
    queryKey: ["org-view-preferences"],
    queryFn: () => getPrefs(),
    enabled: isOwner,
  });

  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isOwner) return;
    if (!ctx || !prefs) return;
    // Sólo si el onboarding no está completo y sigue en la default 'business'.
    if (!ctx.onboarded_at && (prefs.hidden_modules?.length ?? 0) === 0) {
      setOpen(true);
    }
  }, [isOwner, ctx, prefs]);

  const mut = useMutation({
    mutationFn: (mode: "business" | "personal") =>
      saveFn({ data: { view_mode: mode, hidden_modules: mode === "personal" ? PERSONAL_HIDDEN : [] } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-view-preferences"] });
      qc.invalidateQueries({ queryKey: ["my-module-access"] });
      toast.success("Preferencia guardada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass max-w-lg">
        <DialogHeader>
          <DialogTitle>¿Cómo vas a usar Qanta?</DialogTitle>
          <DialogDescription>
            Elige la vista que mejor se adapta a ti. Podrás cambiarla luego en Configuración de empresa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={mut.isPending}
            onClick={() => mut.mutate("business")}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border/50 bg-background/60 p-4 text-left transition hover:border-primary hover:bg-primary/5"
          >
            <Briefcase className="size-5 text-primary" />
            <span className="text-base font-medium">Empresarial</span>
            <span className="text-xs text-muted-foreground">
              Finanzas, RRHH, CRM, ventas, inventario, aprobaciones y reportes.
            </span>
          </button>
          <button
            type="button"
            disabled={mut.isPending}
            onClick={() => mut.mutate("personal")}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border/50 bg-background/60 p-4 text-left transition hover:border-primary hover:bg-primary/5"
          >
            <User className="size-5 text-primary" />
            <span className="text-base font-medium">Personal</span>
            <span className="text-xs text-muted-foreground">
              Agenda, tareas, hábitos, recordatorios, documentos y proyectos.
            </span>
          </button>
        </div>
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" onClick={() => setOpen(false)}>Ahora no</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}