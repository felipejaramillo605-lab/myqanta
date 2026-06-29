import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { listScanBatches, undoScanBatch } from "@/lib/scan-history.functions";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ScanHistoryDialog({
  kind,
  onUndone,
}: {
  kind: "invoice" | "statement";
  onUndone?: () => void;
}) {
  const { t, lang } = useI18n();
  const { canWrite } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const listFn = useServerFn(listScanBatches);
  const undoFn = useServerFn(undoScanBatch);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["scan-batches"],
    queryFn: () => listFn(),
    enabled: open,
    staleTime: 0,
  });

  const undoMut = useMutation({
    mutationFn: (id: string) => undoFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("history.undone_ok"));
      refetch();
      qc.invalidateQueries({ queryKey: ["inv"] });
      qc.invalidateQueries({ queryKey: ["finance"] });
      onUndone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data ?? []).filter((b) => b.kind === kind);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="size-4" />
          {t("history.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("history.title")}</DialogTitle>
          <DialogDescription>
            {kind === "invoice" ? t("history.kind.invoice") : t("history.kind.statement")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("history.empty")}</div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto">
            {rows.map((b) => {
              const isUndone = !!b.undone_at;
              const date = new Date(b.created_at).toLocaleString(lang === "es" ? "es-ES" : "en-US", {
                dateStyle: "short",
                timeStyle: "short",
              });
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{b.source_name ?? "—"}</div>
                      {isUndone && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("history.undone")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{b.summary}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{date}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUndone || undoMut.isPending || !canWrite}
                    onClick={() => {
                      if (window.confirm(t("history.confirm"))) undoMut.mutate(b.id);
                    }}
                  >
                    <Undo2 className="size-4" />
                    {t("history.undo")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}