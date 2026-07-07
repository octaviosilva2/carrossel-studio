"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutGrid,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions/auth";
import { Logo } from "./logo";

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

// Barra inferior mobile/tablet (estilo Instagram): so os destinos primarios.
// "Configuracoes" fica no menu de conta (avatar, topo direito) — nao aqui.
const BOTTOM_NAV: NavItemDef[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/carousels", label: "Histórico", icon: History },
];

interface AppShellProps {
  children: ReactNode;
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}

/**
 * Casca visual compartilhada por toda pagina logada (exceto /login e
 * /onboarding): sidebar fixa colapsavel em telas lg+; em telas menores vira
 * topbar (logo + menu de conta) + barra inferior de navegacao (estilo
 * Instagram). Tema do app e sempre claro (sem opcao de troca).
 */
export function AppShell({ children, userName, userEmail, isAdmin }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Le preferencia persistida so no cliente (evita mismatch de hidratacao SSR).
  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
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
            collapsed && "justify-center px-2",
          )}
        >
          {!collapsed ? (
            <>
              {/* Expandido: logo + nome + botao de recolher. */}
              <Logo className="h-7 w-7 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold tracking-tight">
                Carrossel Studio
              </span>
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
            </>
          ) : (
            // Recolhido: o botao de expandir ocupa o lugar da logo (a logo some).
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={toggleCollapsed}
              title="Expandir menu"
            >
              <ChevronRight className="h-5 w-5" />
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
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar mobile/tablet: logo a esquerda, conta a direita (some em telas >=lg) */}
        <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo className="h-6 w-6 text-primary" />
            <span className="text-sm font-semibold">Carrossel Studio</span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-accent"
                aria-label="Menu da conta"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initial}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm font-medium text-foreground">
                  {userName}
                </span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {userEmail}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link href="/admin">
                    <ShieldCheck className="h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none transition-colors hover:bg-accent focus:bg-accent"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="min-w-0 flex-1 pb-14 lg:pb-0">{children}</div>

        {/* Barra inferior mobile/tablet, estilo Instagram: Dashboard + Historico
            (some em telas >=lg, onde a sidebar fixa ja cobre a navegacao). */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-stretch border-t border-border bg-background/95 backdrop-blur lg:hidden">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// Lista de itens de navegacao da sidebar fixa (desktop/laptop, >=lg).
function NavList({
  pathname,
  isAdmin,
  collapsed,
}: {
  pathname: string;
  isAdmin: boolean;
  collapsed: boolean;
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

      {isAdmin ? (
        <div className="mt-2.5 border-t border-border pt-2.5">
          {!collapsed ? (
            <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Administração
            </p>
          ) : null}
          <Link
            href="/admin"
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

// Rodape da sidebar fixa (desktop/laptop, >=lg): usuario logado + logout.
function SidebarFooter({
  userName,
  userEmail,
  initial,
  collapsed,
}: {
  userName: string;
  userEmail: string;
  initial: string;
  collapsed: boolean;
}) {
  return (
    <div className="space-y-2 border-t border-border p-2.5">
      <Link
        href="/settings?tab=account"
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
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className={cn(
            "w-full text-xs",
            collapsed ? "justify-center px-0" : "justify-between",
          )}
          title="Sair da conta"
        >
          {!collapsed ? <span>Sair</span> : null}
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
