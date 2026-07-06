import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Logo } from "@/components/app-shell/logo";
import { LoginForm } from "./login-form";

// Nao cachear: a decisao de redirecionar depende da sessao corrente.
export const dynamic = "force-dynamic";

/**
 * Pagina de login (Server Component, redesign). Se ja ha sessao, redireciona
 * para o Dashboard (nova home pos-login). Caso contrario, renderiza o
 * formulario (Client) que chama a server action signInAction — logica de auth
 * inalterada. Nao ha signup publico (conta criada via seed/admin).
 *
 * TODO(integração pós-merge): a action `signInAction` (src/lib/actions/auth.ts)
 * ainda redireciona para "/carousels" apos login bem-sucedido — fora do escopo
 * desta sessao de frontend (arquivo de actions). Trocar para "/dashboard" la
 * quando o backend mergear, para o pos-login bater com esta pagina.
 */
export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) {
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
