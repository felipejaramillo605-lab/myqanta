import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Send, Trash2, XCircle, Plus } from "lucide-react";

import {
  cancelReminder,
  deleteReminder,
  listReminders,
  sendReminderNow,
} from "@/lib/reminders.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { describeRecurrence, type Recurrence } from "@/lib/reminders-recurrence";
import { ReminderQuickCreateDialog } from "@/components/reminder-quick-create-dialog";
import type { ReminderPromptPayload } from "@/components/reminder-prompt-dialog";

export function RemindersPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReminders);
  const cancelFn = useServerFn(cancelReminder);
  const delFn = useServerFn(deleteReminder);
  const sendNow = useServerFn(sendReminderNow);
  const { data: reminders } = useSuspenseQuery({ queryKey: ["reminders"], queryFn: () => listFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["reminders"] });

  const [creating, setCreating] = useState<ReminderPromptPayload | null>(null);

  const sendMut = useMutation({
    mutationFn: (id: string) => sendNow({ data: { id } }),
    onSuccess: (res) => {
      toast.success(res.simulated ? "Enviado (simulado)" : "Enviado");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {reminders.length} programados
        </p>
        <Button
          size="sm"
          onClick={() =>
            setCreating({ source_type: "event", source_id: "", title: "Recordatorio" })
          }
        >
          <Plus className="mr-1 size-3.5" /> Nuevo
        </Button>
      </div>
      {reminders.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
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
                    <Button size="sm" variant="outline" onClick={() => sendMut.mutate(r.id)}>
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
      <ReminderQuickCreateDialog payload={creating} onClose={() => setCreating(null)} />
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