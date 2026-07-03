// Estado do editor de carrossel (S2). Modulo PURO — sem React, sem DOM, sem
// "use client". Toda a logica de transicao vive no reducer, testavel isolada pelo
// estagio 06. O contrato imutavel `SlideData`/`SlideTheme` vem da S1: NAO redefinir.

import type { SlideData, SlideTheme } from "@/components/slide/types";

/**
 * Identidade do perfil — compartilhada por TODOS os slides do carrossel.
 * Editada uma vez, reflete em todos (decisao fixada na story).
 */
export interface CarouselIdentity {
  name: string;
  /** SEM "@": o <Slide> prefixa "@" na render (slide.tsx). */
  handle: string;
  /** data-URL; NUNCA "" — cai no placeholder default quando nao ha avatar. */
  avatarUrl: string;
  verified: boolean;
}

/**
 * Slide do editor: envelope com id + campos POR slide. NAO e um SlideData — o
 * SlideData e montado por `toSlideData` combinando identidade + slide + tema.
 */
export interface EditorSlide {
  /** Estavel, para React key e reorder. */
  id: string;
  body: string;
  /** data-URL ou undefined; a presenca define corpo 46 (com) vs 52 (sem). */
  imageUrl?: string;
}

/** Estado inteiro do editor. */
export interface EditorState {
  identity: CarouselIdentity;
  /** Tema global do carrossel — reflete em todos os slides. */
  theme: SlideTheme;
  slides: EditorSlide[];
  /** null se e somente se `slides` esta vazio; senao aponta um id existente. */
  selectedSlideId: string | null;
  /**
   * id do carrossel persistido (S3). undefined => ainda nao salvo (novo). Campo
   * ADITIVO: nao altera o shape que os testes da S2 verificam nas transicoes.
   */
  carouselId?: string;
  /**
   * Titulo do carrossel (S3). ADITIVO e OPCIONAL para nao quebrar os literais de
   * EditorState dos testes da S2. O `initialState` ja traz o default; leituras
   * devem cair em DEFAULT_CAROUSEL_TITLE quando ausente.
   */
  title?: string;
}

/**
 * Uniao discriminada de acoes. O reducer descreve cada transicao explicitamente
 * e centraliza as invariantes (selecao sempre valida, no-op nas pontas).
 */
export type EditorAction =
  | { type: "UPDATE_IDENTITY"; patch: Partial<Omit<CarouselIdentity, "avatarUrl">> }
  | { type: "SET_AVATAR"; avatarUrl: string }
  | { type: "REMOVE_AVATAR" }
  | { type: "TOGGLE_VERIFIED" }
  | { type: "SET_THEME"; theme: SlideTheme }
  | { type: "SELECT_SLIDE"; id: string }
  | { type: "ADD_SLIDE" }
  | { type: "REMOVE_SLIDE"; id: string }
  | { type: "MOVE_SLIDE"; id: string; direction: "up" | "down" }
  | { type: "UPDATE_SLIDE_BODY"; id: string; body: string }
  | { type: "SET_SLIDE_IMAGE"; id: string; imageUrl: string }
  | { type: "REMOVE_SLIDE_IMAGE"; id: string }
  // Aditivo (S3): edita o titulo do carrossel. Nao altera as actions da S2.
  | { type: "SET_TITLE"; title: string };

// --- Placeholder de avatar (default) -----------------------------------------

// data-URL SVG inline, same-origin (zero CORS no canvas do export futuro), no
// estilo dos fixtures da S1. 200x200, viewBox 0 0 200 200, cores neutras: fundo
// cinza-claro + silhueta cinza-medio. Usado no estado inicial e ao remover avatar.
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#cfd9de"/>
  <circle cx="100" cy="78" r="34" fill="#8899a6"/>
  <path d="M40 172c0-33 27-56 60-56s60 23 60 56z" fill="#8899a6"/>
