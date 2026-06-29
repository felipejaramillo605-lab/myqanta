import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatWithAssistant } from "@/lib/assistant.functions";
import { useI18n } from "@/lib/i18n";

type Msg = { role: "user" | "assistant"; content: string };

export function AssistantPanel() {
  const { t, lang } = useI18n();
  const fn = useServerFn(chatWithAssistant);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [lastRegenAt, setLastRegenAt] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mut = useMutation({
    mutationFn: (history: Msg[]) => fn({ data: { messages: history, lang } }),
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.reply }]),
    onError: (e: Error) =>
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ " + e.message }]),
  });

  const regen = useMutation({
    mutationFn: () => fn({ data: { messages: [{ role: "user", content: t("ai.regen.prompt") }], lang } }),
    onSuccess: (res) => {
      setMessages((m) => [
        ...m,
        { role: "user", content: t("ai.regen") },
        { role: "assistant", content: res.reply },
      ]);
      setLastRegenAt(new Date());
    },
    onError: (e: Error) =>
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ " + e.message }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mut.isPending, regen.isPending]);

  const send = () => {
    const v = input.trim();
    if (!v || mut.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: v }];
    setMessages(next);
    setInput("");
    mut.mutate(next);
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
            <div
              key={i}
              className={
                "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed " +
                (m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-foreground")
              }
            >
              {m.content}
            </div>
          ))}
          {mut.isPending && (
            <div className="max-w-[85%] rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              {t("ai.thinking")}
            </div>
          )}
        </div>

        <form
          className="flex items-center gap-2 border-t border-border/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ai.placeholder")}
            disabled={busy}
            autoFocus
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}