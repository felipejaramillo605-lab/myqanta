import { useRef, useState } from "react";
import { Camera, ImageUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "employee-photos";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function PhotoUpload({
  value,
  onUploaded,
  label = "Foto",
}: {
  value?: string | null;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen");
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw new Error(error.message);
      const { data, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, ONE_YEAR);
      if (signErr || !data?.signedUrl) throw new Error(signErr?.message ?? "No se pudo generar la URL");
      setPreview(data.signedUrl);
      onUploaded(data.signedUrl);
      toast.success("Foto subida");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files?.[0]);
        }}
        className={
          "flex flex-col items-center gap-3 rounded-xl border border-dashed p-4 text-center transition-colors " +
          (dragging ? "border-primary bg-primary/5" : "border-border/60 bg-background/40")
        }
      >
        {preview ? (
          <img src={preview} alt="Foto del empleado" className="size-20 rounded-full object-cover" />
        ) : (
          <div className="grid size-20 place-items-center rounded-full bg-muted text-muted-foreground">
            <ImageUp className="size-7" />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Arrastra una imagen aquí, elige un archivo o toma una foto.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Archivo
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => camRef.current?.click()}>
            <Camera className="size-4" /> Cámara
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}