</svg>`;

/** Placeholder neutro de avatar (data-URL SVG). NUNCA usar "" no <Slide>. */
export const DEFAULT_AVATAR_DATA_URL = `data:image/svg+xml,${encodeURIComponent(
  DEFAULT_AVATAR_SVG,
)}`;

// --- Estado inicial ----------------------------------------------------------

// Comeca com 1 slide vazio selecionado: o editor abre ja mostrando um preview
// utilizavel. O "estado vazio de 0 slides" so acontece se o usuario remover o
// ultimo slide (edge case da story).
const INITIAL_SLIDE_ID = "slide-inicial";

/** Titulo default de um carrossel novo (usado no editor e na criacao). */
export const DEFAULT_CAROUSEL_TITLE = "Carrossel sem título";

export const initialState: EditorState = {
  identity: {
    name: "",
    handle: "",
    avatarUrl: DEFAULT_AVATAR_DATA_URL,
    verified: false,
  },
  theme: "light",
  slides: [{ id: INITIAL_SLIDE_ID, body: "", imageUrl: undefined }],
  selectedSlideId: INITIAL_SLIDE_ID,
  title: DEFAULT_CAROUSEL_TITLE,
};

// --- Reducer (puro) ----------------------------------------------------------

/**
 * Reducer do editor. Puro: sempre retorna novo estado, nunca muta. Nas pontas de
 * um movimento invalido (ou id inexistente) retorna a MESMA referencia de estado,
 * permitindo ao React pular re-render e ao teste asserir `next === prev`.
 */
export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "UPDATE_IDENTITY": {
      // Mescla o patch em identity (name/handle/verified). Nao toca slides/tema.
      return {
        ...state,
        identity: { ...state.identity, ...action.patch },
      };
    }

    case "SET_AVATAR": {
      // Chamado so com data-URL ja validada.
      return {
        ...state,
        identity: { ...state.identity, avatarUrl: action.avatarUrl },
      };
    }

    case "REMOVE_AVATAR": {
      // Volta ao placeholder default — nunca deixa "".
      return {
        ...state,
        identity: { ...state.identity, avatarUrl: DEFAULT_AVATAR_DATA_URL },
      };
    }

    case "TOGGLE_VERIFIED": {
      return {
        ...state,
        identity: { ...state.identity, verified: !state.identity.verified },
      };
    }

    case "SET_THEME": {
      return { ...state, theme: action.theme };
    }

    case "SELECT_SLIDE": {
      // Falha fechado: id inexistente nao corrompe a selecao (no-op).
      const exists = state.slides.some((slide) => slide.id === action.id);
      if (!exists) return state;
      return { ...state, selectedSlideId: action.id };
    }

    case "ADD_SLIDE": {
      // Slide vazio ao fim; passa a ser o selecionado. id gerado aqui.
      const newSlide: EditorSlide = {
        id: crypto.randomUUID(),
        body: "",
        imageUrl: undefined,
      };
      return {
        ...state,
        slides: [...state.slides, newSlide],
        selectedSlideId: newSlide.id,
      };
    }

    case "REMOVE_SLIDE": {
      const removedIndex = state.slides.findIndex(
        (slide) => slide.id === action.id,
      );
      // id inexistente: no-op (mesma referencia).
      if (removedIndex === -1) return state;

      const nextSlides = state.slides.filter((slide) => slide.id !== action.id);

      // Se removeu o ultimo slide -> estado vazio (0 slides, selecao null).
      if (nextSlides.length === 0) {
        return { ...state, slides: nextSlides, selectedSlideId: null };
      }

      // Se o removido nao era o selecionado, a selecao segue inalterada.
      if (state.selectedSlideId !== action.id) {
        return { ...state, slides: nextSlides };
      }

      // Era o selecionado: seleciona o vizinho valido. novoIndice =
      // min(indiceRemovido, novaLista.length - 1) -> vizinho anterior se existir,
      // senao o proximo. noUncheckedIndexedAccess: o clamp garante indice valido,
      // mas ainda narrowamos o acesso.
      const nextIndex = Math.min(removedIndex, nextSlides.length - 1);
      const nextSelected = nextSlides[nextIndex];
      return {
        ...state,
        slides: nextSlides,
        selectedSlideId: nextSelected ? nextSelected.id : null,
      };
    }

    case "MOVE_SLIDE": {
      const index = state.slides.findIndex((slide) => slide.id === action.id);
      // id inexistente: no-op.
      if (index === -1) return state;

      const targetIndex = action.direction === "up" ? index - 1 : index + 1;
      // No-op nas pontas: primeiro com "up" ou ultimo com "down".
      if (targetIndex < 0 || targetIndex >= state.slides.length) return state;

      const current = state.slides[index];
      const neighbor = state.slides[targetIndex];
      // Guarda de indice (noUncheckedIndexedAccess): nao deve ocorrer apos os
      // checks acima, mas mantem o narrowing honesto.
      if (!current || !neighbor) return state;

      // Troca os dois vizinhos; a selecao acompanha o slide (id estavel), nao muda.
      const nextSlides = [...state.slides];
      nextSlides[index] = neighbor;
      nextSlides[targetIndex] = current;
      return { ...state, slides: nextSlides };
    }

    case "UPDATE_SLIDE_BODY": {
      // Atualiza o body so do slide alvo; os outros ficam intactos.
      return {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.id ? { ...slide, body: action.body } : slide,
        ),
      };
    }

    case "SET_SLIDE_IMAGE": {
      // data-URL ja validada. Por-slide.
      return {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.id
            ? { ...slide, imageUrl: action.imageUrl }
            : slide,
        ),
      };
    }

    case "REMOVE_SLIDE_IMAGE": {
      // Preview volta a corpo 52 (derivado no <Slide>).
      return {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.id ? { ...slide, imageUrl: undefined } : slide,
        ),
      };
    }

    case "SET_TITLE": {
      // Aditivo (S3): so troca o titulo; nao toca identidade/slides/tema.
      return { ...state, title: action.title };
    }

    default: {
      // Exaustividade: se um novo tipo de action surgir sem case, o TS acusa aqui.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// --- Adaptador para o motor de render ----------------------------------------

/**
 * Converte (identidade + slide + tema) no SlideData que o <Slide> aceita. Isola a
 * S1: se o contrato SlideData mudar, so esta funcao muda. Pura — testavel.
 */
export function toSlideData(
  identity: CarouselIdentity,
  slide: EditorSlide,
  theme: SlideTheme,
): SlideData {
  return {
    name: identity.name,
    handle: identity.handle,
    avatarUrl: identity.avatarUrl,
    verified: identity.verified,
    body: slide.body,
    imageUrl: slide.imageUrl, // undefined => sem imagem (corpo 52)
    theme,
  };
}
