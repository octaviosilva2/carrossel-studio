import { requireAdmin } from "@/lib/auth-guard";
import { listClientsAdmin } from "@/lib/actions/admin";
import { AdminClient } from "./admin-client";

// Nao cachear: decisao de acesso e a lista de clientes dependem da sessao/estado atual.
export const dynamic = "force-dynamic";

/**
 * Painel de administração — só CEO/admin. AppShell vive no layout do grupo
 * `(app)`; aqui so o guard ESTRITO (`requireAdmin()` falha fechado — redireciona
 * pra /dashboard sem role admin, mesmo ja logado) e o conteudo.
 * `listClientsAdmin()` traz os clientes reais do banco (ver src/lib/actions/admin.ts).
 */
export default async function AdminPage() {
  await requireAdmin();
  const clients = await listClientsAdmin();

  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Admin</h1>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          somente CEO/admin
        </span>
      </header>

      <AdminClient initialClients={clients} />
    </>
  );
}
