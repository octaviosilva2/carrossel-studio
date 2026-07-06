import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth-guard";
import { getClientSettings } from "@/lib/actions/settings";
import { SettingsForm } from "./settings-form";

// Nao cachear: reflete a identidade padrao persistida mais recente do dono.
export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Tela de configuracao (redesign): abas Identidade/Conta dentro do AppShell.
 * requireUser() barra deslogado (-> /login); getClientSettings() traz a marca
 * do dono. `?tab=account` (usado pelo rodape da sidebar) abre direto na aba Conta.
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireUser();
  const [settings, params] = await Promise.all([
    getClientSettings(),
    searchParams,
  ]);
  const isAdmin = user.role === "admin";

  const initialTab = params.tab === "account" ? "account" : "identity";

  return (
    <AppShell
      userName={user.name ?? user.email ?? "Usuário"}
      userEmail={user.email ?? ""}
      isAdmin={isAdmin}
    >
      <header className="sticky top-14 z-10 flex h-14 items-center border-b border-border bg-background/80 px-5 backdrop-blur lg:top-0">
        <h1 className="text-sm font-semibold">Configurações</h1>
      </header>

      <div className="max-w-2xl p-5">
        <SettingsForm
          initial={settings}
          userEmail={user.email ?? ""}
          initialTab={initialTab}
          onboardingCompletedAt={settings.onboardingCompletedAt}
        />
      </div>
    </AppShell>
  );
}
