import { requireUser } from "@/lib/auth-guard";
import { getClientSettings } from "@/lib/actions/settings";
import { Logo } from "@/components/app-shell/logo";
import { OnboardingForm } from "./onboarding-form";

// Nao cachear: sempre parte da identidade persistida mais recente do dono.
export const dynamic = "force-dynamic";

/**
 * Onboarding de primeiro acesso — fora do AppShell (como /login). Le a
 * identidade atual (getClientSettings, real) como semente do form; "Deixar
 * para depois" e "Concluir" sempre levam ao Dashboard (nova home pos-login).
 */
export default async function OnboardingPage() {
  await requireUser();
  const settings = await getClientSettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-7">
        <div className="flex items-center justify-center gap-2.5">
          <Logo className="h-8 w-8 text-primary" />
          <span className="text-lg font-semibold tracking-tight">
            Carrossel Studio
          </span>
        </div>
        <OnboardingForm initial={settings} />
      </div>
    </main>
  );
}
