import { NewCarouselButton } from "@/components/app-shell/new-carousel-button";
import { listCarousels } from "@/lib/actions/carousels";
import { HistoryClient } from "./history-client";

// Nao cachear: a lista reflete o estado persistido mais recente do dono.
export const dynamic = "force-dynamic";

/**
 * Histórico (redesign da antiga "Meus carrosséis"): busca + pills de período
 * sobre a lista real do dono (listCarousels, que chama requireUser()
 * internamente). AppShell/guard de sessao vivem no layout do grupo `(app)`.
 */
export default async function CarouselsPage() {
  const carousels = await listCarousels();

  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Histórico</h1>
        <NewCarouselButton />
      </header>

      <HistoryClient carousels={carousels} />
    </>
  );
}
