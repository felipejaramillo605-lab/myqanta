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
import { BarChart3, Building2, MoreHorizontal, CheckSquare, BookOpen, Landmark, Banknote, Percent, GitMerge, Scale, Cog, ChevronDown } from "lucide-react";
import { KeyRound } from "lucide-react";
import { HelpCircle } from "lucide-react";
import { Sparkles } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyModuleAccess } from "@/lib/custom-roles.functions";
import { getOrgViewPreferences } from "@/lib/custom-roles.functions";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { AppGuideDialog } from "@/components/app-guide-dialog";
import { ProductTour } from "@/components/product-tour";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";

import { AssistantPanel } from "@/components/assistant-panel";
import { OrgSwitcher } from "@/components/org-switcher";
import { BusinessOnboardingDialog } from "@/components/business-onboarding-dialog";
import { useState } from "react";
import { Briefcase } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserRound } from "lucide-react";
import { Link2 } from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; group?: string };
type NavCategory = { key: string; label: string; icon: typeof LayoutDashboard; items: NavItem[]; placeholder?: string };

// Items sueltos (sin categoría).
const STANDALONE: NavItem[] = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { to: "/crm", label: "CRM", icon: Contact2 },
  { to: "/projects", label: "Proyectos", icon: Briefcase },
  { to: "/approvals", label: "Aprobaciones", icon: CheckSquare },
];

const CATEGORIES: NavCategory[] = [
  {
    key: "finance", label: "Finanzas", icon: Wallet, items: [
      { to: "/finance", label: "Resumen", icon: Wallet, group: "Contabilidad" },
      { to: "/finance/journal", label: "Asientos contables", icon: BookOpen, group: "Contabilidad" },
      { to: "/finance/banks", label: "Bancos", icon: Landmark, group: "Contabilidad" },
      { to: "/finance/taxes", label: "Impuestos", icon: Percent, group: "Contabilidad" },
      { to: "/finance/reconciliation", label: "Conciliación", icon: GitMerge, group: "Contabilidad" },
      { to: "/finance/balances", label: "Balances", icon: Scale, group: "Contabilidad" },
      { to: "/finance/policies", label: "Políticas contables", icon: FolderOpen, group: "Contabilidad" },
      { to: "/finance/parties", label: "Matriz de terceros", icon: Contact2, group: "Contabilidad" },
      { to: "/inventory", label: "Compras", icon: ShoppingCart, group: "Compras" },
      { to: "/sales", label: "Ventas", icon: Receipt, group: "Ventas" },
      { to: "/reports", label: "Reportes", icon: BarChart3, group: "Reportes" },
    ],
  },
  {
    key: "hr", label: "RRHH", icon: UserCog, items: [
      { to: "/hr", label: "Personal / Ausencias / Nómina", icon: UserCog },
      { to: "/hr/org-chart", label: "Organigrama", icon: GitMerge },
      { to: "/hr/attendance", label: "Asistencia", icon: CheckSquare },
      { to: "/agenda", label: "Agenda", icon: Calendar },
      { to: "/documents", label: "Documentos", icon: FolderOpen },
      { to: "/team", label: "Equipo", icon: Users },
    ],
  },
  { key: "legal", label: "Legal", icon: Scale, items: [], placeholder: "Próximamente" },
  { key: "ops", label: "Operaciones", icon: Cog, items: [], placeholder: "Próximamente" },
];

// Bottom nav móvil = 5 accesos rápidos + "Más".
const MOBILE_PRIMARY = ["/dashboard", "/sales", "/inventory", "/hr", "/agenda"] as const;

function isActive(path: string, to: string): boolean {
  return path === to || path.startsWith(to + "/");
}

