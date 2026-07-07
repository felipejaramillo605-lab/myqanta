import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Calendar as CalendarIcon, Pencil, Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { deleteEvent, listEvents, upsertEvent } from "@/lib/productivity.functions";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Qanta — Agenda" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: ["agenda", "events"], queryFn: () => listEvents({ data: {} }) });
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: Agenda,
});

function Agenda() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const fn = useServerFn(listEvents);
  const upsertFn = useServerFn(upsertEvent);
  const delFn = useServerFn(deleteEvent);
  const { data: events } = useSuspenseQuery({ queryKey: ["agenda", "events"], queryFn: () => fn({ data: {} }) });

  const refresh = () => qc.invalidateQueries({ queryKey: ["agenda"] });
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.ends_at).getTime() >= now);
  const past = events.filter((e) => new Date(e.ends_at).getTime() < now).slice(0, 20);
  const locale = lang === "es" ? "es-ES" : "en-US";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">CALENDAR · TIMELINE</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t("ag.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ag.sub")}</p>
        </div>
        {canWrite && <EventDialog onSubmit={(v) => upsertFn({ data: v }).then(() => { refresh(); toast.success("✓"); }).catch((e: Error) => toast.error(e.message))} />}
      </header>

      <ReadOnlyBanner />

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("ag.upcoming")}</h2>
        {upcoming.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">{t("ag.empty")}</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <div key={e.id} className="glass flex items-center gap-4 rounded-2xl p-4">
                <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-primary/10 p-2 text-primary">
                  <div className="text-[10px] font-medium uppercase">{new Date(e.starts_at).toLocaleString(locale, { month: "short" })}</div>
                  <div className="font-mono text-2xl">{new Date(e.starts_at).getDate()}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <CalendarIcon className="size-3" />
                    {e.all_day
                      ? lang === "es" ? "Todo el día" : "All day"
                      : `${new Date(e.starts_at).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" })} – ${new Date(e.ends_at).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" })}`}
                    {e.location && <><span>·</span><MapPin className="size-3" />{e.location}</>}
                  </div>
                  {e.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.description}</p>}
                </div>
                <Link
                  to={"/reminders" as never}
                  aria-label="Crear recordatorio"
                  title="Crear recordatorio"
                  className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <Bell className="size-4" />
                </Link>
                {canWrite && (
                  <>
                    <EventDialog
                      initial={e}
                      trigger={<Button variant="ghost" size="icon"><Pencil className="size-4" /></Button>}
                      onSubmit={(v) => upsertFn({ data: { ...v, id: e.id } }).then(() => { refresh(); toast.success("✓"); }).catch((err: Error) => toast.error(err.message))}
                    />
                    <Button variant="ghost" size="icon" onClick={() => delFn({ data: { id: e.id } }).then(refresh)}><Trash2 className="size-4" /></Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("ag.past")}</h2>
          <div className="glass overflow-hidden rounded-2xl divide-y divide-border/40">
            {past.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-muted-foreground">{e.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{new Date(e.starts_at).toLocaleDateString(locale)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type EventInitial = {
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function EventDialog({
  onSubmit,
  initial,
  trigger,
}: {
  onSubmit: (v: { title: string; description?: string | null; location?: string | null; starts_at: string; ends_at: string; all_day: boolean }) => void;
  initial?: EventInitial;
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const def = today.toISOString().slice(0, 16);
  const defEnd = new Date(today.getTime() + 3600_000).toISOString().slice(0, 16);
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    starts: initial ? toLocalInput(initial.starts_at) : def,
    ends: initial ? toLocalInput(initial.ends_at) : defEnd,
    allDay: initial?.all_day ?? false,
  });
  const isEdit = !!initial;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4" />{t("ag.add")}</Button>}</DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>{isEdit ? "Editar evento" : t("ag.add")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs font-medium">{t("ag.field.title")}</Label>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.event_title")}</p>
          </div>
          <div>
            <Label className="text-xs font-medium">{t("pro.task.desc")}</Label>
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-medium">{t("ag.field.location")}</Label>
            <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.event_location")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="allday" checked={f.allDay} onCheckedChange={(v) => setF({ ...f, allDay: v })} />
            <Label htmlFor="allday" className="text-sm">{t("ag.field.all_day")}</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-medium">{t("ag.field.start")}</Label><Input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
            <div><Label className="text-xs font-medium">{t("ag.field.end")}</Label><Input type="datetime-local" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></div>
          </div>
          <p className="text-[10px] text-muted-foreground">{t("form.help.event_time")}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!f.title} onClick={() => {
            onSubmit({
              title: f.title,
              description: f.description || null,
              location: f.location || null,
              starts_at: new Date(f.starts).toISOString(),
              ends_at: new Date(f.ends).toISOString(),
              all_day: f.allDay,
            });
            setOpen(false);
          }}>{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}