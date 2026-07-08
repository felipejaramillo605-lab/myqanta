import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Wallet,
  ShoppingCart,
  Repeat,
  Calendar,
  Settings,
  LogOut,
  Moon,
  Sun,
  Users,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationBell } from "@/components/notification-bell";
import { AssistantPanel } from "@/components/assistant-panel";
import { OrgSwitcher } from "@/components/org-switcher";
import { BusinessOnboardingDialog } from "@/components/business-onboarding-dialog";
import { useState } from "react";
import { Briefcase } from "lucide-react";

const NAV: { to: string; key: string; icon: typeof LayoutDashboard }[] = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/finance", key: "nav.finance", icon: Wallet },
  { to: "/inventory", key: "nav.inventory", icon: ShoppingCart },
  { to: "/habits", key: "nav.productivity", icon: Repeat },
  { to: "/agenda", key: "nav.agenda", icon: Calendar },
  { to: "/reminders", key: "nav.reminders", icon: MessageCircle },
  { to: "/team", key: "nav.team", icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { user, isAdmin, isPlatformOwner } = useAuth();
  const { mode, toggleMode } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [profileOpen, setProfileOpen] = useState(false);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const initials = (user?.user_metadata?.full_name as string | undefined)?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?";

  // Admin Manager (owner) keeps full access to all modules plus the admin dashboard.
  const navItems = NAV;

  return (
    <div className="min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/50 bg-sidebar/60 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-mono text-sm font-bold">Q</span>
          </div>
          <span className="font-mono text-lg tracking-tight">{t("app.name")}</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = path === item.to || path.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
                }
              >
                <Icon className="size-4" />
                {t(item.key as never)}
              </Link>
            );
          })}
          <Link
            to={"/settings/team" as never}
            className={
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
              (path.startsWith("/settings/team")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
            }
          >
            <Users className="size-4" />
            {t("nav.team")}
          </Link>
          {isAdmin && (
            <Link
              to="/admin/theme"
              className={
                "mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (path.startsWith("/admin")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
              }
            >
              <Settings className="size-4" />
              {t("nav.admin")}
            </Link>
          )}
          {isPlatformOwner && (
            <Link
              to={"/admin/platform" as never}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (path.startsWith("/admin/platform")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
              }
            >
              <ShieldCheck className="size-4" />
              Consola de plataforma
            </Link>
          )}
          {isPlatformOwner && (
            <Link
              to={"/admin/security-log" as never}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (path.startsWith("/admin/security-log")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
              }
            >
              <ShieldCheck className="size-4" />
              Bitácora de seguridad
            </Link>
          )}
          {isPlatformOwner && (
            <Link
              to={"/admin/security" as never}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (path === "/admin/security"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
              }
            >
              <ShieldCheck className="size-4" />
              Seguridad y tráfico
            </Link>
          )}
        </nav>

        <div className="border-t border-border/50 p-3">
          <div className="mb-2">
            <OrgSwitcher />
          </div>
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-medium uppercase">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.user_metadata?.full_name ?? user?.email}</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {isAdmin ? "ADMIN_MANAGER" : "USER"}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <Button variant="ghost" size="sm" className="flex-1 justify-start font-mono text-xs" onClick={() => setLang(lang === "es" ? "en" : "es")}>
              {lang.toUpperCase()}
            </Button>
            <NotificationBell />
            <AssistantPanel />
            <Button variant="ghost" size="icon" onClick={() => setProfileOpen(true)} aria-label={t("onboarding.open")} title={t("onboarding.open")}>
              <Briefcase className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleMode} aria-label="toggle mode">
              {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/50 bg-background/60 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <span className="font-mono text-xs font-bold">Q</span>
          </div>
          <span className="font-mono text-base">{t("app.name")}</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <AssistantPanel />
          {isPlatformOwner && (
            <>
              <Link
                to={"/admin/platform" as never}
                aria-label="Consola de plataforma"
                title="Consola de plataforma"
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              >
                <ShieldCheck className="size-4" />
              </Link>
              <Link
                to={"/admin/security-log" as never}
                aria-label="Bitácora de seguridad"
                title="Bitácora de seguridad"
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              >
                <Users className="size-4" />
              </Link>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={() => setProfileOpen(true)} aria-label={t("onboarding.open")}>
            <Briefcase className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleMode}>
            {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border/50 bg-background/80 px-2 py-2 backdrop-blur-xl lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = path === item.to || path.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={
                  "flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-[10px] " +
                  (active ? "text-primary" : "text-muted-foreground")
                }
              >
                <Icon className="size-5" />
                {t(item.key as never)}
              </Link>
            );
          })}
        </nav>
        <div className="h-16 lg:hidden" />
      </main>
      <BusinessOnboardingDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <BusinessOnboardingDialog autoOpenIfMissing />
    </div>
  );
}