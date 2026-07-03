import { describe, it, expect } from "vitest";

// Testes do MAPEAMENTO da estrutura gerada -> linhas de slide (S5). Modulo PURO —
// sem API, sem DB. Deterministico. Cobre:
// - AC-5: suggestImage:true acrescenta a dica textual no body (SEM preencher imageUrl);
// - AC-3/contrato: as linhas geradas atravessam rowToEditorState e viram EditorSlide
//   validos (id gerado, imageUrl undefined) — sem quebrar SlideData/EditorSlide;
// - descarte de bodies vazios apos sanitizar + reindex de position;
// - 0 slides uteis => null (a action trata como GENERATION_FAILED, nao cria carrossel).

import {
  mapGeneratedToSlideRows,
  IMAGE_HINT,
  type MappedGeneratedCarousel,
} from "@/lib/generate-sanitize";
import { rowToEditorState } from "@/lib/carousel-mapping";
import type { GeneratedCarousel } from "@/lib/actions/generate-types";

// --- Fixtures ----------------------------------------------------------------

function generated(overrides: Partial<GeneratedCarousel> = {}): GeneratedCarousel {
  return {
    title: "Meu carrossel gerado",
    slides: [
      { body: "Primeiro slide.", suggestImage: false },
      { body: "Segundo slide.", suggestImage: false },
    ],
    ...overrides,
  };
}

/** Client minimo para atravessar rowToEditorState (nao dado real). */
function clientData() {
  return {
    name: "Marca",
    handle: "marca",
    avatarUrl: "https://blob.example/a.png",
    verified: false,
    theme: "light",
  };
}

/** Carousel data minimo (overrides null => herda). */
function carouselData(title: string) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title,
    overrideName: null,
    overrideHandle: null,
    overrideAvatarUrl: null,
    overrideVerified: null,
    overrideTheme: null,
  };
}

/** Afirma que o mapeamento nao e null (satisfaz noUncheckedIndexedAccess). */
function unwrap(mapped: MappedGeneratedCarousel | null): MappedGeneratedCarousel {
  expect(mapped).not.toBeNull();
  return mapped as MappedGeneratedCarousel;
}

/** Le uma linha por indice, afirmando presenca (index pode ser undefined). */
function rowAt(mapped: MappedGeneratedCarousel, i: number) {
  const row = mapped.slides[i];
  expect(row).toBeDefined();
  return row!;
}

// =============================================================================
// AC-5 — dica de imagem no body, sem imageUrl
// =============================================================================
describe("mapGeneratedToSlideRows — sinal de imagem (AC-5)", () => {
  it("acrescenta a dica textual ao body quando suggestImage=true", () => {
    const mapped = unwrap(
      mapGeneratedToSlideRows(
        generated({
          slides: [{ body: "Slide com imagem.", suggestImage: true }],
        }),
      ),
    );
    expect(rowAt(mapped, 0).body).toContain(IMAGE_HINT);
    // A dica vem ao final, separada por paragrafo.
    expect(rowAt(mapped, 0).body).toBe(`Slide com imagem.\n\n${IMAGE_HINT}`);
  });

  it("NÃO acrescenta a dica quando suggestImage=false", () => {
    const mapped = unwrap(
      mapGeneratedToSlideRows(
        generated({
          slides: [{ body: "Slide sem imagem.", suggestImage: false }],
        }),
      ),
    );
    expect(rowAt(mapped, 0).body).not.toContain(IMAGE_HINT);
  });

  it("nunca preenche imageUrl — imagem é upload manual (AC-5)", () => {
    const mapped = unwrap(
      mapGeneratedToSlideRows(
        generated({
          slides: [
            { body: "Com sugestão.", suggestImage: true },
            { body: "Sem sugestão.", suggestImage: false },
          ],
        }),
      ),
    );
    // TODAS as linhas com imageUrl null (a IA nao decide imagem, so sinaliza).
    for (const row of mapped.slides) {
      expect(row.imageUrl).toBeNull();
    }
  });
});

