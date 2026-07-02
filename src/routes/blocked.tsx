import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { amIBlocked } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/blocked")({
  ssr: false,
  component: BlockedPage,
});

function BlockedPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const check = useServerFn(amIBlocked);
  const { data: blocked, isLoading } = useQuery({
    queryKey: ["am-i-blocked"],
    queryFn: () => check(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (blocked === false) navigate({ to: "/dashboard", replace: true });
  }, [blocked, navigate]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="glass max-w-md rounded-2xl border border-border/50 p-8 text-center">
        <h1 className="mb-2 text-2xl font-semibold">Cuenta suspendida</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Tu acceso está temporalmente bloqueado. Regulariza tu membresía para
          reactivar la cuenta. Si crees que es un error, contacta al equipo.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["am-i-blocked"] })} disabled={isLoading}>
            Revisar estado
          </Button>
          <Button variant="ghost" onClick={signOut}>Cerrar sesión</Button>
        </div>
        <Link to="/auth" className="mt-4 block text-xs text-muted-foreground underline">Volver al inicio</Link>
      </div>
    </div>
  );
}