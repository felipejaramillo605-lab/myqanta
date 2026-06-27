import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useTheme, type ThemeSettings } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Palette, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/theme")({
  head: () => ({ meta: [{ title: "Qanta — Theme Studio" }] }),
  component: AdminTheme,
});

// Helper: parse 'oklch(L C H)' or 'oklch(L C H / A)' to hex-ish preview color via CSS.
function swatchStyle(value: string): React.CSSProperties {
  return { backgroundColor: value };
}

type FormState = Pick<
  ThemeSettings,
  | "primary_color"
  | "secondary_color"
  | "accent_color"
  | "background_dark"
  | "background_light"
  | "foreground_dark"
  | "foreground_light"
  | "destructive_color"
  | "positive_color"
  | "font_sans"
  | "font_mono"
  | "radius_rem"
  | "default_mode"
> & { id?: string };

function AdminTheme() {
  const { t } = useI18n();
  const { isAdmin, loading } = useAuth();
  const { settings, refresh } = useTheme();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && !form) setForm({ ...settings });
  }, [settings, form]);

  if (loading) return <div className="font-mono text-sm text-muted-foreground">{t("common.loading")}</div>;

  if (!isAdmin) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="glass max-w-md rounded-3xl p-10 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/15 text-destructive">
            <Lock className="size-7" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">{t("admin.forbidden")}</h1>
        </div>
      </div>
    );
  }

  if (!form) return <div className="font-mono text-sm text-muted-foreground">{t("common.loading")}</div>;

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const onSave = async () => {
    if (!form?.id) return;
    setSaving(true);
    const { id, ...rest } = form;
    const { error } = await supabase
      .from("theme_settings")
      .update(rest)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(t("admin.error") + ": " + error.message);
      return;
    }
    toast.success(t("admin.saved"));
    await qc.invalidateQueries({ queryKey: ["theme-settings"] });
    refresh();
  };

  const colorFields: { key: keyof FormState; label: string }[] = [
    { key: "primary_color", label: t("admin.primary") },
    { key: "accent_color", label: t("admin.accent") },
    { key: "positive_color", label: t("admin.positive") },
    { key: "destructive_color", label: t("admin.destructive") },
    { key: "background_dark", label: t("admin.bg_dark") },
    { key: "background_light", label: t("admin.bg_light") },
    { key: "foreground_dark", label: t("admin.fg_dark") },
    { key: "foreground_light", label: t("admin.fg_light") },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Palette className="size-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">{t("admin.title")}</h1>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("admin.sub")}</p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          <Save className="size-4" />
          {t("admin.save")}
        </Button>
      </header>

      <section className="glass rounded-3xl p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Colors</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {colorFields.map((f) => (
            <div key={String(f.key)} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              <div className="flex items-center gap-2">
                <div
                  className="size-9 shrink-0 rounded-md border border-border/60"
                  style={swatchStyle(form[f.key] as string)}
                />
                <Input
                  value={form[f.key] as string}
                  onChange={(e) => update(f.key, e.target.value as never)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Typography & shape</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("admin.font_sans")}</Label>
            <Input value={form.font_sans} onChange={(e) => update("font_sans", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("admin.font_mono")}</Label>
            <Input value={form.font_mono} onChange={(e) => update("font_mono", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("admin.radius")}</Label>
            <Input
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={form.radius_rem}
              onChange={(e) => update("radius_rem", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("admin.default_mode")}</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.default_mode}
              onChange={(e) => update("default_mode", e.target.value)}
            >
              <option value="dark">{t("mode.dark")}</option>
              <option value="light">{t("mode.light")}</option>
            </select>
          </div>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <div className="ml-auto rounded-full bg-primary/15 px-3 py-1 font-mono text-xs text-primary">+12.4%</div>
          <div className="rounded-full bg-destructive/15 px-3 py-1 font-mono text-xs text-destructive">−3.1%</div>
        </div>
      </section>
    </div>
  );
}