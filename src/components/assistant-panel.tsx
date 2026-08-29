import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, RefreshCw, Wrench, Paperclip, X, Trash2, FileSpreadsheet } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chatWithAssistant } from "@/lib/assistant.functions";
import { useI18n } from "@/lib/i18n";

type ActionRecord = {
  tool: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  status: "ok" | "error";
};
type Msg = { role: "user" | "assistant"; content: string; actions?: ActionRecord[] };
type ChatReply = { reply: string; actions?: ActionRecord[] };
type Attachment = { data_url: string; mime: string; name: string };
type MissingAccount = { code: string; name: string; nature?: string };
type MissingSupplier = { name: string; tax_id?: string | null };

/** Extract the pending missing accounts/suppliers reported by the last actions. */
function pendingMissing(actions: ActionRecord[] | undefined) {
  const accounts: MissingAccount[] = [];
  const suppliers: MissingSupplier[] = [];
  for (const a of actions ?? []) {
    const r = a.result as { missing_accounts?: MissingAccount[]; missing_suppliers?: MissingSupplier[] };
    for (const acc of r?.missing_accounts ?? []) {
      if (acc?.code && !accounts.some((x) => x.code === acc.code)) accounts.push(acc);
    }
    for (const s of r?.missing_suppliers ?? []) {
      if (s?.name && !suppliers.some((x) => x.name === s.name)) suppliers.push(s);
    }
  }
  return { accounts, suppliers, has: accounts.length > 0 || suppliers.length > 0 };
}


export function AssistantPanel() {
  const { t, lang } = useI18n();
  const fn = useServerFn(chatWithAssistant);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [lastRegenAt, setLastRegenAt] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mut = useMutation({
    mutationFn: ({ history, file }: { history: Msg[]; file: Attachment | null }) =>
      fn({
        data: {
          messages: history.map(({ role, content }) => ({ role, content })),
          lang,
          attachment: file,
        },
      }) as Promise<ChatReply>,
    onSuccess: (res) =>
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, actions: res.actions ?? [] },
      ]),
    onError: (e: Error) =>
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ " + e.message }]),
  });

  const regen = useMutation({
    mutationFn: () =>
      fn({ data: { messages: [{ role: "user", content: t("ai.regen.prompt") }], lang } }) as Promise<ChatReply>,
    onSuccess: (res) => {
      setMessages((m) => [
        ...m,
        { role: "user", content: t("ai.regen") },
        { role: "assistant", content: res.reply, actions: res.actions ?? [] },
      ]);
      setLastRegenAt(new Date());
    },
    onError: (e: Error) =>
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ " + e.message }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mut.isPending, regen.isPending]);

  const sendText = (text: string) => {
    if (!text.trim() || mut.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    mut.mutate({ history: next, file: null });
  };

  const send = () => {
    const v = input.trim();
    if ((!v && !attachment) || mut.isPending) return;
    const text = v || (attachment ? `Adjunto la factura: ${attachment.name}` : "");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    mut.mutate({ history: next, file: attachment });
    setAttachment(null);
  };

  // "Pendiente de creación": solo se pregunta por el último mensaje del asistente.
  const lastMsg = messages[messages.length - 1];
  const missing =
    lastMsg?.role === "assistant" && !mut.isPending
      ? pendingMissing(lastMsg.actions)
      : { accounts: [] as MissingAccount[], suppliers: [] as MissingSupplier[], has: false };


  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ El archivo supera los 20 MB." }]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setAttachment({ data_url: String(reader.result), mime: file.type || "application/octet-stream", name: file.name });
    reader.readAsDataURL(file);
  };

  const busy = mut.isPending || regen.isPending;
  const statusText = regen.isPending
    ? t("ai.regen.loading")
    : lastRegenAt
      ? `${t("ai.regen.updated")} ${lastRegenAt.toLocaleTimeString(lang === "es" ? "es-ES" : "en-US", { hour: "2-digit", minute: "2-digit" })}`
      : t("ai.regen.never");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("ai.open")}>
          <Sparkles className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/50 px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
            <Sparkles className="size-4 text-primary" />
            {t("ai.title")}
          </SheetTitle>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => regen.mutate()}
              disabled={busy}
              className="gap-2"
            >
              <RefreshCw className={"size-3.5 " + (regen.isPending ? "animate-spin" : "")} />
              {t("ai.regen")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMessages([]);
                setAttachment(null);
                setInput("");
              }}
              disabled={busy || messages.length === 0}
              className="gap-2"
            >
              <Trash2 className="size-3.5" />
              {t("ai.clear")}
            </Button>
            <span
              className={
                "font-mono text-[10px] uppercase tracking-wider " +
                (regen.isPending ? "text-primary" : "text-muted-foreground")
              }
              aria-live="polite"
            >
              {statusText}
            </span>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="glass rounded-lg p-3 text-xs text-muted-foreground">{t("ai.intro")}</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="space-y-2">
              <div
                className={
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed " +
                  (m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-secondary/60 text-foreground")
                }
              >
                {m.content}
              </div>
              {m.actions?.map((a, j) => (
                <div
                  key={j}
                  className={
                    "max-w-[90%] rounded-md border px-3 py-2 text-xs " +
                    (a.status === "ok"
                      ? "border-primary/30 bg-primary/5 text-foreground"
                      : "border-destructive/40 bg-destructive/5 text-destructive")
                  }
                >
                  <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                    <Wrench className="size-3" />
                    {a.status === "ok" ? "Acción ejecutada" : "Acción fallida"}: {a.tool}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(a.status === "ok" ? a.result : { params: a.params, error: a.result }, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          ))}
          {mut.isPending && (
            <div className="max-w-[85%] rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              {t("ai.thinking")}
            </div>
          )}
        </div>

        <form
          className="flex flex-col gap-2 border-t border-border/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {attachment && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-2 py-1 text-[11px]">
              {/\.(xlsx|xls|xlsm|csv|md|markdown|txt)$/i.test(attachment.name) ? (
                <FileSpreadsheet className="size-3 shrink-0" />
              ) : (
                <Paperclip className="size-3 shrink-0" />
              )}
              <span className="truncate">{attachment.name}</span>
              <button
                type="button"
                aria-label="Quitar adjunto"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => setAttachment(null)}
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.xlsx,.xls,.xlsm,.csv,.md,.markdown,.txt"
              className="hidden"
              onChange={(e) => {
                onPickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Adjuntar factura, Excel o Markdown"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("ai.placeholder")}
              disabled={busy}
              autoFocus
              rows={2}
              maxLength={30000}
              className="max-h-40 min-h-[40px] resize-y"
            />
            <Button type="submit" size="icon" disabled={busy || (!input.trim() && !attachment)}>
              <Send className="size-4" />
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}