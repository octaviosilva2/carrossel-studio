import { AppShell } from "@/components/app-shell/app-shell";
import { NewCarouselButton } from "@/components/app-shell/new-carousel-button";
import { requireUser } from "@/lib/auth-guard";
import { listCarousels } from "@/lib/actions/carousels";
import { HistoryClient } from "./history-client";

// Nao cachear: a lista reflete o estado persistido mais recente do dono.
export const dynamic = "force-dynamic";

/**
 * Histórico (redesign da antiga "Meus carrosséis"): busca + pills de período
 * sobre a lista real do dono (listCarousels). requireUser() barra deslogado.
 */
export default async function CarouselsPage() {
  const user = await requireUser();
  const carousels = await listCarousels();
  const isAdmin = user.role === "admin";

  return (
    <AppShell
      userName={user.name ?? user.email ?? "Usuário"}
      userEmail={user.email ?? ""}
      isAdmin={isAdmin}
    >
      <header className="sticky top-14 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-5 backdrop-blur lg:top-0">
        <h1 className="text-sm font-semibold">Histórico</h1>
        <NewCarouselButton />
      </header>

      <HistoryClient carousels={carousels} />
    </AppShell>
  );
}
