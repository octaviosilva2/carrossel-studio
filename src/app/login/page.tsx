import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth-guard";
import { Logo } from "@/components/app-shell/logo";
import { LoginForm } from "./login-form";

// Nao cachear: a decisao de redirecionar depende da sessao corrente.
export const dynamic = "force-dynamic";

/**
 * Pagina de login (Server Component, redesign). Se ja ha sessao VALIDA (o
 * usuario ainda existe no banco — getSessionUser, nao auth() cru), redireciona
 * para o Dashboard. Caso contrario, renderiza o formulario (Client) que chama a
 * server action signInAction. Nao ha signup publico (conta criada via seed/admin).
 */
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <Logo className="h-8 w-8 text-primary" />
          <span className="text-lg font-semibold tracking-tight">
            Carrossel Studio
          </span>
        </div>
        <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold tracking-tight">Entrar</h1>
          <p className="mb-5 text-sm text-muted-foreground">
            Acesse sua conta para gerar carrosséis.
          </p>
          <LoginForm />
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Sem cadastro público — contas são criadas pelo administrador.
          </p>
        </div>
      </div>
    </main>
  );
}
