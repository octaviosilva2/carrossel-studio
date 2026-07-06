import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth-guard";
import { isAdminUser, listClientsMock } from "@/lib/mock-redesign";
import { AdminClient } from "./admin-client";

// Nao cachear: decisao de acesso depende da sessao corrente.
export const dynamic = "force-dynamic";

/**
 * Painel de administração (novo, redesign) — só CEO/admin. `isAdminUser()` é
 * MOCK (ver src/lib/mock-redesign.ts): não existe papel de usuário no schema
 * ainda, então esta proteção server-side é provisória; a de verdade fica no
 * backend quando o campo existir. `listClientsMock()` também é mock — não há
 * conceito de "1 admin gerencia N clientes" implementado hoje.
 */
export default async function AdminPage() {
  const user = await requireUser();
  const isAdmin = isAdminUser(user.role);
  if (!isAdmin) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      userName={user.name ?? user.email ?? "Usuário"}
      userEmail={user.email ?? ""}
      isAdmin={isAdmin}
    >
      <header className="sticky top-14 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-5 backdrop-blur lg:top-0">
        <h1 className="text-sm font-semibold">Admin</h1>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          somente CEO/admin
        </span>
      </header>

      <AdminClient initialClients={listClientsMock()} />
    </AppShell>
  );
}
