import { useI18n } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, titleKey }: { icon: LucideIcon; titleKey: string }) {
  const { t, lang } = useI18n();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Icon className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t(titleKey as never)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "es"
            ? "Este módulo se construirá en la siguiente fase."
            : "This module will be built in the next phase."}
        </p>
        <div className="mt-4 inline-block rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("dash.phase")}
        </div>
      </div>
    </div>
  );
}