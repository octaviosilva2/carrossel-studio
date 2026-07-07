import { requireUser } from "@/lib/auth-guard";
import { getAccountInfo, getClientSettings } from "@/lib/actions/settings";
import { SettingsForm } from "./settings-form";

// Nao cachear: reflete a identidade padrao persistida mais recente do dono.
export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Tela de configuracao (redesign): abas Identidade/Conta. AppShell vive no
 * layout do grupo `(app)`; requireUser() aqui e so pra pegar o e-mail (exibido
 * na aba Conta). getClientSettings() traz a marca do dono. `?tab=account`
 * (usado pelo rodape da sidebar) abre direto na aba Conta.
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [user, settings, accountInfo, params] = await Promise.all([
    requireUser(),
    getClientSettings(),
    getAccountInfo(),
    searchParams,
  ]);

  const initialTab = params.tab === "account" ? "account" : "identity";

  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Configurações</h1>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <SettingsForm
          initial={settings}
          userEmail={user.email ?? ""}
          initialTab={initialTab}
          onboardingCompletedAt={settings.onboardingCompletedAt}
          initialPasswordChangedAt={accountInfo.passwordChangedAt}
        />
      </div>
    </>
  );
}
