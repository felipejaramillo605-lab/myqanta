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
import { useNavigate } from "@tanstack/react-router";

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
  const navigate = useNavigate();
  const open = payload !== null;
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
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
              if (payload) {
                navigate({
                  to: "/reminders",
                  search: {
                    source_type: payload.source_type,
                    source_id: payload.source_id,
                    title: payload.title,
                  } as never,
                });
              }
              onClose();
            }}
          >
            Sí, crear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}