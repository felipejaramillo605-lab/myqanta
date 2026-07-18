import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/attendance/$orgId/$token")({
  head: () => ({ meta: [
    { title: "Marcar asistencia" },
    { name: "description", content: "Registra tu entrada o salida escaneando el QR de tu empresa." },
    { name: "robots", content: "noindex" },
  ] }),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: AttendancePublicPage,
});

function AttendancePublicPage() {
  const { orgId, token } = Route.useParams();
  const [cedula, setCedula] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(kind: "in" | "out") {
    if (!cedula.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/public/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, token, cedula: cedula.trim(), kind }),
      });
      const j = await res.json();
      if (j.ok) {
        setResult({
          ok: true,
          msg: `${j.full_name} — ${kind === "in" ? "Entrada" : "Salida"} registrada.`,
        });
        setCedula("");
      } else {
        const map: Record<string, string> = {
          token_invalido_o_expirado: "El QR ya no es válido. Pide el QR de hoy a tu manager.",
          cedula_no_encontrada: "Cédula no encontrada en la empresa.",
          rate_limited: "Demasiados intentos. Espera un minuto.",
          bad_payload: "Datos incompletos.",
          service_unavailable: "Servicio no disponible.",
        };
        setResult({ ok: false, msg: map[j.error] ?? "No se pudo registrar." });
      }
    } catch {
      setResult({ ok: false, msg: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="glass w-full rounded-2xl p-6 space-y-4">
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-3 font-mono text-xl">Marcar asistencia</h1>
          <p className="text-xs text-muted-foreground">Introduce tu cédula y elige entrada o salida.</p>
        </div>

        <div className="space-y-2">
          <Label>Cédula</Label>
          <Input
            inputMode="numeric"
            autoFocus
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="Tu número de identificación"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="default"
            disabled={busy || !cedula.trim()}
            onClick={() => submit("in")}
          >
            <LogIn className="mr-1 size-4" /> Entrada
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !cedula.trim()}
            onClick={() => submit("out")}
          >
            <LogOut className="mr-1 size-4" /> Salida
          </Button>
        </div>

        {result && (
          <div
            className={
              "rounded-lg border p-3 text-sm " +
              (result.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                : "border-rose-500/40 bg-rose-500/10 text-rose-500")
            }
          >
            {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}