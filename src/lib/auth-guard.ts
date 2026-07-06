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
  /** 'admin' | 'client'; ausente em sessoes de JWT emitidos antes do claim existir. */
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
    role: session.user.role,
  };
}

/**
 * Exige um usuario logado com role 'admin'. Falha fechado em duas camadas: sem
 * sessao => /login; sessao valida mas sem role admin => /carousels (area do
 * client — nao existe /dashboard ainda nesta fase; ajustar quando o front criar
 * a rota). redirect() lanca — o codigo apos a chamada so roda autenticado E
 * autorizado como admin.
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/carousels");
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}
