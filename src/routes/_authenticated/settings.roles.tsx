import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Pencil, Trash2 } from "lucide-react";
import {
  listCustomRoles,
  upsertCustomRole,
  deleteCustomRole,
  listMembersWithRoles,
  assignCustomRole,
} from "@/lib/custom-roles.functions";
import { groupedModules } from "@/lib/module-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings/roles")({
  component: RolesPage,
});

type RoleForm = {
  id?: string;
  name: string;
  description: string;
  allowed_modules: string[];
};

const emptyForm: RoleForm = { name: "", description: "", allowed_modules: [] };

function RolesPage() {
  const qc = useQueryClient();
  const rolesQ = useQuery({ queryKey: ["custom-roles"], queryFn: () => listCustomRoles() });
  const membersQ = useQuery({
    queryKey: ["custom-roles-members"],
    queryFn: () => listMembersWithRoles(),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const groups = useMemo(() => groupedModules(), []);

  const upsertM = useMutation({
    mutationFn: (input: RoleForm) =>
      upsertCustomRole({
        data: {
          id: input.id,
          name: input.name.trim(),
          description: input.description.trim() || null,
          allowed_modules: input.allowed_modules,
        },
      }),
    onSuccess: () => {
      toast.success("Rol guardado");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      qc.invalidateQueries({ queryKey: ["custom-roles-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteCustomRole({ data: { id } }),
    onSuccess: () => {
      toast.success("Rol eliminado");
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      qc.invalidateQueries({ queryKey: ["custom-roles-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignM = useMutation({
    mutationFn: (input: { user_id: string; custom_role_id: string | null }) =>
      assignCustomRole({ data: input }),
    onSuccess: () => {
      toast.success("Asignación actualizada");
      qc.invalidateQueries({ queryKey: ["custom-roles-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };
  const startEdit = (r: {
    id: string;
    name: string;
    description: string | null;
    allowed_modules: string[];
  }) => {
    setForm({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      allowed_modules: r.allowed_modules ?? [],
    });
    setOpen(true);
  };

  const toggleModule = (key: string) => {
    setForm((f) =>
      f.allowed_modules.includes(key)
        ? { ...f, allowed_modules: f.allowed_modules.filter((m) => m !== key) }
        : { ...f, allowed_modules: [...f.allowed_modules, key] },
    );
  };

  const toggleGroup = (items: { key: string }[]) => {
    setForm((f) => {
      const keys = items.map((i) => i.key);
      const allOn = keys.every((k) => f.allowed_modules.includes(k));
      const next = allOn
        ? f.allowed_modules.filter((k) => !keys.includes(k))
        : Array.from(new Set([...f.allowed_modules, ...keys]));
      return { ...f, allowed_modules: next };
    });
  };

  const roles = rolesQ.data?.roles ?? [];
  const members = membersQ.data?.members ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <KeyRound className="h-6 w-6" /> Roles y permisos
          </h1>
          <p className="text-sm text-muted-foreground">
            Crea roles personalizados para restringir el acceso de los miembros a
            módulos específicos. owner y admin siempre tienen acceso total.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo rol
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar rol" : "Nuevo rol"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={80}
                  placeholder="Ej: Contador, Ventas jr, RRHH"
                />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  maxLength={300}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-3">
                <Label>Módulos habilitados</Label>
                {groups.map((g) => {
                  const allOn = g.items.every((i) =>
                    form.allowed_modules.includes(i.key),
                  );
                  return (
                    <div key={g.group} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{g.group}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleGroup(g.items)}
                        >
                          {allOn ? "Quitar todos" : "Seleccionar todos"}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {g.items.map((m) => (
                          <label
                            key={m.key}
                            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted"
                          >
                            <Checkbox
                              checked={form.allowed_modules.includes(m.key)}
                              onCheckedChange={() => toggleModule(m.key)}
                            />
                            <span className="text-sm">{m.label}</span>
                            <span className="ml-auto font-mono text-xs text-muted-foreground">
                              {m.key}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => upsertM.mutate(form)}
                disabled={!form.name.trim() || upsertM.isPending}
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roles personalizados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rolesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no has creado roles personalizados.
            </p>
          ) : (
            roles.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <Badge variant="secondary">
                      {r.allowed_modules?.length ?? 0} módulos
                    </Badge>
                  </div>
                  {r.description && (
                    <p className="truncate text-sm text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                    <Pencil className="mr-1 h-3 w-3" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm(`¿Eliminar el rol "${r.name}"?`)) deleteM.mutate(r.id);
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Eliminar
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignación por miembro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {membersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            members.map((m) => {
              const isOwner = m.role === "owner";
              const isAdmin = m.role === "admin";
              return (
                <div
                  key={m.user_id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {m.full_name ?? m.user_id.slice(0, 8)}
                      </span>
                      <Badge variant="outline">{m.role}</Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {m.user_id}
                    </p>
                  </div>
                  <div className="w-full sm:w-64">
                    {isOwner ? (
                      <p className="text-xs text-muted-foreground">
                        Owner: acceso total
                      </p>
                    ) : isAdmin ? (
                      <p className="text-xs text-muted-foreground">
                        Admin: acceso total
                      </p>
                    ) : (
                      <Select
                        value={m.custom_role_id ?? "__none__"}
                        onValueChange={(v) =>
                          assignM.mutate({
                            user_id: m.user_id,
                            custom_role_id: v === "__none__" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin restricción" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin restricción</SelectItem>
                          {roles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}