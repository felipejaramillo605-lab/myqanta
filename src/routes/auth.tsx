import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { logSecurityEvent } from "@/lib/security-log";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Qanta — Acceso" },
      { name: "description", content: "Inicia sesión o crea tu cuenta en Qanta." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email().max(255);
// Política estricta: solo para registro de cuentas nuevas.
const signupPasswordSchema = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres")
  .max(72, "La contraseña no puede superar 72 caracteres")
  .regex(/[a-z]/, "Debe incluir al menos una minúscula")
  .regex(/[A-Z]/, "Debe incluir al menos una mayúscula")
  .regex(/[0-9]/, "Debe incluir al menos un número")
  .regex(/[^a-zA-Z0-9]/, "Debe incluir al menos un símbolo (ej. !@#$%)");
// Permisiva: el login no debe re-exigir la política nueva a cuentas ya creadas.
const signinPasswordSchema = z.string().min(6).max(72);

function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (next) window.location.replace(next);
      else navigate({ to: "/dashboard" });
    }
  }, [loading, user, navigate, next]);

  const handleEmailAuth = async (mode: "signin" | "signup", form: FormData) => {
    setBusy(true);
    try {
      const email = emailSchema.parse(form.get("email"));
      const password = (mode === "signup" ? signupPasswordSchema : signinPasswordSchema).parse(
        form.get("password"),
      );
      if (mode === "signup") {
        const full_name = String(form.get("full_name") ?? "").trim().slice(0, 100);
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: next ? window.location.origin + next : window.location.origin,
            data: { full_name },
          },
        });
        if (error) {
          void logSecurityEvent({ event_type: "signup_failed", severity: "info", email, message: error.message });
          throw error;
        }
        toast.success(lang === "es" ? "Cuenta creada" : "Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          void logSecurityEvent({ event_type: "login_failed", severity: "warn", email, message: error.message });
          throw error;
        }
      }
    } catch (e) {
      const msg =
        e instanceof z.ZodError
          ? (e.issues[0]?.message ?? "Datos inválidos")
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const redirect = next
        ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
        : window.location.origin;
      const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirect });
      if (res.error) toast.error(res.error.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <span className="font-mono text-sm font-bold">Q</span>
            </div>
            <span className="font-mono text-lg">{t("app.name")}</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-xs"
            onClick={() => setLang(lang === "es" ? "en" : "es")}
          >
            {lang.toUpperCase()}
          </Button>
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.welcome")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.welcome_sub")}</p>

          <Button
            type="button"
            variant="secondary"
            className="mt-6 w-full glass-subtle font-medium"
            onClick={handleGoogle}
            disabled={busy}
          >
            <GoogleIcon /> {t("auth.google")}
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("auth.or")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t("auth.signin")}</TabsTrigger>
              <TabsTrigger value="signup">{t("auth.signup")}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEmailAuth("signin", new FormData(e.currentTarget));
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email-in">{t("auth.email")}</Label>
                  <Input id="email-in" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-in">{t("auth.password")}</Label>
                  <Input id="password-in" name="password" type="password" required autoComplete="current-password" minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : t("auth.signin")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEmailAuth("signup", new FormData(e.currentTarget));
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="name-up">{t("auth.fullname")}</Label>
                  <Input id="name-up" name="full_name" required maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-up">{t("auth.email")}</Label>
                  <Input id="email-up" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-up">{t("auth.password")}</Label>
                  <Input id="password-up" name="password" type="password" required autoComplete="new-password" minLength={10} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : t("auth.signup")}
                </Button>
                <p className="text-center text-[11px] leading-5 text-muted-foreground">
                  Al crear una cuenta aceptas nuestra{" "}
                  <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Política de Privacidad
                  </Link>
                  ,{" "}
                  <Link to="/ai-policy" className="underline underline-offset-2 hover:text-foreground">
                    Uso de IA
                  </Link>{" "}
                  y{" "}
                  <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
                    Términos y Condiciones
                  </Link>
                  .
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.8 2.4 2.6 6.6 2.6 12s4.2 9.6 9.4 9.6c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}