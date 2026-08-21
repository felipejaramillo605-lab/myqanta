import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Briefcase, Check, Loader2, Sparkles, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { groupedModules } from "@/lib/module-registry";
import {
  finishOnboarding,
  getOnboardingState,
  saveOnboardingMode,
  saveOnboardingProfile,
  saveOnboardingStep,
} from "@/lib/onboarding.functions";

/** Módulos que se ocultan por defecto en modo Personal. */
export const PERSONAL_HIDDEN_MODULES = [
  "/finance/journal",
  "/finance/policies",
  "/finance/parties",
  "/finance/banks",
  "/finance/taxes",
  "/finance/reconciliation",
  "/finance/balances",
  "/inventory",
  "/sales",
  "/hr",
  "/hr/org-chart",
  "/hr/attendance",
  "/team",
  "/crm",
  "/approvals",
];

const STEP_TITLES = [
  "Bienvenido a Qanta",
  "¿Cómo vas a usar Qanta?",
  "Datos de tu negocio",
  "Contexto para la IA",
  "Módulos visibles",
  "Todo listo",
];

type Props = {
  /** Fuerza la apertura del asistente (p. ej. desde Configuración). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function OnboardingWizard({ open: controlledOpen, onOpenChange }: Props) {
  const qc = useQueryClient();
  const getState = useServerFn(getOnboardingState);
  const saveProfile = useServerFn(saveOnboardingProfile);
  const saveMode = useServerFn(saveOnboardingMode);
  const saveStep = useServerFn(saveOnboardingStep);
  const finish = useServerFn(finishOnboarding);

  const { data: state } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: () => getState(),
    staleTime: 30_000,
  });

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInternalOpen(o));

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"business" | "personal">("business");
  const [hidden, setHidden] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    business_type: "personal",
    team_size: "1",
    currency: "USD",
    description: "",
    goals: "",
  });

  useEffect(() => {
    if (!state) return;
    setMode(state.view_mode);
    setHidden(state.hidden_modules ?? []);
    setForm({
      name: state.name ?? "",
      industry: state.industry ?? "",
      business_type: state.business_type ?? "personal",
      team_size: state.team_size ?? "1",
      currency: state.currency ?? "USD",
      description: state.description ?? "",
      goals: state.goals ?? "",
    });
    if (controlledOpen === undefined && state.is_owner && !state.onboarded_at && !state.skipped) {
      setStep(Math.min(state.step ?? 0, STEP_TITLES.length - 1));
      setInternalOpen(true);
    }
  }, [state, controlledOpen]);

  const groups = useMemo(() => groupedModules(), []);


  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["onboarding-state"] });
    qc.invalidateQueries({ queryKey: ["business-context"] });
    qc.invalidateQueries({ queryKey: ["org-view-preferences"] });
    qc.invalidateQueries({ queryKey: ["my-module-access"] });
    qc.invalidateQueries({ queryKey: ["setup-checklist"] });
  };

  const goto = (n: number) => {
    setStep(n);
    saveStep({ data: { step: n } }).catch(() => {});
  };

  const saveProfileM = useMutation({
    mutationFn: () => saveProfile({ data: { ...form, step: 3 } }),
    onSuccess: () => {
      invalidate();
      setStep(3);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveModeM = useMutation({
    mutationFn: (m: "business" | "personal") =>
      saveMode({
        data: {
          view_mode: m,
          hidden_modules: m === "personal" ? PERSONAL_HIDDEN_MODULES : [],
          step: 2,
        },
      }),
    onSuccess: (_r, m) => {
      setMode(m);
      setHidden(m === "personal" ? PERSONAL_HIDDEN_MODULES : []);
      invalidate();
      setStep(2);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveHiddenM = useMutation({
    mutationFn: () => saveMode({ data: { view_mode: mode, hidden_modules: hidden, step: 5 } }),
    onSuccess: () => {
      invalidate();
      setStep(5);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = saveProfileM.isPending || saveModeM.isPending || saveHiddenM.isPending;


  const finishM = useMutation({
    mutationFn: (skipped: boolean) => finish({ data: { skipped } }),
    onSuccess: () => {
      invalidate();
      toast.success("Configuración inicial guardada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleModule = (key: string) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finishM.mutate(true))}>
      <DialogContent className="glass max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {STEP_TITLES[step]}
          </DialogTitle>
          <DialogDescription>
            Paso {step + 1} de {STEP_TITLES.length} · puedes retomarlo después desde Configuración de empresa.
          </DialogDescription>
        </DialogHeader>

        <Progress value={((step + 1) / STEP_TITLES.length) * 100} className="h-1.5" />

        {step === 0 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              En 4 pasos dejamos tu espacio listo: elegimos la vista, cargamos los datos de tu negocio,
              le damos contexto a Qanta (tu asistente de IA) y activamos solo los módulos que necesitas.
            </p>
            <ul className="space-y-2 text-sm">
              {["Vista Empresarial o Personal", "Datos del negocio y moneda", "Objetivos para la IA", "Módulos visibles en el menú"].map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <Check className="size-4 text-primary" /> {s}
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => finishM.mutate(true)} disabled={busy}>
                Omitir por ahora
              </Button>
              <Button onClick={() => goto(1)}>Empezar</Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => saveModeM.mutate("business")}
                className={
                  "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:border-primary hover:bg-primary/5 " +
                  (mode === "business" ? "border-primary bg-primary/5" : "border-border/50 bg-background/60")
                }
              >
                <Briefcase className="size-5 text-primary" />
                <span className="text-base font-medium">Empresarial</span>
                <span className="text-xs text-muted-foreground">
                  Finanzas, RRHH, CRM, ventas, inventario, aprobaciones y reportes.
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => saveModeM.mutate("personal")}
                className={
                  "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:border-primary hover:bg-primary/5 " +
                  (mode === "personal" ? "border-primary bg-primary/5" : "border-border/50 bg-background/60")
                }
              >
                <User className="size-5 text-primary" />
                <span className="text-base font-medium">Personal</span>
                <span className="text-xs text-muted-foreground">
                  Agenda, tareas, hábitos, recordatorios, documentos y proyectos.
                </span>
              </button>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goto(0)}>Atrás</Button>
              {saveModeM.isPending && <Loader2 className="size-4 animate-spin" />}
            </div>
          </div>
        )}

        {step === 2 && (
          <form
            className="grid gap-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfileM.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="ob-name">Nombre del negocio</Label>
              <Input
                id="ob-name"
                required
                placeholder="Ej. Panadería La Espiga, Consultora Andes…"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ob-industry">Sector o actividad</Label>
              <Input
                id="ob-industry"
                required
                placeholder="Panadería, software, consultoría…"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ob-type">Tipo</Label>
                <select
                  id="ob-type"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={form.business_type}
                  onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                >
                  <option value="personal">Personal</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="b2c">B2C</option>
                  <option value="b2b">B2B</option>
                  <option value="saas">SaaS</option>
                  <option value="retail">Retail</option>
                  <option value="services">Servicios</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ob-team">Equipo</Label>
                <Input
                  id="ob-team"
                  placeholder="1, 2-10…"
                  value={form.team_size}
                  onChange={(e) => setForm({ ...form, team_size: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ob-cur">Moneda</Label>
                <Input
                  id="ob-cur"
                  maxLength={8}
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div className="flex justify-between pt-1">
              <Button type="button" variant="ghost" onClick={() => goto(1)}>Atrás</Button>
              <Button type="submit" disabled={busy || !form.name.trim() || !form.industry.trim()}>
                {saveProfileM.isPending ? <Loader2 className="size-4 animate-spin" /> : "Continuar"}
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form
            className="grid gap-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile({ data: { ...form, step: 4 } })
                .then(() => {
                  invalidate();
                  setStep(4);
                })
                .catch((err: Error) => toast.error(err.message));
            }}
          >
            <p className="text-sm text-muted-foreground">
              Esto no es obligatorio, pero mientras más contexto tenga Qanta, mejores respuestas y
              sugerencias te dará.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="ob-desc">¿Qué hace tu negocio?</Label>
              <Textarea
                id="ob-desc"
                rows={3}
                placeholder="Vendemos pan artesanal a 12 cafeterías en Bogotá…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ob-goals">Objetivos de los próximos meses</Label>
              <Textarea
                id="ob-goals"
                rows={3}
                placeholder="Bajar la cartera vencida, abrir un segundo punto…"
                value={form.goals}
                onChange={(e) => setForm({ ...form, goals: e.target.value })}
              />
            </div>
            <div className="flex justify-between pt-1">
              <Button type="button" variant="ghost" onClick={() => goto(2)}>Atrás</Button>
              <Button type="submit">Continuar</Button>
            </div>
          </form>
        )}

        {step === 4 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Desactiva lo que no uses: desaparece del menú y puedes volver a activarlo en cualquier momento.
            </p>
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.group} className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {g.group}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border/50">
                    {g.items.map((m, i) => (
                      <div
                        key={m.key}
                        className={"flex items-center justify-between gap-3 px-3 py-2 text-sm " + (i > 0 ? "border-t border-border/40" : "")}
                      >
                        <span>{m.label}</span>
                        <Switch checked={!hidden.includes(m.key)} onCheckedChange={() => toggleModule(m.key)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goto(3)}>Atrás</Button>
              <Button onClick={() => saveHiddenM.mutate()} disabled={saveHiddenM.isPending}>
                {saveHiddenM.isPending ? <Loader2 className="size-4 animate-spin" /> : "Guardar y continuar"}
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Tu espacio está listo. En el Panel encontrarás una lista de primeros pasos para llenar
              tus módulos con datos reales.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => goto(4)}>Atrás</Button>
              <Button onClick={() => finishM.mutate(false)} disabled={finishM.isPending}>
                {finishM.isPending ? <Loader2 className="size-4 animate-spin" /> : "Ir al Panel"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
