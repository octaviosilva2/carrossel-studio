// Guarda de autenticacao para paginas e server actions protegidas. Falha fechado:
// sem sessao valida, redireciona para /login antes de qualquer logica. Usado no
// topo de toda action e pagina que exige login.

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

/** Usuario autenticado — sempre com id garantido apos requireUser(). */
export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  name?: string | null;
  /** 'admin' | 'client'; ausente em sessoes de JWT emitidos antes do claim existir. */
  role?: string;
}

/**
 * Le a sessao (JWT, stateless) e confirma que o usuario AINDA existe no banco.
 * Sem essa checagem, excluir uma conta (ex.: admin apagando um cliente) nao
 * desconecta quem ja estava logado: o cookie continua assinado corretamente ate
 * expirar, mesmo apontando pra um id que sumiu — inclusive se outra conta for
 * criada depois com o MESMO e-mail (id novo, sessao velha nao percebe a troca).
 * Retorna null se nao ha sessao OU se o usuario da sessao nao existe mais.
 */
async function getValidSessionUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (found.length === 0) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

/**
 * Exige um usuario logado E ainda existente no banco. Retorna o usuario da
 * sessao ou redireciona para /login (redirect() lanca — o codigo apos a
 * chamada so roda autenticado).
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getValidSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Exige um usuario logado (e existente) com role 'admin'. Falha fechado em duas
 * camadas: sem sessao valida => /login; sessao valida mas sem role admin =>
 * /dashboard (area do client). redirect() lanca — o codigo apos a chamada so
 * roda autenticado E autorizado como admin.
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await getValidSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "admin") {
    redirect("/dashboard");
  }
  return user;
}

/**
 * Mesma checagem de `requireUser`, mas SEM redirecionar — usada pela pagina de
 * /login para decidir se ja ha sessao valida (redireciona pro Dashboard) sem
 * cair num loop quando o cookie e de uma conta que ja foi excluida (nesse caso
 * devolve null e a pagina de login renderiza normalmente).
 */
export async function getSessionUser(): Promise<AuthenticatedUser | null> {
  return getValidSessionUser();
}
