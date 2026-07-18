import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { listAttendance, getAttendanceQrInfo, listHrMembers } from "@/lib/hr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr_/attendance")({
  head: () => ({ meta: [
    { title: "Qanta — Asistencia" },
    { name: "description", content: "Marcas de entrada y salida vía QR diario." },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["hr-members"], queryFn: () => listHrMembers() }),
      context.queryClient.ensureQueryData({ queryKey: ["hr-attendance"], queryFn: () => listAttendance({ data: {} }) }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: AttendancePage,
});

function AttendancePage() {
  const membersQ = useSuspenseQuery({ queryKey: ["hr-members"], queryFn: () => listHrMembers() });
  const [memberFilter, setMemberFilter] = useState<string>("");
  const [range, setRange] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return { from: today, to: today };
  });
  const marksQ = useQuery({
    queryKey: ["hr-attendance", range, memberFilter],
    queryFn: () => listAttendance({ data: {
      from: `${range.from}T00:00:00.000Z`,
      to: `${range.to}T23:59:59.999Z`,
      member_id: memberFilter || undefined,
    } }),
  });
  const qrInfoQ = useQuery({ queryKey: ["attendance-qr"], queryFn: () => getAttendanceQrInfo() });

  const memberById = useMemo(() => new Map((membersQ.data as any[]).map((m) => [m.id, m])), [membersQ.data]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const publicUrl = qrInfoQ.data
    ? `${typeof window !== "undefined" ? window.location.origin : ""}${qrInfoQ.data.path}`
    : "";

  useEffect(() => {
    if (!publicUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, publicUrl, { width: 260, margin: 1 }).catch(() => {});
  }, [publicUrl]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Enlace copiado");
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-2xl">Asistencia</h1>
        <p className="text-sm text-muted-foreground">QR diario. Los empleados marcan entrada/salida con su cédula.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="glass rounded-2xl p-4 text-center space-y-3">
          <div className="text-xs uppercase text-muted-foreground">QR de hoy</div>
          <div className="grid place-items-center rounded-xl bg-white p-3">
            <canvas ref={canvasRef} />
          </div>
          <div className="text-xs text-muted-foreground break-all">{publicUrl}</div>
          <div className="flex gap-2 justify-center">
            <Button size="sm" variant="secondary" onClick={copyLink}>
              <Copy className="mr-1 size-4" /> Copiar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => qrInfoQ.refetch()}>
              <RefreshCw className="mr-1 size-4" /> Refrescar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Cambia automáticamente cada día.</p>
        </div>

        <div className="space-y-3">
          <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </div>
            <div className="min-w-[200px]">
              <Label className="text-xs">Empleado</Label>
              <Select value={memberFilter || "__all"} onValueChange={(v) => setMemberFilter(v === "__all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos</SelectItem>
                  {(membersQ.data as any[]).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Empleado</th>
                  <th className="px-3 py-2">Cédula</th>
                  <th className="px-3 py-2">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {(marksQ.data ?? []).map((m: any) => (
                  <tr key={m.id} className="border-t border-border/40">
                    <td className="px-3 py-2 font-mono">{new Date(m.occurred_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{memberById.get(m.member_id)?.full_name ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{m.cedula_used}</td>
                    <td className="px-3 py-2">{m.kind === "in" ? "Entrada" : "Salida"}</td>
                  </tr>
                ))}
                {(marksQ.data ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sin marcas en el rango.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}