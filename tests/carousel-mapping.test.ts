import { describe, it, expect } from "vitest";

import {
  resolveIdentity,
  resolveTheme,
  rowToEditorState,
  identityToOverride,
  themeToOverride,
  slidesToRows,
  type ClientData,
  type CarouselData,
  type SlideData,
} from "@/lib/carousel-mapping";
import {
  DEFAULT_CAROUSEL_TITLE,
  type CarouselIdentity,
  type EditorSlide,
} from "@/lib/editor-state";

// Testes do adaptador PURO row<->EditorState (S3). Coracao testavel da persistencia:
// heranca de identidade por campo (null = herda do client), ordenacao de slides por
// position e conversao para overrides (sem materializar herdados). Sem I/O, sem banco.
// Fixtures deterministas (nenhum dado real de cliente).

// --- Builders de fixture (deterministas) -------------------------------------

/** Client padrao (marca default). Override pontual via `overrides`. */
function makeClient(overrides: Partial<ClientData> = {}): ClientData {
  return {
    name: "Sua Marca",
    handle: "suamarca",
    avatarUrl: "https://blob.example/avatar-client.png",
    verified: false,
    theme: "light",
    ...overrides,
  };
}

/** Linha `carousels` sem nenhum override (herda tudo). Override via `overrides`. */
function makeCarousel(overrides: Partial<CarouselData> = {}): CarouselData {
  return {
    id: "carousel-1",
    title: "Meu carrossel",
    overrideName: null,
    overrideHandle: null,
    overrideAvatarUrl: null,
    overrideVerified: null,
    overrideTheme: null,
    ...overrides,
  };
}

// =============================================================================
// resolveIdentity — heranca por campo (AC 10)
// =============================================================================
describe("resolveIdentity — heranca por campo (AC 10)", () => {
  it("nenhum override: herda TODOS os campos do client", () => {
    const client = makeClient();
    const carousel = makeCarousel();

    const identity = resolveIdentity(client, carousel);

    expect(identity).toEqual<CarouselIdentity>({
      name: "Sua Marca",
      handle: "suamarca",
      avatarUrl: "https://blob.example/avatar-client.png",
      verified: false,
    });
  });

  it("override TOTAL: usa todos os valores do carrossel, ignora o client", () => {
    const client = makeClient();
    const carousel = makeCarousel({
      overrideName: "Octavio",
      overrideHandle: "octaviosilva",
      overrideAvatarUrl: "https://blob.example/avatar-override.png",
      overrideVerified: true,
    });

    const identity = resolveIdentity(client, carousel);

    expect(identity).toEqual<CarouselIdentity>({
      name: "Octavio",
      handle: "octaviosilva",
      avatarUrl: "https://blob.example/avatar-override.png",
      verified: true,
    });
  });

  it("override PARCIAL: campo com override usa o carrossel; nulo herda do client", () => {
    const client = makeClient();
    // Só nome e verified sobrescritos; handle e avatar nulos (herdam).
    const carousel = makeCarousel({
      overrideName: "Octavio",
      overrideVerified: true,
    });

    const identity = resolveIdentity(client, carousel);

    expect(identity).toEqual<CarouselIdentity>({
      name: "Octavio", // override
      handle: "suamarca", // herdado
      avatarUrl: "https://blob.example/avatar-client.png", // herdado
      verified: true, // override
    });
  });

  it("override verified=false é distinto de null: false sobrescreve, não herda", () => {
    // Client verified=true; carousel força false. `?? ` não pode confundir false com null.
    const client = makeClient({ verified: true });
    const carousel = makeCarousel({ overrideVerified: false });

    const identity = resolveIdentity(client, carousel);

    expect(identity.verified).toBe(false);
  });
});

// =============================================================================
// resolveTheme (AC 10)
// =============================================================================
describe("resolveTheme", () => {
  it("sem override herda o tema do client", () => {
    expect(resolveTheme(makeClient({ theme: "dark" }), makeCarousel())).toBe(
      "dark",
    );
  });

  it("override de tema sobrescreve o do client", () => {
    const client = makeClient({ theme: "light" });
    const carousel = makeCarousel({ overrideTheme: "dark" });
    expect(resolveTheme(client, carousel)).toBe("dark");
  });

  it("normaliza valor inesperado do banco para 'light' (falha fechado)", () => {
    const client = makeClient({ theme: "roxo" });
    expect(resolveTheme(client, makeCarousel())).toBe("light");
  });
});

