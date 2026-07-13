import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import { getBusinessContext, updateCompanySettings, type BusinessContext } from "@/lib/business-context.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const qKey = ["business-context"] as const;

export const Route = createFileRoute("/_authenticated/settings/company")({
  head: () => ({ meta: [
    { title: "Qanta — Configuración de empresa" },
    { name: "description", content: "Datos fiscales, logo y series de facturación de tu organización." },
  ] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: qKey, queryFn: () => getBusinessContext() });
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: CompanySettingsPage,
});

function CompanySettingsPage() {
  const { data } = useSuspenseQuery<BusinessContext>({ queryKey: qKey, queryFn: () => getBusinessContext() });
  const qc = useQueryClient();
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

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración de empresa</h1>
        <p className="text-sm text-muted-foreground">Estos datos aparecerán en tus facturas y comunicaciones.</p>
      </header>

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