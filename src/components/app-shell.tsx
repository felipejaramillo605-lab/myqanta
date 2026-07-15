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
  Receipt,
  Contact2,
  UserCog,
  FolderOpen,
} from "lucide-react";
import { BarChart3, Building2, MoreHorizontal, CheckSquare, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationBell } from "@/components/notification-bell";
import { AssistantPanel } from "@/components/assistant-panel";
import { OrgSwitcher } from "@/components/org-switcher";
import { BusinessOnboardingDialog } from "@/components/business-onboarding-dialog";
import { useState } from "react";
import { Briefcase } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";

const NAV: { to: string; key: string; icon: typeof LayoutDashboard }[] = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/finance", key: "nav.finance", icon: Wallet },
  { to: "/inventory", key: "nav.inventory", icon: ShoppingCart },
  { to: "/sales", key: "nav.sales", icon: Receipt },
  { to: "/crm", key: "nav.crm", icon: Contact2 },
  { to: "/projects", key: "nav.projects", icon: Briefcase },
  { to: "/hr", key: "nav.hr", icon: UserCog },
  { to: "/approvals", key: "nav.approvals", icon: CheckSquare },
  { to: "/documents", key: "nav.documents", icon: FolderOpen },
  { to: "/reports", key: "nav.reports", icon: BarChart3 },
  { to: "/habits", key: "nav.productivity", icon: Repeat },
  { to: "/agenda", key: "nav.agenda", icon: Calendar },
  { to: "/reminders", key: "nav.reminders", icon: MessageCircle },
  { to: "/team", key: "nav.team", icon: Users },
];

// Fase 0: bottom nav móvil = 5 accesos rápidos + botón "Más" con Sheet.
const MOBILE_PRIMARY = ["/dashboard", "/sales", "/inventory", "/hr", "/agenda"] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { user, isAdmin, isPlatformOwner } = useAuth();
  const { mode, toggleMode } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const initials = (user?.user_metadata?.full_name as string | undefined)?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?";

  // Admin Manager (owner) keeps full access to all modules plus the admin dashboard.
  const navItems = NAV;
  const primary = NAV.filter((n) => (MOBILE_PRIMARY as readonly string[]).includes(n.to));
  const secondary = NAV.filter((n) => !(MOBILE_PRIMARY as readonly string[]).includes(n.to));

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
          <Link
            to={"/settings/company" as never}
            className={
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
              (path.startsWith("/settings/company")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
            }
          >
            <Building2 className="size-4" />
            {t("nav.company")}
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
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 items-center gap-1 border-t border-border/50 bg-background/85 px-2 py-2 backdrop-blur-xl lg:hidden"
          aria-label="Navegación móvil"
        >
          {primary.map((item) => {
            const Icon = item.icon;
            const active = path === item.to || path.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={
                  "flex flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[10px] leading-none " +
                  (active ? "text-primary" : "text-muted-foreground")
                }
              >
                <Icon className="size-5" />
                <span className="truncate max-w-full">{t(item.key as never)}</span>
              </Link>
            );
          })}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Más módulos"
                className={
                  "flex flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[10px] leading-none " +
                  (secondary.some((s) => path === s.to || path.startsWith(s.to + "/"))
                    ? "text-primary"
                    : "text-muted-foreground")
                }
              >
                <MoreHorizontal className="size-5" />
                <span>Más</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] rounded-t-3xl">
              <SheetHeader className="flex-row items-center justify-between">
                <SheetTitle>Módulos</SheetTitle>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Cerrar">
                    <X className="size-4" />
                  </Button>
                </SheetClose>
              </SheetHeader>
              <div className="mt-2 grid grid-cols-2 gap-2 pb-6">
                {secondary.map((item) => {
                  const Icon = item.icon;
                  const active = path === item.to || path.startsWith(item.to + "/");
                  return (
                    <Link
                      key={item.to}
                      to={item.to as never}
                      onClick={() => setMoreOpen(false)}
                      className={
                        "flex items-center gap-3 rounded-xl border border-border/50 px-3 py-3 text-sm " +
                        (active ? "bg-primary/10 text-primary" : "bg-background/60 text-foreground")
                      }
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="truncate">{t(item.key as never)}</span>
                    </Link>
                  );
                })}
                <Link
                  to={"/settings/company" as never}
                  onClick={() => setMoreOpen(false)}
                  className={
                    "flex items-center gap-3 rounded-xl border border-border/50 px-3 py-3 text-sm " +
                    (path.startsWith("/settings/company") ? "bg-primary/10 text-primary" : "bg-background/60 text-foreground")
                  }
                >
                  <Building2 className="size-5 shrink-0" />
                  <span className="truncate">{t("nav.company")}</span>
                </Link>
                <Link
                  to={"/settings/team" as never}
                  onClick={() => setMoreOpen(false)}
                  className={
                    "flex items-center gap-3 rounded-xl border border-border/50 px-3 py-3 text-sm " +
                    (path.startsWith("/settings/team") ? "bg-primary/10 text-primary" : "bg-background/60 text-foreground")
                  }
                >
                  <Users className="size-5 shrink-0" />
                  <span className="truncate">Equipo</span>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
        <div className="h-16 lg:hidden" />
      </main>
      <BusinessOnboardingDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <BusinessOnboardingDialog autoOpenIfMissing />
    </div>
  );
}