// =============================================================================
// rowToEditorState — montagem do estado (AC 17, 19)
// =============================================================================
describe("rowToEditorState — montagem do EditorState (AC 17, 19)", () => {
  it("ordena os slides por position, mesmo quando vêm fora de ordem", () => {
    const slides: SlideData[] = [
      { position: 2, body: "terceiro", imageUrl: null },
      { position: 0, body: "primeiro", imageUrl: null },
      { position: 1, body: "segundo", imageUrl: null },
    ];

    const state = rowToEditorState(makeClient(), makeCarousel(), slides);

    expect(state.slides.map((s) => s.body)).toEqual([
      "primeiro",
      "segundo",
      "terceiro",
    ]);
  });

  it("seleciona o PRIMEIRO slide (menor position) por padrão", () => {
    const slides: SlideData[] = [
      { position: 1, body: "b", imageUrl: null },
      { position: 0, body: "a", imageUrl: null },
    ];

    const state = rowToEditorState(makeClient(), makeCarousel(), slides);

    const firstId = state.slides[0]?.id;
    expect(state.selectedSlideId).toBe(firstId);
    expect(state.slides[0]?.body).toBe("a");
  });

  it("monta carouselId, título e identidade/tema resolvidos", () => {
    const client = makeClient({ theme: "dark" });
    const carousel = makeCarousel({
      id: "abc-123",
      title: "Título salvo",
      overrideName: "Octavio",
    });
    const slides: SlideData[] = [{ position: 0, body: "x", imageUrl: null }];

    const state = rowToEditorState(client, carousel, slides);

    expect(state.carouselId).toBe("abc-123");
    expect(state.title).toBe("Título salvo");
    expect(state.identity.name).toBe("Octavio"); // override
    expect(state.identity.handle).toBe("suamarca"); // herdado
    expect(state.theme).toBe("dark"); // herdado do client
  });

  it("imageUrl null no banco vira undefined no editor (presença define corpo 46/52)", () => {
    const slides: SlideData[] = [
      { position: 0, body: "com", imageUrl: "https://blob.example/img.png" },
      { position: 1, body: "sem", imageUrl: null },
    ];

    const state = rowToEditorState(makeClient(), makeCarousel(), slides);

    expect(state.slides[0]?.imageUrl).toBe("https://blob.example/img.png");
    expect(state.slides[1]?.imageUrl).toBeUndefined();
  });

  it("título vazio no banco cai no DEFAULT_CAROUSEL_TITLE", () => {
    const carousel = makeCarousel({ title: "" });
    const slides: SlideData[] = [{ position: 0, body: "x", imageUrl: null }];

    const state = rowToEditorState(makeClient(), carousel, slides);

    expect(state.title).toBe(DEFAULT_CAROUSEL_TITLE);
  });

  it("0 slides: shape vazio coerente (slides [], selectedSlideId null)", () => {
    const state = rowToEditorState(makeClient(), makeCarousel(), []);

    expect(state.slides).toHaveLength(0);
    expect(state.selectedSlideId).toBeNull();
  });

  it("não muta o array de slides de entrada (ordenação em cópia)", () => {
    const slides: SlideData[] = [
      { position: 1, body: "b", imageUrl: null },
      { position: 0, body: "a", imageUrl: null },
    ];
    const snapshot = slides.map((s) => s.position);

    rowToEditorState(makeClient(), makeCarousel(), slides);

    // A entrada continua na ordem original (funcao pura, sem side-effect).
    expect(slides.map((s) => s.position)).toEqual(snapshot);
  });

  it("gera ids estáveis por slide (cada EditorSlide tem id não vazio e único)", () => {
    const slides: SlideData[] = [
      { position: 0, body: "a", imageUrl: null },
      { position: 1, body: "b", imageUrl: null },
    ];

    const state = rowToEditorState(makeClient(), makeCarousel(), slides);
    const ids = state.slides.map((s) => s.id);

    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });
});

