import { redirect } from "next/navigation";

import { createCarousel, getCarousel } from "@/lib/actions/carousels";
import { EditorClient } from "./editor-client";

// Nao cachear: o editor sempre reflete o estado persistido mais recente.
export const dynamic = "force-dynamic";

interface EditorPageProps {
  // Next 15: searchParams e uma Promise em Server Components.
  searchParams: Promise<{ id?: string | string[]; title?: string | string[] }>;
}

/**
 * Wrapper Server Component do editor. AppShell vive no layout do grupo `(app)`
 * (guard de sessao ja aplicado la); aqui so a logica do editor. Le `?id=` e
 * resolve o estado inicial:
 * - com id  -> getCarousel(id) (o 404 do dono errado/inexistente vem da action,
 *   que chama requireUser() internamente) e passa o EditorState pronto ao
 *   Client (semente do useReducer).
 * - sem id  -> cria um carrossel novo (createCarousel) e redireciona para
 *   /editor?id=<novo> — todo carrossel tem id antes de editar (AC 20).
 *
 * `?title=` (opcional, vindo do modal "Novo carrossel") sobrescreve o titulo
 * na hidratacao — createCarousel() sempre grava DEFAULT_CAROUSEL_TITLE no
 * banco; o autosave do EditorClient persiste o titulo escolhido pouco depois.
 */
export default async function EditorPage({ searchParams }: EditorPageProps) {
  const params = await searchParams;
  // searchParams pode vir como array se o parametro repetir; normaliza p/ string.
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const rawTitle = Array.isArray(params.title) ? params.title[0] : params.title;

  if (!rawId) {
    // Sem id: cria e redireciona para a URL com id (todo carrossel tem id).
    const { id } = await createCarousel();
    const titleSuffix = rawTitle ? `&title=${encodeURIComponent(rawTitle)}` : "";
    redirect(`/editor?id=${id}${titleSuffix}`);
  }

  // getCarousel valida posse (id de outro dono/inexistente -> notFound()).
  const initialState = await getCarousel(rawId);
  if (rawTitle) {
    initialState.title = rawTitle;
  }

  return <EditorClient initialState={initialState} />;
}
