import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/reminders")({
  beforeLoad: () => { throw redirect({ to: "/agenda" }); },
  component: () => null,
});
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["reminders"], queryFn: () => listReminders() }),
      context.queryClient.ensureQueryData({ queryKey: ["whatsapp-settings"], queryFn: () => getWhatsappSettings() }),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  component: RemindersPage,
});

type SourceKind = "custom" | "task" | "habit" | "event";
type Channel = "whatsapp" | "email";

function RemindersPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const listFn = useServerFn(listReminders);
  const settingsFn = useServerFn(getWhatsappSettings);
  const sourcesFn = useServerFn(listReminderSources);
  const saveSettings = useServerFn(upsertWhatsappSettings);
  const createFn = useServerFn(createReminder);
  const cancelFn = useServerFn(cancelReminder);
  const delFn = useServerFn(deleteReminder);
  const sendNow = useServerFn(sendReminderNow);

  const { data: reminders } = useSuspenseQuery({ queryKey: ["reminders"], queryFn: () => listFn() });
  const { data: settings } = useSuspenseQuery({ queryKey: ["whatsapp-settings"], queryFn: () => settingsFn() });
  const { data: sources } = useQuery({ queryKey: ["reminder-sources"], queryFn: () => sourcesFn() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["reminders"] });

  // Settings form state
  const [phone, setPhone] = useState(settings.phone_e164 ?? "");
  const [enabled, setEnabled] = useState(settings.enabled);
  const [lead, setLead] = useState(settings.default_lead_minutes);

  const settingsMutation = useMutation({
    mutationFn: () =>
      saveSettings({ data: { phone_e164: phone || null, enabled, default_lead_minutes: lead } }),
    onSuccess: () => {
      toast.success("Preferencias guardadas");
      qc.invalidateQueries({ queryKey: ["whatsapp-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Create form state
  const [kind, setKind] = useState<SourceKind>("custom");
  const [sourceId, setSourceId] = useState<string>("");
  const [channel, setChannel] = useState<Channel>("email");
  const [teamMemberId, setTeamMemberId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phoneOverride, setPhoneOverride] = useState<string>("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const nowLocal = useMemo(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  }, []);
  const [when, setWhen] = useState(nowLocal);
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1);
  const [recurrenceUntil, setRecurrenceUntil] = useState<string>("");

  // Pre-fill from search params (e.g. arrived from Agenda "¿crear recordatorio?")
  useEffect(() => {
    if (search.source_type) {
      setKind(search.source_type);
    }
    if (search.source_id) {
      setSourceId(search.source_id);
    }
    if (search.title) {
      setTitle(search.title);
      setMessage(`⏰ Recordatorio: "${search.title}"`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKindChange(next: SourceKind) {
    setKind(next);
    setSourceId("");
  }

  function onTeamChange(id: string) {
    setTeamMemberId(id);
    const m = sources?.team.find((x) => x.id === id);
    if (m) {
      setEmail(m.email ?? "");
      setPhoneOverride(m.phone_e164 ?? "");
    }
  }

  function onSourceIdChange(id: string) {
    setSourceId(id);
    if (!sources) return;
    if (kind === "task") {
      const t = sources.tasks.find((x) => x.id === id);
      if (t) {
        setTitle(t.title);
        setMessage(`⏰ Recordatorio: "${t.title}"`);
        if (t.due_date) {
          const d = new Date(new Date(t.due_date).getTime() - lead * 60_000);
          setWhen(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
        }
      }
    } else if (kind === "event") {
      const ev = sources.events.find((x) => x.id === id);
      if (ev) {
        setTitle(ev.title);
        setMessage(`📅 Recordatorio de agenda: "${ev.title}"`);
        const d = new Date(new Date(ev.starts_at).getTime() - lead * 60_000);
        setWhen(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
      }
    } else if (kind === "habit") {
      const h = sources.habits.find((x) => x.id === id);
      if (h) {
        setTitle(h.name);
        setMessage(`✅ Hora de tu hábito: "${h.name}"`);
      }
    }
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!title.trim() || !message.trim() || !when) throw new Error("Completa todos los campos");
      if (channel === "email" && !email.trim()) throw new Error("Elige un miembro con correo o escribe uno.");
      if (channel === "whatsapp" && !phoneOverride.trim() && !phone.trim()) throw new Error("Configura un número de WhatsApp.");
      return createFn({
        data: {
          source_type: kind,
          source_id: sourceId || null,
          title: title.trim(),
          message: message.trim(),
          channel,
          phone_e164: channel === "whatsapp" ? (phoneOverride.trim() || phone.trim()) : null,
          email: channel === "email" ? email.trim() : null,
          team_member_id: teamMemberId || null,
          scheduled_at: new Date(when).toISOString(),
          recurrence,
          recurrence_interval: recurrenceInterval,
          recurrence_until: recurrenceUntil ? new Date(recurrenceUntil).toISOString() : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Recordatorio programado");
      setTitle("");
      setMessage("");
      setSourceId("");
      setTeamMemberId("");
      setEmail("");
      setPhoneOverride("");
      setRecurrence("none");
      setRecurrenceInterval(1);
      setRecurrenceUntil("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isMock = settings.provider === "mock";

  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          WHATSAPP · AUTOMATED REMINDERS
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Recordatorios WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Programa mensajes automáticos para tus tareas, hábitos y agenda.
        </p>
        {isMock && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
            Modo simulación activo: los mensajes se registran en el sistema pero no se envían a WhatsApp
            todavía. Conecta un proveedor (Twilio / GatewayAPI) para activar el envío real.
          </div>
        )}
      </header>

      {/* Settings */}
      <section className="glass rounded-2xl p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
          <Phone className="size-4" /> Preferencias
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Número WhatsApp (formato E.164)</Label>
            <Input
              placeholder="+34612345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Debe empezar por + y el código de país.
            </p>
          </div>
          <div>
            <Label className="text-xs">Antelación por defecto (min)</Label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={lead}
              onChange={(e) => setLead(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="enabled" className="text-sm">Recordatorios activos</Label>
          </div>
          <Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
            Guardar
          </Button>
        </div>
      </section>

      {/* Create */}
      <section className="glass rounded-2xl p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
          <Plus className="size-4" /> Nuevo recordatorio
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email"><span className="inline-flex items-center gap-2"><Mail className="size-3" /> Email (Gmail)</span></SelectItem>
                <SelectItem value="whatsapp"><span className="inline-flex items-center gap-2"><MessageCircle className="size-3" /> WhatsApp</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Miembro del equipo</Label>
            <Select value={teamMemberId} onValueChange={onTeamChange}>
              <SelectTrigger><SelectValue placeholder="— Sin asignar —" /></SelectTrigger>
              <SelectContent>
                {sources?.team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name} {m.position ? `· ${m.position}` : ""} ({m.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-muted-foreground">El destinatario se autocompleta desde el directorio.</p>
          </div>
          {channel === "email" ? (
            <div className="md:col-span-2">
              <Label className="text-xs">Correo destino</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@empresa.com" />
            </div>
          ) : (
            <div className="md:col-span-2">
              <Label className="text-xs">Teléfono destino (opcional; usa tu número por defecto si vacío)</Label>
              <Input value={phoneOverride} onChange={(e) => setPhoneOverride(e.target.value)} placeholder="+34612345678" />
            </div>
          )}
          <div>
            <Label className="text-xs">Origen</Label>
            <Select value={kind} onValueChange={(v) => onKindChange(v as SourceKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Personalizado</SelectItem>
                <SelectItem value="task">Tarea</SelectItem>
                <SelectItem value="habit">Hábito</SelectItem>
                <SelectItem value="event">Evento de agenda</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind !== "custom" && (
            <div>
              <Label className="text-xs">Seleccionar {kind}</Label>
              <Select value={sourceId} onValueChange={onSourceIdChange}>
                <SelectTrigger><SelectValue placeholder="Elige uno…" /></SelectTrigger>
                <SelectContent>
                  {kind === "task" && sources?.tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                  {kind === "event" && sources?.events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                  ))}
                  {kind === "habit" && sources?.habits.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="md:col-span-2">
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Mensaje</Label>
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Fecha y hora de envío</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Repetición</Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Una vez</SelectItem>
                <SelectItem value="daily">Diario</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {recurrence !== "none" && (
            <>
              <div>
                <Label className="text-xs">Cada (intervalo)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={recurrenceInterval}
                  onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1))}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {describeRecurrence(recurrence, recurrenceInterval)}
                </p>
              </div>
              <div>
                <Label className="text-xs">Finaliza el (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={recurrenceUntil}
                  onChange={(e) => setRecurrenceUntil(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {channel === "email" ? <Mail className="size-4" /> : <MessageCircle className="size-4" />} Programar
          </Button>
        </div>
      </section>

      {/* List */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Programados ({reminders.length})
        </h2>
        {reminders.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Aún no hay recordatorios.
          </div>
        ) : (
          <div className="space-y-2">
            {reminders.map((r) => (
              <div key={r.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.title}</span>
                    <StatusBadge status={r.status} />
                    <Badge variant="outline" className="text-[10px] uppercase">{r.source_type}</Badge>
                    {r.recurrence && r.recurrence !== "none" && (
                      <Badge variant="outline" className="text-[10px] normal-case">
                        🔁 {describeRecurrence(r.recurrence as Recurrence, r.recurrence_interval ?? 1)}
                      </Badge>
                    )}
                    {r.provider === "mock" && (
                      <Badge variant="secondary" className="text-[10px]">SIM</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.message}</p>
                  <div className="mt-1 flex flex-wrap gap-3 font-mono text-[10px] text-muted-foreground">
                    <span>{r.channel === "email" ? "✉" : "→"} {r.channel === "email" ? r.email : r.phone_e164}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">{r.channel ?? "whatsapp"}</Badge>
                    <span>⏱ {new Date(r.scheduled_at).toLocaleString()}</span>
                    {r.sent_at && <span>✓ {new Date(r.sent_at).toLocaleString()}</span>}
                    {r.error && <span className="text-destructive">✗ {r.error}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {r.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          sendNow({ data: { id: r.id } })
                            .then((res) => {
                              toast.success(res.simulated ? "Enviado (simulado)" : "Enviado");
                              refresh();
                            })
                            .catch((e: Error) => toast.error(e.message))
                        }
                      >
                        <Send className="size-3" /> Enviar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => cancelFn({ data: { id: r.id } }).then(refresh)}
                      >
                        <XCircle className="size-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => delFn({ data: { id: r.id } }).then(refresh)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendiente", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
    sent: { label: "Enviado", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    failed: { label: "Fallido", cls: "bg-destructive/15 text-destructive" },
    cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
  };
  const v = map[status] ?? map.pending;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] ${v.cls}`}>{v.label}</span>;
}