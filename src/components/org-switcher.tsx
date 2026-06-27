import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { toast } from "sonner";
import { listMyOrgs, setActiveOrg } from "@/lib/org.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function OrgSwitcher() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-orgs"], queryFn: () => listMyOrgs() });
  const active = data?.orgs.find((o) => o.id === data?.activeOrgId);

  const switchM = useMutation({
    mutationFn: (id: string) => setActiveOrg({ data: { org_id: id } }),
    onSuccess: () => {
      toast.success(t("team.switched"));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between font-mono text-xs">
          <span className="truncate">{active?.name ?? t("team.select_org")}</span>
          <ChevronsUpDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-72 overflow-y-auto">
          {data?.orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => org.id !== data.activeOrgId && switchM.mutate(org.id)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="truncate">{org.name}</div>
                <div className="font-mono text-[10px] uppercase text-muted-foreground">{org.role}</div>
              </div>
              {org.id === data.activeOrgId && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
        <div className="mt-1 border-t border-border/50 pt-1">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <Link to="/settings/team">
              <Users className="size-4" /> {t("team.manage")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}