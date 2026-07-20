import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listMembers,
  listInvites,
  listMyOrgs,
  createInvite,
  revokeInvite,
  updateMemberRole,
  removeMember,
  createOrganization,
  renameOrganization,
  setActiveOrg,
} from "@/lib/org.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2, RefreshCw, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamPage,
});

const ROLES = ["owner", "admin", "member", "viewer"] as const;

function TeamPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => listMyOrgs() });
  const membersQ = useQuery({ queryKey: ["org-members"], queryFn: () => listMembers() });
  const activeOrg = orgsQ.data?.orgs.find((o) => o.id === orgsQ.data?.activeOrgId);
  const myRole = activeOrg?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const invitesQ = useQuery({
    queryKey: ["org-invites", activeOrg?.id],
    queryFn: () => listInvites(),
    enabled: !!activeOrg && canManage,
  });

  const [newOrgName, setNewOrgName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("member");

  const createOrgM = useMutation({
    mutationFn: (name: string) => createOrganization({ data: { name } }),
    onSuccess: () => {
      setNewOrgName("");
      toast.success(t("team.org_created"));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActiveM = useMutation({
    mutationFn: (id: string) => setActiveOrg({ data: { org_id: id } }),
    onSuccess: () => {
      toast.success(t("team.switched"));
      qc.invalidateQueries();
    },
  });

  const renameM = useMutation({
    mutationFn: (name: string) =>
      renameOrganization({ data: { org_id: activeOrg!.id, name } }),
    onSuccess: () => {
      toast.success(t("team.renamed"));
      setRenameValue("");
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
  });

  const createInviteM = useMutation({
    mutationFn: () =>
      createInvite({
        data: {
          email: inviteEmail || null,
          role: inviteRole,
          ttl_days: 14,
          origin: typeof window !== "undefined" ? window.location.origin : null,
        },
      }),
    onSuccess: (row) => {
      setInviteEmail("");
      const link = `${window.location.origin}/invite/${row.token}`;
      navigator.clipboard?.writeText(link).catch(() => {});
      toast.success(t("team.invite_copied"));
      qc.invalidateQueries({ queryKey: ["org-invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeM = useMutation({
    mutationFn: (id: string) => revokeInvite({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-invites"] }),
  });

  const updateRoleM = useMutation({
    mutationFn: (v: { user_id: string; role: (typeof ROLES)[number] }) =>
      updateMemberRole({ data: v }),
    onSuccess: () => {
      toast.success(t("team.role_updated"));
      qc.invalidateQueries({ queryKey: ["org-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (user_id: string) => removeMember({ data: { user_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard?.writeText(link).then(() => toast.success(t("team.invite_copied")));
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-2xl tracking-tight">{t("team.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("team.sub")}</p>
      </header>

      {/* Organizations */}
      <section className="rounded-2xl border border-border/50 bg-card/40 p-5 backdrop-blur-xl">
        <h2 className="mb-3 font-medium">{t("team.orgs")}</h2>
        <div className="space-y-2">
          {orgsQ.data?.orgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid size-8 place-items-center rounded-md bg-primary/20 font-mono text-xs">
                  {org.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{org.name}</div>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">{org.role}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {org.id === orgsQ.data?.activeOrgId ? (
                  <Badge variant="secondary" className="font-mono text-[10px]">{t("team.active")}</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setActiveM.mutate(org.id)}>
                    {t("team.switch_to")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <Input
            placeholder={t("team.new_org_name")}
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
          />
          <Button onClick={() => newOrgName && createOrgM.mutate(newOrgName)} disabled={createOrgM.isPending}>
            <Plus className="size-4" /> {t("team.create_org")}
          </Button>
        </div>

        {canManage && activeOrg && (
          <div className="mt-4 flex gap-2">
            <Input
              placeholder={activeOrg.name}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
            <Button variant="secondary" onClick={() => renameValue && renameM.mutate(renameValue)} disabled={renameM.isPending}>
              {t("team.rename")}
            </Button>
          </div>
        )}
      </section>

      {/* Members */}
      <section className="rounded-2xl border border-border/50 bg-card/40 p-5 backdrop-blur-xl">
        <h2 className="mb-3 font-medium">{t("team.members")}</h2>
        <div className="space-y-2">
          {membersQ.data?.members.map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/40 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {m.full_name ?? m.user_id.slice(0, 8)}
                  {m.is_me && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{t("team.you")}</span>}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canManage && !m.is_me ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => updateRoleM.mutate({ user_id: m.user_id, role: v as (typeof ROLES)[number] })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} disabled={r === "owner" && myRole !== "owner"}>
                          {t(`team.role.${r}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {m.role}
                  </Badge>
                )}
                {canManage && !m.is_me && m.role !== "owner" && (
                  <Button size="icon" variant="ghost" onClick={() => removeM.mutate(m.user_id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Invitations */}
      {canManage && (
        <section className="rounded-2xl border border-border/50 bg-card/40 p-5 backdrop-blur-xl">
          <h2 className="mb-3 font-medium">{t("team.invites")}</h2>

          <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
            <div>
              <Label className="text-xs">{t("team.invite_email_optional")}</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div>
              <Label className="text-xs">{t("team.invite_role")}</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as (typeof ROLES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r !== "owner").map((r) => (
                    <SelectItem key={r} value={r}>{t(`team.role.${r}` as never)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => createInviteM.mutate()} disabled={createInviteM.isPending} className="w-full">
                <Plus className="size-4" /> {t("team.create_invite")}
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {invitesQ.data?.invites.length === 0 && (
              <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-sm text-muted-foreground">
                {t("team.no_invites")}
              </div>
            )}
            {invitesQ.data?.invites.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const status = inv.accepted_at
                ? t("team.invite.accepted")
                : inv.revoked_at
                ? t("team.invite.revoked")
                : expired
                ? t("team.invite.expired")
                : t("team.invite.pending");
              return (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {inv.invited_email ?? t("team.invite.shareable")}
                      <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">{inv.role}</span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {status} · {t("team.expires")} {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!inv.accepted_at && !inv.revoked_at && !expired && (
                      <Button size="sm" variant="ghost" onClick={() => copyLink(inv.token)}>
                        <Copy className="size-3" /> {t("team.copy_link")}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => revokeM.mutate(inv.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-3" />
            {t("team.invite_hint")}
          </div>
        </section>
      )}
    </div>
  );
}