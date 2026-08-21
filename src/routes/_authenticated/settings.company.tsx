import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Loader2, Plus, X } from "lucide-react";
import {
  getBusinessContext,
  updateCompanySettings,
  updateBusinessProfile,
  APPROVAL_MODULES,
  type ApprovalModule,
  type ApproversByModule,
  type BusinessContext,
} from "@/lib/business-context.functions";
import { listMembers } from "@/lib/org.functions";
import { getOrgViewPreferences, setViewMode } from "@/lib/custom-roles.functions";
import { groupedModules } from "@/lib/module-registry";
import { usePermissions } from "@/lib/use-permissions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const qKey = ["business-context"] as const;
const membersKey = ["org-members"] as const;

export const Route = createFileRoute("/_authenticated/settings/company")({
  head: () => ({ meta: [
    { title: "Qanta — Configuración de empresa" },
    { name: "description", content: "Datos fiscales, logo y series de facturación de tu organización." },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: qKey, queryFn: () => getBusinessContext() }),
      context.queryClient.ensureQueryData({ queryKey: membersKey, queryFn: () => listMembers() }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: CompanySettingsPage,
});

const MODULE_LABELS: Record<ApprovalModule, string> = {
  purchases: "Compras",
  legal: "Legal",
  finance: "Finanzas",
  hr: "RRHH",
};

function CompanySettingsPage() {
  const { data } = useSuspenseQuery<BusinessContext>({ queryKey: qKey, queryFn: () => getBusinessContext() });
  const { data: membersData } = useSuspenseQuery({ queryKey: membersKey, queryFn: () => listMembers() });
  const qc = useQueryClient();
  const members = membersData.members;
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.full_name || id.slice(0, 8);
  const { isOwner } = usePermissions();
  const fetchPrefs = useServerFn(getOrgViewPreferences);
  const saveViewFn = useServerFn(setViewMode);
  const { data: prefs } = useQuery({
    queryKey: ["org-view-preferences"],
    queryFn: () => fetchPrefs(),
  });
  const [viewMode, setViewModeState] = useState<"business" | "personal">("business");
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (prefs) {
      setViewModeState(prefs.view_mode);
      setHidden(prefs.hidden_modules ?? []);
    }
  }, [prefs]);
  const toggleHidden = (key: string) => {
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  };
  const saveView = useMutation({
    mutationFn: () => saveViewFn({ data: { view_mode: viewMode, hidden_modules: hidden } }),
    onSuccess: () => {
      toast.success("Vista actualizada");
      qc.invalidateQueries({ queryKey: ["org-view-preferences"] });
      qc.invalidateQueries({ queryKey: ["my-module-access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    name: data.name,
    tax_id: data.tax_id ?? "",
    address: data.address ?? "",
    phone: data.phone ?? "",
    contact_email: data.contact_email ?? "",
    website: data.website ?? "",
    logo_url: data.logo_url ?? "",
    invoice_prefix: data.invoice_prefix ?? "",
    invoice_footer: data.invoice_footer ?? "",
    default_vat_rate: data.default_vat_rate != null ? String(data.default_vat_rate) : "",
    currency: data.currency ?? "USD",
  });

  const [profile, setProfile] = useState({
    approvers_by_module: (data.approvers_by_module ?? {}) as ApproversByModule,
    vat_responsible: data.vat_responsible,
    ica_responsible: data.ica_responsible,
    ica_rate: data.ica_rate != null ? String(data.ica_rate) : "0",
    other_retentions: data.other_retentions ?? "",
  });

  useEffect(() => {
    setForm({
      name: data.name,
      tax_id: data.tax_id ?? "",
      address: data.address ?? "",
      phone: data.phone ?? "",
      contact_email: data.contact_email ?? "",
      website: data.website ?? "",
      logo_url: data.logo_url ?? "",
      invoice_prefix: data.invoice_prefix ?? "",
      invoice_footer: data.invoice_footer ?? "",
      default_vat_rate: data.default_vat_rate != null ? String(data.default_vat_rate) : "",
      currency: data.currency ?? "USD",
    });
    setProfile({
      approvers_by_module: (data.approvers_by_module ?? {}) as ApproversByModule,
      vat_responsible: data.vat_responsible,
      ica_responsible: data.ica_responsible,
      ica_rate: data.ica_rate != null ? String(data.ica_rate) : "0",
      other_retentions: data.other_retentions ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateCompanySettings({ data: {
      name: form.name.trim(),
      tax_id: form.tax_id.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      contact_email: form.contact_email.trim(),
      website: form.website.trim(),
      logo_url: form.logo_url.trim(),
      invoice_prefix: form.invoice_prefix.trim(),
      invoice_footer: form.invoice_footer.trim(),
      default_vat_rate: form.default_vat_rate.trim() ? Number(form.default_vat_rate) : null,
      currency: form.currency.trim() || "USD",
    } }),
    onSuccess: () => {
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: qKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveProfile = useMutation({
    mutationFn: () => updateBusinessProfile({ data: {
      approvers_by_module: profile.approvers_by_module as Record<ApprovalModule, string[]>,
      vat_responsible: profile.vat_responsible,
      ica_responsible: profile.ica_responsible,
      ica_rate: profile.ica_rate.trim() ? Number(profile.ica_rate) : 0,
      other_retentions: profile.other_retentions.trim(),
    } }),
    onSuccess: () => {
      toast.success("Perfil de negocio guardado");
      qc.invalidateQueries({ queryKey: qKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addApprover = (mod: ApprovalModule, userId: string) => {
    if (!userId) return;
    setProfile((p) => {
      const cur = p.approvers_by_module[mod] ?? [];
      if (cur.includes(userId) || cur.length >= 4) return p;
      return { ...p, approvers_by_module: { ...p.approvers_by_module, [mod]: [...cur, userId] } };
    });
  };
  const removeApprover = (mod: ApprovalModule, userId: string) => {
    setProfile((p) => {
      const cur = (p.approvers_by_module[mod] ?? []).filter((id) => id !== userId);
      const next = { ...p.approvers_by_module };
      if (cur.length) next[mod] = cur;
      else delete next[mod];
      return { ...p, approvers_by_module: next };
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuración de empresa</h1>
          <p className="text-sm text-muted-foreground">Estos datos aparecerán en tus facturas y comunicaciones.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}>
          <Sparkles className="mr-1.5 size-3.5" /> Configuración guiada
        </Button>
      </header>
      {wizardOpen && <OnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />}


      <div className="glass space-y-5 rounded-2xl p-6">
        <Section title="Identidad">
          <Field label="Nombre" value={form.name} onChange={(v) => set("name", v)} />
          <Field label="Identificador fiscal" value={form.tax_id} onChange={(v) => set("tax_id", v)} placeholder="RUT / NIF / CIF / EIN" />
          <Field label="URL del logo" value={form.logo_url} onChange={(v) => set("logo_url", v)} placeholder="https://…" />
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo" className="h-16 w-auto rounded border border-border/40 bg-background object-contain p-2" />
          )}
        </Section>

        <Section title="Contacto">
          <Field label="Dirección" value={form.address} onChange={(v) => set("address", v)} />
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Teléfono" value={form.phone} onChange={(v) => set("phone", v)} />
            <Field label="Email" value={form.contact_email} onChange={(v) => set("contact_email", v)} />
          </div>
          <Field label="Sitio web" value={form.website} onChange={(v) => set("website", v)} placeholder="https://…" />
        </Section>

        <Section title="Facturación">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Prefijo de factura" value={form.invoice_prefix} onChange={(v) => set("invoice_prefix", v)} placeholder="INV-" />
            <Field label="IVA por defecto (%)" value={form.default_vat_rate} onChange={(v) => set("default_vat_rate", v)} placeholder="21" />
            <Field label="Moneda" value={form.currency} onChange={(v) => set("currency", v)} placeholder="USD" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Pie de página de facturas</label>
            <Textarea value={form.invoice_footer} onChange={(e) => set("invoice_footer", e.target.value)} rows={3} />
          </div>
        </Section>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className="glass space-y-5 rounded-2xl p-6">
        <header>
          <h2 className="text-lg font-semibold">Perfil de negocio</h2>
          <p className="text-sm text-muted-foreground">
            Aprobadores por módulo (1 a 4 por módulo) y régimen tributario. Alimenta el motor de aprobaciones y el módulo de impuestos.
          </p>
        </header>

        <Section title="Aprobadores por módulo">
          <div className="space-y-4">
            {APPROVAL_MODULES.map((mod) => {
              const selected = profile.approvers_by_module[mod] ?? [];
              const available = members.filter((m) => !selected.includes(m.user_id));
              return (
                <div key={mod} className="space-y-2 rounded-lg border border-border/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{MODULE_LABELS[mod]}</span>
                    <span className="text-xs text-muted-foreground">{selected.length}/4</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.length === 0 && (
                      <span className="text-xs text-muted-foreground">Sin aprobadores asignados</span>
                    )}
                    {selected.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs">
                        {nameOf(id)}
                        <button
                          type="button"
                          onClick={() => removeApprover(mod, id)}
                          className="rounded-full p-0.5 hover:bg-primary/20"
                          aria-label="Quitar"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {selected.length < 4 && available.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                        value=""
                        onChange={(e) => addApprover(mod, e.target.value)}
                      >
                        <option value="">+ Añadir aprobador…</option>
                        {available.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.full_name || m.user_id.slice(0, 8)} ({m.role})
                          </option>
                        ))}
                      </select>
                      <Plus className="size-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Régimen tributario">
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
            <div>
              <div className="text-sm font-medium">Responsable de IVA</div>
              <div className="text-xs text-muted-foreground">Marca si la organización declara IVA.</div>
            </div>
            <Switch
              checked={profile.vat_responsible}
              onCheckedChange={(v) => setProfile((p) => ({ ...p, vat_responsible: v }))}
            />
          </div>
          <div className="rounded-lg border border-border/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Responsable de ICA</div>
                <div className="text-xs text-muted-foreground">Impuesto de industria y comercio.</div>
              </div>
              <Switch
                checked={profile.ica_responsible}
                onCheckedChange={(v) => setProfile((p) => ({ ...p, ica_responsible: v }))}
              />
            </div>
            {profile.ica_responsible && (
              <Field
                label="Tarifa ICA (por mil o %)"
                value={profile.ica_rate}
                onChange={(v) => setProfile((p) => ({ ...p, ica_rate: v }))}
                placeholder="Ej. 4.14 o 0.414"
              />
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Otras retenciones aplicables</label>
            <Textarea
              value={profile.other_retentions}
              onChange={(e) => setProfile((p) => ({ ...p, other_retentions: e.target.value }))}
              rows={3}
              placeholder="Retención en la fuente, autoretenciones, etc."
            />
          </div>
        </Section>

        <div className="flex justify-end">
          <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
            {saveProfile.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            Guardar perfil
          </Button>
        </div>
      </div>

      {isOwner && (
        <div className="glass space-y-5 rounded-2xl p-6">
          <header>
            <h2 className="text-lg font-semibold">Vista de la aplicación</h2>
            <p className="text-sm text-muted-foreground">
              Elige entre vista empresarial (todos los módulos) o personal (sólo agenda, hábitos, recordatorios, etc.). Aplica a todos los miembros de la organización.
            </p>
          </header>
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
            <div>
              <div className="text-sm font-medium">Modo</div>
              <div className="text-xs text-muted-foreground">
                {viewMode === "business" ? "Empresarial" : "Personal"}
              </div>
            </div>
            <Switch
              checked={viewMode === "personal"}
              onCheckedChange={(v) => setViewModeState(v ? "personal" : "business")}
            />
          </div>
          {viewMode === "personal" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Marca los módulos que quieres ocultar del menú.
              </p>
              {groupedModules().map(({ group, items }) => (
                <div key={group} className="rounded-lg border border-border/40 p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {group}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((m) => (
                      <label key={m.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={hidden.includes(m.key)}
                          onChange={() => toggleHidden(m.key)}
                        />
                        <span>{m.label}</span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                          {m.key}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => saveView.mutate()} disabled={saveView.isPending}>
              {saveView.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Guardar vista
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}