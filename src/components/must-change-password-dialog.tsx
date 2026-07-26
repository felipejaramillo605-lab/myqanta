import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clearMustChangePassword, getMyEmployeeRecord } from "@/lib/team.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MustChangePasswordGate() {
  const recordFn = useServerFn(getMyEmployeeRecord);
  const clearFn = useServerFn(clearMustChangePassword);
  const { data, refetch } = useQuery({
    queryKey: ["my-employee-record"],
    queryFn: () => recordFn(),
    retry: false,
  });
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);

  const required = !!data?.must_change_password;
  if (!required) return null;

  const submit = async () => {
    if (pwd.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (pwd !== pwd2) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw new Error(error.message);
      await clearFn();
      toast.success("Contraseña actualizada");
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        className="glass max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" /> Cambia tu contraseña
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tu cuenta fue creada con una contraseña temporal. Define una nueva contraseña para continuar.
        </p>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Nueva contraseña</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label className="text-xs">Confirmar contraseña</Label>
            <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Guardar y continuar
        </Button>
      </DialogContent>
    </Dialog>
  );
}