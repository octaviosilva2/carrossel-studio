import { NewCarouselButton } from "@/components/app-shell/new-carousel-button";
import { listCarousels } from "@/lib/actions/carousels";
import { DashboardClient } from "./dashboard-client";

// Nao cachear: contadores/recentes/atividade refletem o estado persistido mais recente.
export const dynamic = "force-dynamic";

/**
 * Dashboard — nova home pos-login (redesign). AppShell/requireUser vivem no
 * layout do grupo `(app)`; aqui so o conteudo. listCarousels() (chama
 * requireUser() internamente) traz os carrosseis do dono (real, sem mock). Os
 * calculos de contadores/atividade rodam no Client (DashboardClient).
 */
export default async function DashboardPage() {
  const carousels = await listCarousels();

  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Dashboard</h1>
        <NewCarouselButton />
      </header>

      <DashboardClient carousels={carousels} />
    </>
  );
}
