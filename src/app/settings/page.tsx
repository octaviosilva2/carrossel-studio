import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth-guard";
import { getClientSettings } from "@/lib/actions/settings";
import { SettingsForm } from "./settings-form";

// Nao cachear: reflete a identidade padrao persistida mais recente do dono.
export const dynamic = "force-dynamic";

/**
 * Tela de configuracao da identidade padrao (marca) do cliente (S6). Server
 * Component: requireUser() barra deslogado (-> /login) e getClientSettings() traz
 * SOMENTE a marca do dono. O form (client) edita e salva via updateClientSettings.
 * Esta identidade e a herdada por todo carrossel novo (overrides null herdam dela).
 */
export default async function SettingsPage() {
  await requireUser();
  const settings = await getClientSettings();

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Configurações
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Identidade padrão da marca. Todo carrossel novo herda estes dados.
            </p>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href="/carousels">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </header>

        <SettingsForm initial={settings} />
      </div>
    </main>
  );
}
