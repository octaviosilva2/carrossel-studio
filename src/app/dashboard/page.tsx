import { AppShell } from "@/components/app-shell/app-shell";
import { NewCarouselButton } from "@/components/app-shell/new-carousel-button";
import { requireUser } from "@/lib/auth-guard";
import { listCarousels } from "@/lib/actions/carousels";
import { DashboardClient } from "./dashboard-client";

// Nao cachear: contadores/recentes/atividade refletem o estado persistido mais recente.
export const dynamic = "force-dynamic";

/**
 * Dashboard — nova home pos-login (redesign). Server Component: requireUser()
 * barra deslogado; listCarousels() traz os carrosseis do dono (real, sem
 * mock). Os calculos de contadores/atividade rodam no Client (DashboardClient).
 */
export default async function DashboardPage() {
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
        <h1 className="text-sm font-semibold">Dashboard</h1>
        <NewCarouselButton />
      </header>

      <DashboardClient carousels={carousels} />
    </AppShell>
  );
}
