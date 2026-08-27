import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyEmployeeRecord, updateMyPhoto } from "@/lib/team.functions";
import { PhotoUpload } from "@/components/photo-upload";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductTour } from "@/components/product-tour";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({
    meta: [
      { title: "Qanta — Mi perfil" },
      { name: "description", content: "Actualiza tu foto de perfil y consulta tus datos de cuenta en Qanta." },
      { property: "og:title", content: "Qanta — Mi perfil" },
      { property: "og:description", content: "Actualiza tu foto de perfil y consulta tus datos de cuenta en Qanta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <div className="rounded-2xl border border-border/50 p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tourOpen, setTourOpen] = useState(false);
  const fetchMe = useServerFn(getMyEmployeeRecord);
  const savePhoto = useServerFn(updateMyPhoto);
  const { data } = useQuery({ queryKey: ["my-employee-record"], queryFn: () => fetchMe() });

  const fullName = data?.full_name ?? (user?.user_metadata?.full_name as string | undefined) ?? "—";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">Tu foto se muestra en el equipo y en tu carné.</p>
      </div>

      <div className="space-y-5 rounded-2xl border border-border/50 bg-card/60 p-6 shadow-2xl shadow-black/30">
        <PhotoUpload
          value={data?.photo_url ?? null}
          label="Foto de perfil"
          onUploaded={async (url) => {
            try {
              await savePhoto({ data: { photo_url: url } });
              await qc.invalidateQueries({ queryKey: ["my-employee-record"] });
              toast.success("Foto actualizada");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Nombre</div>
            <div className="mt-1 text-sm">{fullName}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Correo</div>
            <div className="mt-1 truncate text-sm">{user?.email ?? "—"}</div>
          </div>
          {data?.position && (
            <div>
              <div className="text-xs text-muted-foreground">Cargo</div>
              <div className="mt-1 text-sm">{data.position}</div>
            </div>
          )}
          {data?.employee_id && (
            <div>
              <div className="text-xs text-muted-foreground">ID de empleado</div>
              <div className="mt-1 font-mono text-sm">{data.employee_id}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/60 p-5">
        <div>
          <div className="text-sm font-medium">Tour de la aplicación</div>
          <p className="text-xs text-muted-foreground">Recorre los módulos principales en 5 pantallas.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTourOpen(true)}>
          <Sparkles className="mr-1.5 size-3.5" /> Ver tour
        </Button>
      </div>
      {tourOpen && <ProductTour open={tourOpen} onOpenChange={setTourOpen} />}
    </div>
  );
}
