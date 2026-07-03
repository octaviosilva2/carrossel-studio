import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth-guard";
import {
  createCarousel,
  getCarousel,
} from "@/lib/actions/carousels";
import { EditorClient } from "./editor-client";

// Nao cachear: o editor sempre reflete o estado persistido mais recente.
export const dynamic = "force-dynamic";

interface EditorPageProps {
  // Next 15: searchParams e uma Promise em Server Components.
  searchParams: Promise<{ id?: string | string[] }>;
}

/**
 * Wrapper Server Component do editor (S3). Le `?id=` e resolve o estado inicial:
 * - com id  -> getCarousel(id) (o 404 do dono errado/inexistente vem da action) e
 *   passa o EditorState pronto ao Client (semente do useReducer).
 * - sem id  -> cria um carrossel novo (createCarousel) e redireciona para
 *   /editor?id=<novo> — todo carrossel tem id antes de editar (AC 20).
 * Toda pagina protegida chama requireUser() primeiro (falha fechado -> /login).
 */
export default async function EditorPage({ searchParams }: EditorPageProps) {
  await requireUser();

  const params = await searchParams;
  // searchParams pode vir como array se o parametro repetir; normaliza p/ string.
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!rawId) {
    // Sem id: cria e redireciona para a URL com id (todo carrossel tem id).
    const { id } = await createCarousel();
    redirect(`/editor?id=${id}`);
  }

  // getCarousel valida posse (id de outro dono/inexistente -> notFound()).
  const initialState = await getCarousel(rawId);

  return <EditorClient initialState={initialState} />;
}
