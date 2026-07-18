import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";

import { listOrgNodes, saveOrgNode, deleteOrgNode, listHrMembers } from "@/lib/hr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/org-chart")({
  head: () => ({ meta: [
    { title: "Qanta — Organigrama" },
    { name: "description", content: "Estructura organizacional editable con drag & drop." },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["hr-members"], queryFn: () => listHrMembers() }),
      context.queryClient.ensureQueryData({ queryKey: ["org-nodes"], queryFn: () => listOrgNodes() }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: OrgChartPage,
});

type ChartNode = {
  id: string;
  member_id: string | null;
  label: string;
  position_title: string | null;
  parent_id: string | null;
  pos_x: number;
  pos_y: number;
};

function OrgChartPage() {
  const qc = useQueryClient();
  const membersQ = useSuspenseQuery({ queryKey: ["hr-members"], queryFn: () => listHrMembers() });
  const nodesQ = useSuspenseQuery({ queryKey: ["org-nodes"], queryFn: () => listOrgNodes() });
  const [editing, setEditing] = useState<Partial<ChartNode> | null>(null);

  const rows = nodesQ.data as ChartNode[];
  const members = membersQ.data as any[];

  const initialNodes = useMemo<Node[]>(() => rows.map((r) => ({
    id: r.id,
    position: { x: r.pos_x, y: r.pos_y },
    data: { label: (
      <div className="text-center">
        <div className="font-medium">{r.label}</div>
        {r.position_title && <div className="text-xs text-muted-foreground">{r.position_title}</div>}
      </div>
    ) },
    style: { padding: 10, borderRadius: 12, minWidth: 160 },
  })), [rows]);

  const initialEdges = useMemo<Edge[]>(() => rows
    .filter((r) => r.parent_id)
    .map((r) => ({ id: `${r.parent_id}-${r.id}`, source: r.parent_id!, target: r.id, animated: false })), [rows]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  useEffect(() => { setNodes(initialNodes); }, [initialNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges]);

  const save = useMutation({
    mutationFn: (v: any) => saveOrgNode({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["org-nodes"] }); setEditing(null); toast.success("Guardado"); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteOrgNode({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["org-nodes"] }); setEditing(null); },
  });

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    // Persist position on drag stop
    for (const c of changes) {
      if (c.type === "position" && !c.dragging && c.position) {
        const row = rows.find((r) => r.id === c.id);
        if (row) {
          save.mutate({
            id: row.id,
            member_id: row.member_id,
            label: row.label,
            position_title: row.position_title,
            parent_id: row.parent_id,
            pos_x: c.position.x,
            pos_y: c.position.y,
          });
        }
      }
    }
  }, [rows, save]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
    for (const c of changes) {
      if (c.type === "remove") {
        const [parent, child] = c.id.split("-");
        const row = rows.find((r) => r.id === child);
        if (row && row.parent_id === parent) {
          save.mutate({ ...row, parent_id: null });
        }
      }
    }
  }, [rows, save]);

  const onConnect = useCallback((conn: Connection) => {
    setEdges((es) => addEdge(conn, es));
    if (conn.source && conn.target) {
      const child = rows.find((r) => r.id === conn.target);
      if (child) save.mutate({ ...child, parent_id: conn.source });
    }
  }, [rows, save]);

  const openNew = () => setEditing({ label: "", position_title: "", member_id: null, parent_id: null, pos_x: 100, pos_y: 100 });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl">Organigrama</h1>
          <p className="text-sm text-muted-foreground">Arrastra para mover, conecta para asignar reporte.</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="mr-1 size-4" /> Nuevo nodo</Button>
      </header>

      <div className="glass rounded-2xl overflow-hidden" style={{ height: 600 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_, n) => {
            const row = rows.find((r) => r.id === n.id);
            if (row) setEditing(row);
          }}
          fitView
        >
          <Background />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted-foreground">Doble clic en un nodo para editar. Eliminar aristas quita la relación de reporte.</p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar nodo" : "Nuevo nodo"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div>
                <Label>Empleado (opcional)</Label>
                <Select
                  value={editing.member_id ?? "__none"}
                  onValueChange={(v) => {
                    const m = members.find((x) => x.id === v);
                    setEditing({
                      ...editing,
                      member_id: v === "__none" ? null : v,
                      label: m ? m.full_name : (editing.label ?? ""),
                      position_title: m?.position ?? editing.position_title ?? "",
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Ninguno (nodo libre)</SelectItem>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nombre</Label>
                <Input value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </div>
              <div>
                <Label>Cargo</Label>
                <Input value={editing.position_title ?? ""} onChange={(e) => setEditing({ ...editing, position_title: e.target.value })} />
              </div>
              <div>
                <Label>Reporta a</Label>
                <Select
                  value={editing.parent_id ?? "__none"}
                  onValueChange={(v) => setEditing({ ...editing, parent_id: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Sin superior" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin superior</SelectItem>
                    {rows.filter((r) => r.id !== editing.id).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between sm:justify-between">
            {editing?.id ? (
              <Button variant="ghost" onClick={() => editing.id && remove.mutate(editing.id)}>
                <Trash2 className="mr-1 size-4" /> Eliminar
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button
                disabled={save.isPending || !editing?.label}
                onClick={() => editing && save.mutate({
                  id: editing.id,
                  member_id: editing.member_id ?? null,
                  label: editing.label!,
                  position_title: editing.position_title ?? null,
                  parent_id: editing.parent_id ?? null,
                  pos_x: editing.pos_x ?? 100,
                  pos_y: editing.pos_y ?? 100,
                })}
              >Guardar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}