/** Agrupa los items de una categoría por sub-encabezado visual, conservando el orden. */
function groupItems(items: NavItem[]): Array<{ group?: string; items: NavItem[] }> {
  const out: Array<{ group?: string; items: NavItem[] }> = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { user, isAdmin, isPlatformOwner } = useAuth();
  const { mode, toggleMode } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const fetchAccess = useServerFn(getMyModuleAccess);
  const accessQuery = useQuery({
    queryKey: ["my-module-access"],
    queryFn: () => fetchAccess(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const access = accessQuery.data;
  const fetchPrefs = useServerFn(getOrgViewPreferences);
  const prefsQuery = useQuery({
    queryKey: ["org-view-preferences"],
    queryFn: () => fetchPrefs(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const hiddenSet = new Set(prefsQuery.data?.hidden_modules ?? []);
  const canSeeModule = (key: string): boolean => {
    if (hiddenSet.has(key)) return false;
    if (!access) return true; // while loading, don't hide
    if (access.unrestricted) return true;
    return (access.allowed_modules ?? []).includes(key);
  };
  const MODULE_KEY_SET = new Set([
    "/finance","/finance/journal","/finance/policies","/finance/parties","/finance/banks","/finance/taxes","/finance/reconciliation","/finance/balances",
    "/inventory","/sales","/hr","/hr/org-chart","/hr/attendance","/agenda","/documents","/team",
    "/crm","/projects","/approvals","/reports",
  ]);
  const filterItems = (items: NavItem[]) => items.filter((i) => !MODULE_KEY_SET.has(i.to) || canSeeModule(i.to));
  const filteredStandalone = filterItems(STANDALONE);
  const filteredCategories = CATEGORIES
    .map((c) => ({ ...c, items: filterItems(c.items) }))
    .filter((c) => c.items.length > 0 || c.placeholder);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const initials = (user?.user_metadata?.full_name as string | undefined)?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?";

  // Flat list for mobile Sheet + bottom nav.
  const allItems: NavItem[] = [
    ...filteredStandalone,
    ...filteredCategories.flatMap((c) => c.items),
  ];
  const primary = allItems.filter((n) => (MOBILE_PRIMARY as readonly string[]).includes(n.to));
  const secondary = allItems.filter((n) => !(MOBILE_PRIMARY as readonly string[]).includes(n.to));

  const isPrimary = (to: string) => (MOBILE_PRIMARY as readonly string[]).includes(to);
  // Secciones tipo "Ajustes de iOS": encabezado tipográfico + lista, sin marco por grupo.
  const moduleSections: Array<{ title: string; items: NavItem[] }> = [
    { title: "General", items: filteredStandalone.filter((i) => !isPrimary(i.to)) },
    ...filteredCategories.flatMap((cat) =>
      groupItems(cat.items.filter((i) => !isPrimary(i.to))).map(({ group, items }) => ({
        title: group ? `${cat.label} · ${group}` : cat.label,
        items,
      })),
    ),
  ].filter((s) => s.items.length > 0);

  const tapRow = "transition-transform active:scale-[0.98]";

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Cuenta"
          className={
            "grid size-9 place-items-center rounded-full bg-secondary text-sm font-medium uppercase " + tapRow
          }
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate">
          {user?.user_metadata?.full_name ?? user?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={"/settings/profile" as never}>
            <UserRound className="size-4" /> Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={"/team" as never}>
            <Users className="size-4" /> Equipo
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
          <Briefcase className="size-4" /> {t("onboarding.open")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setGuideOpen(true)}>
          <HelpCircle className="size-4" /> Guía de uso
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTourOpen(true)}>
          <Sparkles className="size-4" /> Ver tour de la app
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggleMode()}>
          {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />} Tema
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLang(lang === "es" ? "en" : "es")}>
          <span className="font-mono text-xs">{lang.toUpperCase()}</span> Idioma
        </DropdownMenuItem>
        {isPlatformOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={"/admin/security" as never}>
                <ShieldCheck className="size-4" /> Seguridad y tráfico
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={"/admin/platform" as never}>
                <ShieldCheck className="size-4" /> Consola de plataforma
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()}>
          <LogOut className="size-4" /> Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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

        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {filteredStandalone.map((item) => {
            const Icon = item.icon;
            const active = isActive(path, item.to);
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
                {item.label}
              </Link>
            );
          })}

          {filteredCategories.map((cat) => {
            const CatIcon = cat.icon;
            const hasActive = cat.items.some((i) => isActive(path, i.to));
            return (
              <Collapsible key={cat.key} defaultOpen={hasActive}>
                <CollapsibleTrigger className={
                  "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                  (hasActive ? "text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
                }>
                  <CatIcon className="size-4" />
                  <span className="flex-1 text-left">{cat.label}</span>
                  <ChevronDown className="size-3 transition-transform data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 mt-1">
                  {cat.placeholder && !cat.items.length && (
                    <div className="ml-7 rounded-md px-3 py-1.5 text-xs text-muted-foreground">
                      {cat.placeholder}
                    </div>
                  )}
                  {groupItems(cat.items).map(({ group, items }) => (
                    <div key={group ?? "_"} className="space-y-1">
                      {group && (
                        <div className="ml-4 px-3 pt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
                          {group}
                        </div>
                      )}
                      {items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(path, item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to as never}
                            className={
                              "ml-4 flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors " +
                              (active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
                            }
                          >
                            <Icon className="size-3.5" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}

          {isAdmin && (
            <Link
              to={"/settings/roles" as never}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (path.startsWith("/settings/roles")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
              }
            >
              <KeyRound className="size-4" />
              Roles y permisos
            </Link>
          )}
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
              to={"/settings/integrations" as never}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (path.startsWith("/settings/integrations")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
              }
            >
              <Link2 className="size-4" />
              Integraciones
            </Link>
          )}
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
          <div className="flex items-center gap-2 rounded-xl bg-card/50 px-2 py-2">
            {accountMenu}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.user_metadata?.full_name ?? user?.email}</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {isAdmin ? "ADMIN_MANAGER" : "USER"}
              </div>
            </div>
            <GlobalSearch />
            <NotificationBell />

            <AssistantPanel />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/50 bg-background/70 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <span className="font-mono text-xs font-bold">Q</span>
          </div>
          <span className="font-mono text-base">{t("app.name")}</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <NotificationBell />
          <AssistantPanel />
          {accountMenu}
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
                <span className="truncate max-w-full">{item.label}</span>
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
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <SheetHeader>
                <SheetTitle>Módulos</SheetTitle>
              </SheetHeader>
              <div className="mt-2 space-y-6 pb-8">
                {[
                  ...moduleSections,
                  {
                    title: "Configuración",
                    items: [
                      { to: "/settings/company", label: t("nav.company"), icon: Building2 },
                      { to: "/settings/profile", label: "Mi perfil", icon: UserRound },
                      ...(isAdmin ? [{ to: "/settings/roles", label: "Roles y permisos", icon: KeyRound }] : []),
                      ...(isAdmin ? [{ to: "/settings/integrations", label: "Integraciones", icon: Link2 }] : []),
                    ] as NavItem[],
                  },
                ].map((section) => (
                  <div key={section.title}>
                    <div className="px-1 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {section.title}
                    </div>
                    <div className="overflow-hidden rounded-2xl bg-background/60">
                      {section.items.map((item, idx) => {
                        const Icon = item.icon;
                        const active = path === item.to || path.startsWith(item.to + "/");
                        return (
                          <Link
                            key={item.to}
                            to={item.to as never}
                            onClick={() => setMoreOpen(false)}
                            className={
                              "flex items-center gap-3 px-4 py-3 text-sm " + tapRow + " " +
                              (idx > 0 ? "border-t border-border/40 " : "") +
                              (active ? "text-primary" : "text-foreground")
                            }
                          >
                            <Icon className={"size-4 shrink-0 " + (active ? "text-primary" : "text-muted-foreground")} />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </nav>
        <div className="h-16 lg:hidden" />
      </main>
      <BusinessOnboardingDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <OnboardingWizard />
      {/* Tour automático (una vez por usuario) + versión controlada desde el menú */}
      <ProductTour />
      <ProductTour open={tourOpen} onOpenChange={setTourOpen} />


      <AppGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}