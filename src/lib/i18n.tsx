import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

const dict = {
  es: {
    "app.name": "Qanta",
    "app.tagline": "ERP personal y empresarial.",
    "nav.dashboard": "Panel",
    "nav.finance": "Finanzas",
    "nav.inventory": "Compras",
    "nav.productivity": "Hábitos",
    "nav.agenda": "Agenda",
    "nav.admin": "Configuración",
    "nav.signout": "Cerrar sesión",
    "auth.signin": "Iniciar sesión",
    "auth.signup": "Crear cuenta",
    "auth.email": "Correo electrónico",
    "auth.password": "Contraseña",
    "auth.fullname": "Nombre completo",
    "auth.google": "Continuar con Google",
    "auth.or": "o",
    "auth.have_account": "¿Ya tienes cuenta?",
    "auth.no_account": "¿No tienes cuenta?",
    "auth.welcome": "Bienvenido a Qanta",
    "auth.welcome_sub": "Tu centro de mando financiero, productivo y operativo.",
    "dash.welcome": "Hola",
    "dash.kpi.revenue": "Ingresos del mes",
    "dash.kpi.costs": "Costos",
    "dash.kpi.ebitda": "EBITDA",
    "dash.kpi.net": "Utilidad neta",
    "dash.cashflow": "Flujo de efectivo",
    "dash.habits": "Hábitos de hoy",
    "dash.agenda": "Agenda",
    "dash.coming": "Módulo en construcción",
    "dash.phase": "Fase 1 · Fundamentos",
    "admin.title": "Estudio de tema",
    "admin.sub": "Edita las variables visuales globales. Los cambios se aplican a todos los usuarios.",
    "admin.primary": "Color primario",
    "admin.accent": "Acento",
    "admin.destructive": "Alerta / pérdida",
    "admin.positive": "Utilidad / positivo",
    "admin.bg_dark": "Fondo oscuro",
    "admin.bg_light": "Fondo claro",
    "admin.fg_dark": "Texto oscuro (modo claro)",
    "admin.fg_light": "Texto claro (modo oscuro)",
    "admin.font_sans": "Fuente principal",
    "admin.font_mono": "Fuente mono",
    "admin.radius": "Radio de bordes (rem)",
    "admin.default_mode": "Modo por defecto",
    "admin.save": "Guardar tema",
    "admin.saved": "Tema actualizado",
    "admin.error": "No se pudo guardar",
    "admin.forbidden": "Acceso restringido a Admin Manager.",
    "mode.dark": "Oscuro",
    "mode.light": "Claro",
    "common.loading": "Cargando…",
  },
  en: {
    "app.name": "Qanta",
    "app.tagline": "Personal and business ERP.",
    "nav.dashboard": "Dashboard",
    "nav.finance": "Finance",
    "nav.inventory": "Purchases",
    "nav.productivity": "Habits",
    "nav.agenda": "Agenda",
    "nav.admin": "Settings",
    "nav.signout": "Sign out",
    "auth.signin": "Sign in",
    "auth.signup": "Create account",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.fullname": "Full name",
    "auth.google": "Continue with Google",
    "auth.or": "or",
    "auth.have_account": "Already have an account?",
    "auth.no_account": "Don't have an account?",
    "auth.welcome": "Welcome to Qanta",
    "auth.welcome_sub": "Your financial, productivity and operations command center.",
    "dash.welcome": "Hi",
    "dash.kpi.revenue": "Revenue (month)",
    "dash.kpi.costs": "Costs",
    "dash.kpi.ebitda": "EBITDA",
    "dash.kpi.net": "Net income",
    "dash.cashflow": "Cash flow",
    "dash.habits": "Today's habits",
    "dash.agenda": "Agenda",
    "dash.coming": "Module coming soon",
    "dash.phase": "Phase 1 · Foundations",
    "admin.title": "Theme studio",
    "admin.sub": "Edit the global visual variables. Changes apply to every user.",
    "admin.primary": "Primary color",
    "admin.accent": "Accent",
    "admin.destructive": "Alert / loss",
    "admin.positive": "Profit / positive",
    "admin.bg_dark": "Dark background",
    "admin.bg_light": "Light background",
    "admin.fg_dark": "Dark text (light mode)",
    "admin.fg_light": "Light text (dark mode)",
    "admin.font_sans": "Sans font",
    "admin.font_mono": "Mono font",
    "admin.radius": "Border radius (rem)",
    "admin.default_mode": "Default mode",
    "admin.save": "Save theme",
    "admin.saved": "Theme updated",
    "admin.error": "Could not save",
    "admin.forbidden": "Restricted to Admin Manager role.",
    "mode.dark": "Dark",
    "mode.light": "Light",
    "common.loading": "Loading…",
  },
} as const;

type Key = keyof typeof dict.es;

const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "es",
  setLang: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");
  useEffect(() => {
    const saved = (typeof window !== "undefined" && (localStorage.getItem("qanta.lang") as Lang)) || null;
    if (saved === "es" || saved === "en") setLangState(saved);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("qanta.lang", l);
  };
  const t = (k: Key) => dict[lang][k] ?? dict.es[k] ?? k;
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);