// =============================================================================
// identityToOverride — NÃO materializa herdados (edge "override parcial")
// =============================================================================
describe("identityToOverride — não materializa herdados (edge override parcial)", () => {
  it("campo IGUAL ao client vira null (herda; acompanha se o client mudar)", () => {
    const client = makeClient();
    // Identidade idêntica ao client -> nenhum override deve ser materializado.
    const identity: CarouselIdentity = {
      name: "Sua Marca",
      handle: "suamarca",
      avatarUrl: "https://blob.example/avatar-client.png",
      verified: false,
    };

    const override = identityToOverride(identity, client);

    expect(override).toEqual({
      overrideName: null,
      overrideHandle: null,
      overrideAvatarUrl: null,
      overrideVerified: null,
    });
  });

  it("campo DIFERENTE do client grava o valor; igual grava null (parcial)", () => {
    const client = makeClient();
    const identity: CarouselIdentity = {
      name: "Octavio", // diferente -> materializa
      handle: "suamarca", // igual -> null (herda)
      avatarUrl: "https://blob.example/novo.png", // diferente -> materializa
      verified: false, // igual -> null (herda)
    };

    const override = identityToOverride(identity, client);

    expect(override).toEqual({
      overrideName: "Octavio",
      overrideHandle: null,
      overrideAvatarUrl: "https://blob.example/novo.png",
      overrideVerified: null,
    });
  });

  it("verified diferente do client materializa mesmo sendo false", () => {
    // Client verified=true; identity verified=false -> deve gravar false (não null).
    const client = makeClient({ verified: true });
    const identity: CarouselIdentity = {
      name: "Sua Marca",
      handle: "suamarca",
      avatarUrl: "https://blob.example/avatar-client.png",
      verified: false,
    };

    const override = identityToOverride(identity, client);

    expect(override.overrideVerified).toBe(false);
  });

  it("round-trip: override -> resolve reproduz a identidade editada", () => {
    // Prova o par: converter para override e resolver de volta devolve o que foi editado.
    const client = makeClient();
    const edited: CarouselIdentity = {
      name: "Octavio",
      handle: "suamarca", // herdado
      avatarUrl: "https://blob.example/novo.png",
      verified: true,
    };

    const override = identityToOverride(edited, client);
    const carousel = makeCarousel({
      overrideName: override.overrideName,
      overrideHandle: override.overrideHandle,
      overrideAvatarUrl: override.overrideAvatarUrl,
      overrideVerified: override.overrideVerified,
    });

    expect(resolveIdentity(client, carousel)).toEqual(edited);
  });
});

// =============================================================================
// themeToOverride
// =============================================================================
describe("themeToOverride", () => {
  it("tema igual ao client vira null (herda)", () => {
    expect(themeToOverride("light", makeClient({ theme: "light" }))).toBeNull();
  });

  it("tema diferente do client materializa o valor", () => {
    expect(themeToOverride("dark", makeClient({ theme: "light" }))).toBe("dark");
  });
});

// =============================================================================
// slidesToRows — mantém a ordem do array (AC 16, 17)
// =============================================================================
describe("slidesToRows — position segue a ordem do array (AC 16, 17)", () => {
  it("position = índice do array (0-based), preservando a ordem", () => {
    const slides: EditorSlide[] = [
      { id: "a", body: "primeiro", imageUrl: undefined },
      { id: "b", body: "segundo", imageUrl: "https://blob.example/x.png" },
      { id: "c", body: "terceiro", imageUrl: undefined },
    ];

    const rows = slidesToRows(slides);

    expect(rows).toEqual([
      { position: 0, body: "primeiro", imageUrl: null },
      { position: 1, body: "segundo", imageUrl: "https://blob.example/x.png" },
      { position: 2, body: "terceiro", imageUrl: null },
    ]);
  });

  it("undefined no editor vira null no banco (imageUrl ausente)", () => {
    const slides: EditorSlide[] = [{ id: "a", body: "x", imageUrl: undefined }];
    expect(slidesToRows(slides)[0]?.imageUrl).toBeNull();
  });

  it("reordenar o array muda as positions (replace-all persiste a nova ordem)", () => {
    const slides: EditorSlide[] = [
      { id: "b", body: "b", imageUrl: undefined },
      { id: "a", body: "a", imageUrl: undefined },
    ];

    const rows = slidesToRows(slides);

    // A ordem do array (b, a) vira position 0=b, 1=a.
    expect(rows.map((r) => r.body)).toEqual(["b", "a"]);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
  });
});
