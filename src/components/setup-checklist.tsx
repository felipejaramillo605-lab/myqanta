import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, Circle, ListChecks, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSetupChecklist } from "@/lib/onboarding.functions";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export function SetupChecklist() {
  const checklistFn = useServerFn(getSetupChecklist);
  const stateFn = useServerFn(getOnboardingState);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: c } = useQuery({
    queryKey: ["setup-checklist"],
    queryFn: () => checklistFn(),
    staleTime: 60_000,
  });
  const { data: state } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: () => stateFn(),
    staleTime: 60_000,
  });

  if (!c || !state?.is_owner) return null;

  const personal = state.view_mode === "personal";
  const items = [
    { label: "Completar el perfil del negocio", done: c.profile_done, href: "/settings/company" },
    { label: "Registrar tu equipo", done: c.team_count > 0, href: "/team", hide: personal },
    { label: "Crear tu primer evento o tarea", done: c.agenda_count > 0, href: "/agenda" },
    { label: "Registrar tu primer movimiento contable", done: c.finance_count > 0, href: "/finance/journal", hide: personal },
    { label: "Cargar productos al inventario", done: c.product_count > 0, href: "/inventory", hide: personal },
    { label: "Agregar un contacto al CRM", done: c.contact_count > 0, href: "/crm", hide: personal },
    { label: "Emitir tu primera factura", done: c.invoice_count > 0, href: "/sales", hide: personal },
  ].filter((i) => !i.hide);

  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-primary" />
          <h2 className="text-sm font-medium">Primeros pasos</h2>
          <span className="font-mono text-[10px] text-muted-foreground">
            {done}/{items.length}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setWizardOpen(true)}>
          <Settings2 className="mr-1.5 size-3.5" /> Reabrir configuración guiada
        </Button>
      </div>
      <Progress value={(done / items.length) * 100} className="mt-3 h-1.5" />
      <ul className="mt-4 grid gap-1 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.label}>
            <Link
              to={i.href as never}
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-sidebar-accent/40"
            >
              {i.done ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={i.done ? "text-muted-foreground line-through" : ""}>{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {wizardOpen && <OnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />}
    </section>
  );
}
