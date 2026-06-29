import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { getBusinessContext, updateBusinessContext } from "@/lib/business-context.functions";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, opens automatically the first time if org has no business context. */
  autoOpenIfMissing?: boolean;
};

export function BusinessOnboardingDialog({ open: controlledOpen, onOpenChange, autoOpenIfMissing }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const getFn = useServerFn(getBusinessContext);
  const updateFn = useServerFn(updateBusinessContext);

  const { data } = useQuery({
    queryKey: ["business-context"],
    queryFn: () => getFn({ data: undefined as never }),
    staleTime: 60_000,
  });

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setInternalOpen(o);
  };

  const [form, setForm] = useState({
    industry: "",
    business_type: "personal",
    description: "",
    goals: "",
    team_size: "1",
    currency: "USD",
  });

  useEffect(() => {
    if (data) {
      setForm({
        industry: data.industry ?? "",
        business_type: data.business_type ?? "personal",
        description: data.description ?? "",
        goals: data.goals ?? "",
        team_size: data.team_size ?? "1",
        currency: data.currency ?? "USD",
      });
      if (autoOpenIfMissing && !data.onboarded_at && controlledOpen === undefined) {
        setInternalOpen(true);
      }
    }
  }, [data, autoOpenIfMissing, controlledOpen]);

  const mut = useMutation({
    mutationFn: () => updateFn({ data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["business-context"] });
      toast.success(t("onboarding.saved"));
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t("onboarding.title")}
          </DialogTitle>
          <DialogDescription>{t("onboarding.subtitle")}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="industry">{t("onboarding.industry")}</Label>
            <Input
              id="industry"
              required
              placeholder={t("onboarding.industry.ph")}
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t("onboarding.industry.hint")}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="btype">{t("onboarding.type")}</Label>
              <select
                id="btype"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={form.business_type}
                onChange={(e) => setForm({ ...form, business_type: e.target.value })}
              >
                <option value="personal">{t("onboarding.type.personal")}</option>
                <option value="freelancer">{t("onboarding.type.freelancer")}</option>
                <option value="b2c">{t("onboarding.type.b2c")}</option>
                <option value="b2b">{t("onboarding.type.b2b")}</option>
                <option value="saas">SaaS</option>
                <option value="retail">{t("onboarding.type.retail")}</option>
                <option value="services">{t("onboarding.type.services")}</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="team">{t("onboarding.team")}</Label>
              <Input
                id="team"
                placeholder="1, 2-10, 11-50…"
                value={form.team_size}
                onChange={(e) => setForm({ ...form, team_size: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="currency">{t("onboarding.currency")}</Label>
            <Input
              id="currency"
              maxLength={8}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="desc">{t("onboarding.description")}</Label>
            <Textarea
              id="desc"
              rows={2}
              placeholder={t("onboarding.description.ph")}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="goals">{t("onboarding.goals")}</Label>
            <Textarea
              id="goals"
              rows={2}
              placeholder={t("onboarding.goals.ph")}
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
            />
          </div>

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={mut.isPending || !form.industry.trim()}>
              {mut.isPending ? t("onboarding.saving") : t("onboarding.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}