import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserCircle2 } from "lucide-react";

export type EmployeeCardData = {
  full_name: string;
  position: string | null;
  employee_id: string | null;
  photo_url?: string | null;
  status?: string | null;
};

export function EmployeeCardDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member: EmployeeCardData | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-sm">
        <DialogHeader>
          <DialogTitle>Tarjeta de empleado</DialogTitle>
        </DialogHeader>
        {member && (
          <div className="flex flex-col items-center gap-3 text-center">
            {member.photo_url ? (
              <img src={member.photo_url} alt={member.full_name} className="size-20 rounded-full object-cover" />
            ) : (
              <div className="grid size-20 place-items-center rounded-full bg-primary/10 text-primary">
                <UserCircle2 className="size-9" />
              </div>
            )}
            <div>
              <div className="text-lg font-semibold">{member.full_name}</div>
              {member.position && <div className="text-sm text-muted-foreground">{member.position}</div>}
            </div>
            {member.employee_id ? (
              <>
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG value={member.employee_id} size={168} />
                </div>
                <Badge variant="outline" className="font-mono text-[11px]">{member.employee_id}</Badge>
                <p className="text-[11px] text-muted-foreground">
                  Este código QR contiene el ID único del empleado.
                </p>
              </>
            ) : (
              <div className="w-full rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                {member.status === "rejected" ? "Solicitud rechazada" : "Pendiente de aprobación"}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}