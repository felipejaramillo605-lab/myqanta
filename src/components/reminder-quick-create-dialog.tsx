import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, MessageCircle } from "lucide-react";

import {
  createReminder,
  getWhatsappSettings,
  listReminderSources,
} from "@/lib/reminders.functions";
import { describeRecurrence, type Recurrence } from "@/lib/reminders-recurrence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReminderPromptPayload } from "@/components/reminder-prompt-dialog";

type Channel = "whatsapp" | "email";

export function ReminderQuickCreateDialog({
  payload,
  onClose,
}: {
  payload: ReminderPromptPayload | null;
  onClose: () => void;
}) {
  const open = payload !== null;
  const qc = useQueryClient();
  const createFn = useServerFn(createReminder);
  const settingsFn = useServerFn(getWhatsappSettings);
  const sourcesFn = useServerFn(listReminderSources);

  const { data: settings } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: () => settingsFn(),
    enabled: open,
  });
  const { data: sources } = useQuery({
    queryKey: ["reminder-sources"],
    queryFn: () => sourcesFn(),
    enabled: open,
  });

  const defaultWhen = useMemo(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  }, [open]);

  const [channel, setChannel] = useState<Channel>("email");
  const [teamMemberId, setTeamMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [phoneOverride, setPhoneOverride] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceUntil, setRecurrenceUntil] = useState("");

  // Reset on open with payload defaults
  useEffect(() => {
    if (!payload) return;
    setTitle(payload.title);
    setMessage(`⏰ Recordatorio: "${payload.title}"`);
    setChannel("email");
    setTeamMemberId("");
    setEmail("");
    setPhoneOverride("");
    setWhen(defaultWhen);
    setRecurrence("none");
    setRecurrenceInterval(1);
    setRecurrenceUntil("");
  }, [payload, defaultWhen]);

  // If we have a source id + type, try to prefill time from source
  useEffect(() => {
    if (!payload || !sources) return;
    if (payload.source_type === "task") {
      const t = sources.tasks.find((x) => x.id === payload.source_id);
      if (t?.due_date) {
        const lead = settings?.default_lead_minutes ?? 30;
        const d = new Date(new Date(t.due_date).getTime() - lead * 60_000);
        setWhen(
          new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16),
        );
      }
    } else if (payload.source_type === "event") {
      const ev = sources.events.find((x) => x.id === payload.source_id);
      if (ev) {
        const lead = settings?.default_lead_minutes ?? 30;
        const d = new Date(new Date(ev.starts_at).getTime() - lead * 60_000);
        setWhen(
          new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16),
        );
        setMessage(`📅 Recordatorio de agenda: "${ev.title}"`);
      }
    } else if (payload.source_type === "habit") {
      setMessage(`✅ Hora de tu hábito: "${payload.title}"`);
    }
  }, [payload, sources, settings]);

  function onTeamChange(id: string) {
    setTeamMemberId(id);
    const m = sources?.team.find((x) => x.id === id);
    if (m) {
      setEmail(m.email ?? "");
      setPhoneOverride(m.phone_e164 ?? "");
    }
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!payload) throw new Error("Sin origen");
      if (!title.trim() || !message.trim() || !when)
        throw new Error("Completa todos los campos");
      if (channel === "email" && !email.trim())
        throw new Error("Elige un miembro con correo o escribe uno.");
      if (
        channel === "whatsapp" &&
        !phoneOverride.trim() &&
        !(settings?.phone_e164 ?? "").trim()
      )
        throw new Error("Configura un número de WhatsApp.");
      return createFn({
        data: {
          source_type: payload.source_type,
          source_id: payload.source_id,
          title: title.trim(),
          message: message.trim(),
          channel,
          phone_e164:
            channel === "whatsapp"
              ? phoneOverride.trim() || settings?.phone_e164 || null
              : null,
          email: channel === "email" ? email.trim() : null,
          team_member_id: teamMemberId || null,
          scheduled_at: new Date(when).toISOString(),
          recurrence,
          recurrence_interval: recurrenceInterval,
          recurrence_until: recurrenceUntil
            ? new Date(recurrenceUntil).toISOString()
            : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Recordatorio programado");
      qc.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="glass max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo recordatorio</DialogTitle>
          <DialogDescription>
            {payload ? `Para "${payload.title}"` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">
                  <span className="inline-flex items-center gap-2"><Mail className="size-3" /> Email (Gmail)</span>
                </SelectItem>
                <SelectItem value="whatsapp">
                  <span className="inline-flex items-center gap-2"><MessageCircle className="size-3" /> WhatsApp</span>
                </SelectItem>
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
          </div>
          {channel === "email" ? (
            <div className="md:col-span-2">
              <Label className="text-xs">Correo destino</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@empresa.com" />
            </div>
          ) : (
            <div className="md:col-span-2">
              <Label className="text-xs">Teléfono destino (opcional)</Label>
              <Input value={phoneOverride} onChange={(e) => setPhoneOverride(e.target.value)} placeholder="+34612345678" />
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
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {channel === "email" ? <Mail className="size-4" /> : <MessageCircle className="size-4" />}
            Programar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}