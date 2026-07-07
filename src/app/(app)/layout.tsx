import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth-guard";

// Sessao via cookie (auth() so decodifica o JWT, sem ida ao banco) — barato o
// bastante pra rodar em toda navegacao dentro do grupo autenticado.
export const dynamic = "force-dynamic";

/**
 * Layout do grupo `(app)` (dashboard/carousels/settings/admin/editor): monta o
 * AppShell UMA VEZ e mantem vivo entre navegacoes (Next NAO remonta layout ao
 * trocar de rota-irma — so troca `children`). Antes, cada page.tsx chamava
 * requireUser() e renderizava o proprio <AppShell>, entao a sidebar inteira
 * desmontava/remontava a cada clique, sem feedback visual ate o Server
 * Component da pagina nova terminar — sensacao de trava. Agora a sidebar e o
 * topbar sao instantaneos; so o conteudo (via `loading.tsx` de cada rota)
 * mostra esqueleto enquanto os dados carregam.
 */
export default async function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  return (
    <AppShell
      userName={user.name ?? user.email ?? "Usuário"}
      userEmail={user.email ?? ""}
      isAdmin={isAdmin}
    >
      {children}
    </AppShell>
  );
}
