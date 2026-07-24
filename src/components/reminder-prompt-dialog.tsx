import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReminderQuickCreateDialog } from "@/components/reminder-quick-create-dialog";

export type ReminderPromptPayload = {
  source_type: "event" | "task" | "habit";
  source_id: string;
  title: string;
};

export function ReminderPromptDialog({
  payload,
  onClose,
}: {
  payload: ReminderPromptPayload | null;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState<ReminderPromptPayload | null>(null);
  const promptOpen = payload !== null && creating === null;
  return (
    <>
    <AlertDialog open={promptOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent className="glass">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Crear un recordatorio?</AlertDialogTitle>
          <AlertDialogDescription>
            {payload
              ? `¿Quieres crear un recordatorio para "${payload.title}"?`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>No, gracias</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (payload) setCreating(payload);
            }}
          >
            Sí, crear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <ReminderQuickCreateDialog
      payload={creating}
      onClose={() => { setCreating(null); onClose(); }}
    />
    </>
  );
}