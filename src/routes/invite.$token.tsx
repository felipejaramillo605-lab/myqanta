import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite } from "@/lib/org.functions";
import { completeEmployeeProfile } from "@/lib/team.functions";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoUpload } from "@/components/photo-upload";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  component: InvitePage,
});

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const [cedula, setCedula] = useState("");
  const [position, setPosition] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const lookup = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("lookup_invite", { _token: token });
      if (error) throw new Error(error.message);
      return data as {
        org_id: string;
        org_name: string;
        role: string;
        invited_email: string | null;
        expires_at: string;
        is_valid: boolean;
      } | null;
    },
  });

  const acceptM = useMutation({
    mutationFn: async () => {
      const res = await acceptInvite({ data: { token } });
      if (res.org_id) {
        await completeEmployeeProfile({
          data: {
            org_id: res.org_id,
            cedula: cedula.trim(),
            position: position.trim() || null,
            photo_url: photoUrl || null,
          },
        });
      }
      return res;
    },
    onSuccess: () => {
      setAccepted(true);
      toast.success(t("invite.accepted"));
      setTimeout(() => navigate({ to: "/dashboard" }), 800);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!loading && !user) {
      // Save the invite token to redirect back after auth
      sessionStorage.setItem("qanta.pending_invite", token);
    }
  }, [loading, user, token]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card/40 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-mono text-sm font-bold">Q</span>
          </div>
          <span className="font-mono text-lg">Qanta</span>
        </div>

        {lookup.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("common.loading")}
          </div>
        )}
        {lookup.error && (
          <p className="text-sm text-destructive">{(lookup.error as Error).message}</p>
        )}
        {lookup.data && !lookup.data.is_valid && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">{t("invite.invalid_title")}</h1>
            <p className="text-sm text-muted-foreground">{t("invite.invalid_desc")}</p>
            <Button asChild variant="outline"><Link to="/">{t("invite.go_home")}</Link></Button>
          </div>
        )}
        {lookup.data?.is_valid && (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">{t("invite.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("invite.subtitle")} <span className="font-medium text-foreground">{lookup.data.org_name}</span>{" "}
              ({t("invite.as_role")} <span className="font-mono uppercase">{lookup.data.role}</span>).
            </p>
            {!user && !loading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("invite.signin_required")}</p>
                <Button asChild className="w-full">
                  <Link to="/auth" search={{ next: `/invite/${token}` } as never}>{t("auth.signin")}</Link>
                </Button>
              </div>
            )}
            {user && !accepted && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Cédula</Label>
                    <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="1020304050" />
                  </div>
                  <div>
                    <Label className="text-xs">Cargo</Label>
                    <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Diseñador, Cajera…" />
                  </div>
                </div>
                <PhotoUpload value={photoUrl || null} onUploaded={setPhotoUrl} label="Foto (opcional)" />
                <Button
                  className="w-full"
                  onClick={() => acceptM.mutate()}
                  disabled={acceptM.isPending || cedula.trim().length < 4}
                >
                  {acceptM.isPending ? <Loader2 className="size-4 animate-spin" /> : t("invite.accept")}
                </Button>
              </div>
            )}
            {accepted && (
              <p className="text-sm text-positive">{t("invite.redirecting")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}