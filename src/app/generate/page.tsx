import { requireUser } from "@/lib/auth-guard";
import { GenerateClient } from "./generate-client";

// Nao cachear: pagina protegida por sessao; sempre renderiza autenticada.
export const dynamic = "force-dynamic";

/**
 * Wrapper Server Component da tela de geracao com IA (Porta A, S5). requireUser()
 * barra o visitante nao logado ANTES de renderizar (AC-1: nao chega a Claude API).
 * Renderiza o Client Component que coleta a intencao e dispara generateCarousel.
 */
export default async function GeneratePage() {
  await requireUser();
  return <GenerateClient />;
}
