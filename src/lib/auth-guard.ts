// Guarda de autenticacao para paginas e server actions protegidas. Falha fechado:
// sem sessao valida, redireciona para /login antes de qualquer logica. Usado no
// topo de toda action e pagina que exige login.

import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Usuario autenticado — sempre com id garantido apos requireUser(). */
export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  name?: string | null;
  /**
   * TODO(integração pós-merge): `role` ainda nao existe em session.user (ver
   * src/types/next-auth.d.ts) — a tabela `users` nao tem coluna de papel ainda
   * (src/db/schema.ts). Cast temporario ate o backend expor isso de verdade;
   * consumido hoje so pelo mock isAdminUser() (src/lib/mock-redesign.ts).
   */
  role?: string;
}

/**
 * Exige um usuario logado. Retorna o usuario da sessao ou redireciona para /login
 * (redirect() lanca — o codigo apos a chamada so roda autenticado).
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: (session.user as { role?: string }).role,
  };
}
