import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "./login-form";

// Nao cachear: a decisao de redirecionar depende da sessao corrente.
export const dynamic = "force-dynamic";

/**
 * Pagina de login (Server Component). Se ja ha sessao, redireciona para a area do
 * app (/carousels). Caso contrario, renderiza o formulario (Client) que chama a
 * server action signInAction. Nao ha signup publico (conta criada via seed).
 */
export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/carousels");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Carrossel Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Entre com sua conta para continuar.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