// =============================================================================
// Sanitizacao aplicada + descarte + reindex de position
// =============================================================================
describe("mapGeneratedToSlideRows — sanitiza, descarta e reindexa", () => {
  it("sanitiza title e bodies (remove emoji/markdown)", () => {
    const mapped = unwrap(
      mapGeneratedToSlideRows(
        generated({
          title: "Título **forte** 🚀",
          slides: [{ body: "Corpo _limpo_ 🔥", suggestImage: false }],
        }),
      ),
    );
    expect(mapped.title).toBe("Título forte");
    expect(rowAt(mapped, 0).body).toBe("Corpo limpo");
  });

  it("descarta slide cujo body zera após sanitizar (só emojis) e reindexa position", () => {
    const mapped = unwrap(
      mapGeneratedToSlideRows(
        generated({
          slides: [
            { body: "Slide válido A", suggestImage: false },
            { body: "🚀🔥✨", suggestImage: false }, // vira vazio => descartado
            { body: "Slide válido B", suggestImage: false },
          ],
        }),
      ),
    );
    expect(mapped.slides).toHaveLength(2);
    // position sem furos apos o descarte (0, 1).
    expect(mapped.slides.map((s) => s.position)).toEqual([0, 1]);
    expect(rowAt(mapped, 0).body).toBe("Slide válido A");
    expect(rowAt(mapped, 1).body).toBe("Slide válido B");
  });

  it("position segue a ordem dos slides (0-based, sem furos)", () => {
    const mapped = unwrap(
      mapGeneratedToSlideRows(
        generated({
          slides: [
            { body: "um", suggestImage: false },
            { body: "dois", suggestImage: false },
            { body: "três", suggestImage: false },
          ],
        }),
      ),
    );
    expect(mapped.slides.map((s) => s.position)).toEqual([0, 1, 2]);
  });
});

// =============================================================================
// 0 slides uteis / titulo vazio => null (nao cria carrossel quebrado, AC-9)
// =============================================================================
describe("mapGeneratedToSlideRows — nada utilizável => null", () => {
  it("retorna null quando todos os bodies zeram após sanitizar", () => {
    const mapped = mapGeneratedToSlideRows(
      generated({
        slides: [
          { body: "🚀", suggestImage: false },
          { body: "🔥", suggestImage: false },
        ],
      }),
    );
    expect(mapped).toBeNull();
  });

  it("retorna null quando o título zera após sanitizar", () => {
    const mapped = mapGeneratedToSlideRows(
      generated({ title: "🚀🔥", slides: [{ body: "ok", suggestImage: false }] }),
    );
    expect(mapped).toBeNull();
  });
});

// =============================================================================
// AC-3 / contrato — linhas geradas viram EditorSlide validos via rowToEditorState
// =============================================================================
describe("mapeamento p/ EditorSlide via rowToEditorState (AC-3, contrato)", () => {
  it("linhas geradas produzem EditorSlide com id gerado e imageUrl undefined", () => {
    const mapped = unwrap(
      mapGeneratedToSlideRows(
        generated({
          title: "Carrossel IA",
          slides: [
            { body: "Slide 1", suggestImage: false },
            { body: "Slide 2", suggestImage: true },
          ],
        }),
      ),
    );

    // Aterrissagem no editor: getCarousel -> rowToEditorState converte as linhas.
    // imageUrl null no banco => undefined no editor (contrato EditorSlide).
    const state = rowToEditorState(
      clientData(),
      carouselData(mapped.title),
      mapped.slides.map((s) => ({
        position: s.position,
        body: s.body,
        imageUrl: s.imageUrl, // null
      })),
    );

    expect(state.slides).toHaveLength(2);
    for (const slide of state.slides) {
      // id gerado (nao vazio), body preservado, imageUrl undefined (nao null).
      expect(typeof slide.id).toBe("string");
      expect(slide.id.length).toBeGreaterThan(0);
      expect(slide.imageUrl).toBeUndefined();
    }
    const first = state.slides[0];
    const second = state.slides[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // O slide sinalizado carrega a dica no body (visivel no editor).
    expect(second!.body).toContain(IMAGE_HINT);
    // Selecao no primeiro slide (invariante do editor).
    expect(state.selectedSlideId).toBe(first!.id);
    // Titulo herdado do carrossel gerado.
    expect(state.title).toBe("Carrossel IA");
  });
});
