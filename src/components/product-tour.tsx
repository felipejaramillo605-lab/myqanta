import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Calendar,
  Wallet,
  Contact2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getProductTourState, markProductTourSeen } from "@/lib/onboarding.functions";
import { getOnboardingState } from "@/lib/onboarding.functions";

const SLIDES = [
  {
    icon: LayoutDashboard,
    title: "Tu Panel, tu centro de mando",
    body: "Indicadores clave, alertas accionables (cartera vencida, stock crítico, aprobaciones pendientes) y la lista de primeros pasos para arrancar.",
  },
  {
    icon: Calendar,
    title: "Agenda unificada",
    body: "Eventos, tareas, hábitos y recordatorios en vistas de mes, semana y lista. Los recordatorios llegan por correo al empleado que elijas.",
  },
  {
    icon: Wallet,
    title: "Finanzas y contabilidad",
    body: "Asientos con PUC colombiano, bancos, impuestos, balances, indicadores financieros y OCR de facturas. Todo bajo NIIF.",
  },
  {
    icon: Contact2,
    title: "CRM y Ventas",
    body: "Pipeline de negocios por etapa, contactos, facturación con PDF, pagos y antigüedad de cartera de un vistazo.",
  },
  {
    icon: Sparkles,
    title: "Qanta, tu asistente con IA",
    body: "Pídele en lenguaje natural: agendar reuniones, crear contactos y facturas, ajustar stock, analizar hojas de vida o sugerir asientos contables citando la NIIF.",
  },
] as const;

type Props = {
  /** Apertura controlada (p. ej. "Ver tour" desde el menú). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ProductTour({ open: controlledOpen, onOpenChange }: Props) {
  const qc = useQueryClient();
  const fetchTour = useServerFn(getProductTourState);
  const fetchOnboarding = useServerFn(getOnboardingState);
  const markSeen = useServerFn(markProductTourSeen);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInternalOpen(o));

  const [idx, setIdx] = useState(0);

  const { data: tour } = useQuery({
    queryKey: ["product-tour-state"],
    queryFn: () => fetchTour(),
    staleTime: 60_000,
  });
  const { data: onboarding } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: () => fetchOnboarding(),
    staleTime: 30_000,
  });

  // Auto-apertura: solo cuando el onboarding funcional ya terminó (o se saltó)
  // y este usuario aún no ha visto el tour. No aplica en apertura controlada.
  useEffect(() => {
    if (controlledOpen !== undefined) return;
    if (!tour || !onboarding) return;
    const onboardingDone = !!onboarding.onboarded_at || onboarding.skipped || !onboarding.is_owner;
    if (onboardingDone && !tour.has_seen) {
      setIdx(0);
      setInternalOpen(true);
    }
  }, [tour, onboarding, controlledOpen]);

  const close = (seen: boolean) => {
    setOpen(false);
    if (seen) {
      markSeen().catch(() => {});
      qc.setQueryData(["product-tour-state"], { has_seen: true });
    }
  };

  const slide = SLIDES[idx]!;
  const Icon = slide.icon;
  const last = idx === SLIDES.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close(true))}>
      <DialogContent className="glass max-w-md overflow-hidden p-0">
        <button
          type="button"
          aria-label="Cerrar tour"
          onClick={() => close(true)}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center px-8 pb-6 pt-10 text-center">
          <div className="grid size-20 place-items-center rounded-3xl bg-primary/10">
            <Icon className="size-10 text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-semibold tracking-tight">{slide.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{slide.body}</p>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 px-5 py-4">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={
                  "h-1.5 rounded-full transition-all " +
                  (i === idx ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {idx === 0 ? (
              <Button variant="ghost" size="sm" onClick={() => close(true)}>
                Saltar tour
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setIdx(idx - 1)}>
                <ChevronLeft className="size-4" /> Atrás
              </Button>
            )}
            {last ? (
              <Button size="sm" onClick={() => close(true)}>
                Empezar
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIdx(idx + 1)}>
                Siguiente <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
