// Adaptador PURO entre linhas do banco e o EditorState (S2). Sem I/O, sem React —
// testavel em jsdom sem banco. Concentra a regra de heranca de identidade
// (override por campo, null = herda do client) e a ordenacao de slides por posicao.
//
// NAO importa `@/db` nem `@/db/schema` para nao arrastar `server-only` / drivers
// para o ambiente de teste jsdom. Define shapes minimos das linhas que consome.

import {
  DEFAULT_CAROUSEL_TITLE,
  type CarouselIdentity,
  type EditorSlide,
  type EditorState,
} from "@/lib/editor-state";
import type { SlideTheme } from "@/components/slide/types";

// --- Shapes de linha (subconjunto do schema, sem dependencia de server) -------

/** Linha `clients` relevante para o mapping. */
export interface ClientData {
  name: string;
  handle: string;
  avatarUrl: string;
  verified: boolean;
  theme: string; // 'light' | 'dark' no banco (text); normalizado em resolveTheme
}

/** Linha `carousels` relevante para o mapping (overrides null = herda). */
export interface CarouselData {
  id: string;
  title: string;
  overrideName: string | null;
  overrideHandle: string | null;
  overrideAvatarUrl: string | null;
  overrideVerified: boolean | null;
  overrideTheme: string | null;
}

/** Linha `slides` relevante para o mapping. */
export interface SlideData {
  position: number;
  body: string;
  imageUrl: string | null;
}

/** Forma persistivel de um slide (sem id/carouselId — gerados no insert). */
export interface SlideRowInput {
  position: number;
  body: string;
  imageUrl: string | null;
}

// --- Helpers de tema ----------------------------------------------------------

/** Normaliza um valor de tema do banco para o union fechado; default 'light'. */
function normalizeTheme(value: string | null | undefined): SlideTheme {
  return value === "dark" ? "dark" : "light";
}

// --- Resolucao de identidade (heranca por campo) ------------------------------

/**
 * Identidade efetiva do carrossel: cada campo usa o override quando presente
 * (nao-null), senao herda do client. Regra por campo, nao tudo-ou-nada.
 */
export function resolveIdentity(
  client: ClientData,
  carousel: CarouselData,
): CarouselIdentity {
  return {
    name: carousel.overrideName ?? client.name,
    handle: carousel.overrideHandle ?? client.handle,
    avatarUrl: carousel.overrideAvatarUrl ?? client.avatarUrl,
    verified: carousel.overrideVerified ?? client.verified,
  };
}

/** Tema efetivo: override do carrossel se houver, senao o do client. */
export function resolveTheme(
  client: ClientData,
  carousel: CarouselData,
): SlideTheme {
  return normalizeTheme(carousel.overrideTheme ?? client.theme);
}

// --- Row -> EditorState -------------------------------------------------------

/**
 * Monta o EditorState a partir das linhas: identidade/tema resolvidos, slides
 * ordenados por `position` e mapeados para EditorSlide, selecao no 1o slide.
 * Se nao houver slides, cai no shape vazio (0 slides, selecao null) coerente
 * com o reducer da S2. Nao muta os arrays de entrada.
 */
export function rowToEditorState(
  client: ClientData,
  carousel: CarouselData,
  slides: readonly SlideData[],
): EditorState {
  // Copia e ordena por position (nao muta a entrada).
  const ordered = [...slides].sort((a, b) => a.position - b.position);

  const editorSlides: EditorSlide[] = ordered.map((slide) => ({
    id: crypto.randomUUID(),
    body: slide.body,
    // null no banco => undefined no editor (presenca define corpo 46 vs 52).
    imageUrl: slide.imageUrl ?? undefined,
  }));

  const first = editorSlides[0];

  return {
    carouselId: carousel.id,
    title: carousel.title || DEFAULT_CAROUSEL_TITLE,
    identity: resolveIdentity(client, carousel),
    theme: resolveTheme(client, carousel),
    slides: editorSlides,
    selectedSlideId: first ? first.id : null,
  };
}

// --- EditorState identity -> overrides ---------------------------------------

/** Overrides persistiveis de identidade (campo igual ao client vira null). */
export interface IdentityOverride {
  overrideName: string | null;
  overrideHandle: string | null;
  overrideAvatarUrl: string | null;
  overrideVerified: boolean | null;
}

/**
 * Converte a identidade editada em overrides por campo: se o valor for IGUAL ao
 * do client, grava null (herda) — NAO materializa herdados. Assim, se o client
 * mudar depois, os campos herdados acompanham. Edge "override parcial".
 */
export function identityToOverride(
  identity: CarouselIdentity,
  client: ClientData,
): IdentityOverride {
  return {
    overrideName: identity.name === client.name ? null : identity.name,
    overrideHandle: identity.handle === client.handle ? null : identity.handle,
    overrideAvatarUrl:
      identity.avatarUrl === client.avatarUrl ? null : identity.avatarUrl,
    overrideVerified:
      identity.verified === client.verified ? null : identity.verified,
  };
}

/**
 * Override de tema: null se igual ao do client (herda), senao o valor editado.
 */
export function themeToOverride(
  theme: SlideTheme,
  client: ClientData,
): string | null {
  return normalizeTheme(client.theme) === theme ? null : theme;
}

// --- EditorSlides -> linhas persistiveis --------------------------------------

/**
 * Converte os slides do editor em linhas persistiveis na ORDEM do array:
 * position = indice (0-based). Base do replace-all do saveCarousel.
 */
export function slidesToRows(slides: readonly EditorSlide[]): SlideRowInput[] {
  return slides.map((slide, index) => ({
    position: index,
    body: slide.body,
    // undefined no editor => null no banco.
    imageUrl: slide.imageUrl ?? null,
  }));
}
