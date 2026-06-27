import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeSettings = {
  id: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_dark: string;
  background_light: string;
  foreground_dark: string;
  foreground_light: string;
  destructive_color: string;
  positive_color: string;
  font_sans: string;
  font_mono: string;
  radius_rem: number;
  default_mode: string;
};

type Mode = "dark" | "light";

const ThemeCtx = createContext<{
  mode: Mode;
  toggleMode: () => void;
  settings: ThemeSettings | null;
  refresh: () => void;
}>({ mode: "dark", toggleMode: () => {}, settings: null, refresh: () => {} });

async function fetchTheme(): Promise<ThemeSettings | null> {
  const { data, error } = await supabase
    .from("theme_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[theme] fetch failed", error);
    return null;
  }
  return data as unknown as ThemeSettings | null;
}

function applyThemeVars(s: ThemeSettings, mode: Mode) {
  const root = document.documentElement;
  const bg = mode === "dark" ? s.background_dark : s.background_light;
  const fg = mode === "dark" ? s.foreground_light : s.foreground_dark;
  root.style.setProperty("--primary", s.primary_color);
  root.style.setProperty("--accent", s.accent_color);
  root.style.setProperty("--secondary", s.secondary_color);
  root.style.setProperty("--destructive", s.destructive_color);
  root.style.setProperty("--positive", s.positive_color);
  root.style.setProperty("--background", bg);
  root.style.setProperty("--foreground", fg);
  root.style.setProperty("--ring", `color-mix(in oklab, ${s.primary_color} 50%, transparent)`);
  root.style.setProperty("--radius", `${s.radius_rem}rem`);
  root.style.setProperty("--font-sans", s.font_sans);
  root.style.setProperty("--font-mono", s.font_mono);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("dark");

  const { data, refetch } = useQuery({
    queryKey: ["theme-settings"],
    queryFn: fetchTheme,
    staleTime: 60_000,
  });

  // initial mode from localStorage
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("qanta.mode") as Mode | null) : null;
    if (saved === "dark" || saved === "light") setMode(saved);
  }, []);

  // apply class + tokens
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    if (typeof window !== "undefined") localStorage.setItem("qanta.mode", mode);
    if (data) applyThemeVars(data, mode);
  }, [mode, data]);

  const toggleMode = () => setMode((m) => (m === "dark" ? "light" : "dark"));

  return (
    <ThemeCtx.Provider value={{ mode, toggleMode, settings: data ?? null, refresh: () => refetch() }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);