"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  History,
  LayoutGrid,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NewCarouselButton } from "./new-carousel-button";

const THEME_STORAGE_KEY = "carrossel-studio-theme";
const SIDEBAR_STORAGE_KEY = "carrossel-studio-sidebar-collapsed";

interface NavItemDef {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
}

const MAIN_NAV: NavItemDef[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/carousels", label: "Histórico", icon: History },
  { href: "/settings", label: "Configurações", icon: Settings },
];

interface AppShellProps {
  children: ReactNode;
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}

/**
 * Casca visual compartilhada por toda pagina logada (exceto /login e
 * /onboarding): sidebar fixa colapsavel em telas lg+, vira Sheet (drawer) em
 * telas menores, com toggle de tema do app persistido em localStorage.
 */
export function AppShell({ children, userName, userEmail, isAdmin }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Le preferencias persistidas so no cliente (evita mismatch de hidratacao SSR).
  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1") setCollapsed(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  }

  const initial = userName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar fixa (desktop/laptop, >=lg) */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex",
          collapsed ? "lg:w-16" : "lg:w-56",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center gap-2 border-b border-border px-4",
            collapsed && "justify-center px-0",
          )}
        >
          <Logo className="h-7 w-7 shrink-0 text-primary" />
          {!collapsed ? (
            <span className="truncate text-sm font-semibold tracking-tight">
              Carrossel Studio
            </span>
          ) : null}
          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 shrink-0 text-muted-foreground"
              onClick={toggleCollapsed}
              title="Recolher menu"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute -right-3 top-3 hidden h-6 w-6 rounded-full border border-border bg-background lg:flex"
              onClick={toggleCollapsed}
              title="Expandir menu"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
          <NavList pathname={pathname} isAdmin={isAdmin} collapsed={collapsed} />
        </nav>

        <SidebarFooter
          userName={userName}
          userEmail={userEmail}
          initial={initial}
          collapsed={collapsed}
          isDark={isDark}
          onToggleTheme={toggleTheme}
        />
      </aside>

      {/* Drawer (mobile/tablet, <lg) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-64 flex-col p-0">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <div className="flex h-14 items-center gap-2 border-b border-border px-4">
            <Logo className="h-6 w-6 shrink-0 text-primary" />
            <span className="text-sm font-semibold tracking-tight">
              Carrossel Studio
            </span>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
            <NavList
              pathname={pathname}
              isAdmin={isAdmin}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </nav>
          <SidebarFooter
            userName={userName}
            userEmail={userEmail}
            initial={initial}
            collapsed={false}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar mobile/tablet: hamburguer + logo (some em telas >=lg) */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1.5 h-8 w-8"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Logo className="h-6 w-6 text-primary" />
          <span className="text-sm font-semibold">Carrossel Studio</span>
        </div>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

// Lista de itens de navegacao — compartilhada entre a sidebar fixa e o drawer.
function NavList({
  pathname,
  isAdmin,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  isAdmin: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {MAIN_NAV.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              collapsed && "justify-center",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed ? <span>{item.label}</span> : null}
          </Link>
        );
      })}

      <NewCarouselButton
        variant="ghost"
        className={cn(
          "w-full justify-start gap-2.5 px-2.5 py-2 text-sm font-normal text-muted-foreground hover:bg-accent hover:text-foreground",
          collapsed && "justify-center px-0",
        )}
        label={collapsed ? undefined : "Novo carrossel"}
      />

      {isAdmin ? (
        <div className="mt-2.5 border-t border-border pt-2.5">
          {!collapsed ? (
            <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Administração
            </p>
          ) : null}
          <Link
            href="/admin"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              collapsed && "justify-center",
              pathname.startsWith("/admin")
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <ShieldCheck className="h-5 w-5 shrink-0" />
            {!collapsed ? <span className="flex-1">Admin</span> : null}
            {!collapsed ? (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-100 text-[9px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
              >
                CEO
              </Badge>
            ) : null}
          </Link>
        </div>
      ) : null}
    </>
  );
}

// Rodape da sidebar: usuario logado + toggle de tema. Compartilhado entre a
// sidebar fixa e o drawer mobile (so muda `collapsed`/`onNavigate`).
function SidebarFooter({
  userName,
  userEmail,
  initial,
  collapsed,
  isDark,
  onToggleTheme,
  onNavigate,
}: {
  userName: string;
  userEmail: string;
  initial: string;
  collapsed: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-border p-2.5">
      <Link
        href="/settings?tab=account"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent",
          collapsed && "justify-center",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initial}
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{userName}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {userEmail}
            </span>
          </span>
        ) : null}
      </Link>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "w-full text-xs",
          collapsed ? "justify-center px-0" : "justify-between",
        )}
        onClick={onToggleTheme}
        title="Alternar tema do app"
      >
        {!collapsed ? <span>Tema do app</span> : null}
        <span className="flex items-center gap-1">
          {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          {!collapsed ? (isDark ? "Escuro" : "Claro") : null}
        </span>
      </Button>
    </div>
  );
}
