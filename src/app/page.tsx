import { redirect } from "next/navigation";

/**
 * Raiz do app. Redireciona para /dashboard (home pos-login do redesign) — que,
 * por sua vez, exige login (requireUser -> /login se deslogado). Mantem a home
 * simples e sem UI propria.
 */
export default function Home() {
  redirect("/dashboard");
}
