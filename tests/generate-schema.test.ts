import { describe, it, expect } from "vitest";

// Testes da defesa CAMADA 2 (Zod NOSSO) da geracao com IA (S5). Modulo NEUTRO
// (sem server-only) — importavel em jsdom, sem API, sem DB. Deterministico.
//
// Prova que:
// - GenerateInputSchema rejeita intencao vazia/curta (<10) e longa (>1000) na
//   BORDA, antes de gastar chamada a API (edge cases da story; AC-2).
// - GeneratedCarouselSchema revalida a saida da IA: aceita estrutura valida e
//   rejeita estrutura ruim (sem slides, campos faltando, tamanhos fora do range).
//   Essa camada rejeita "nº de slides absurdo / JSON malformado" => GENERATION_FAILED
//   (AC-9, edge "nº absurdo"). O schema da API nao honra min/max — aqui e a verdade.

import {
  GenerateInputSchema,
  GeneratedCarouselSchema,
} from "@/lib/actions/generate-types";

// --- Helpers de fixture (nunca dado real de cliente) -------------------------

/** Estrutura de saida da IA bem formada; sobrescreve campos por caso. */
function validGenerated(overrides: Record<string, unknown> = {}) {
  return {
    title: "Como começar no marketing",
    slides: [
      { body: "Primeiro slide com conteúdo.", suggestImage: false },
      { body: "Segundo slide, aqui cabe imagem.", suggestImage: true },
    ],
    ...overrides,
  };
}

// =============================================================================
// GenerateInputSchema — borda do input (AC-2, edge "vazia/curta/longa")
// =============================================================================
describe("GenerateInputSchema — validação da intenção na borda (AC-2)", () => {
  it("aceita intenção dentro do limite [10, 1000]", () => {
    const result = GenerateInputSchema.safeParse({
      intent: "Quero um carrossel sobre produtividade para founders.",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita intenção vazia (string vazia)", () => {
    const result = GenerateInputSchema.safeParse({ intent: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita intenção só com espaços (trim => vazia)", () => {
    // trim() no schema: espaco puro nao satisfaz min(10) — nao chama a API.
    const result = GenerateInputSchema.safeParse({ intent: "          " });
    expect(result.success).toBe(false);
  });

  it("rejeita intenção curta demais (9 chars, abaixo do min 10)", () => {
    const result = GenerateInputSchema.safeParse({ intent: "123456789" });
    expect(result.success).toBe(false);
  });

  it("aceita intenção exatamente no mínimo (10 chars)", () => {
    const result = GenerateInputSchema.safeParse({ intent: "1234567890" });
    expect(result.success).toBe(true);
  });

  it("aceita intenção exatamente no máximo (1000 chars)", () => {
    const result = GenerateInputSchema.safeParse({ intent: "a".repeat(1000) });
    expect(result.success).toBe(true);
  });

  it("rejeita intenção acima do limite (1001 chars, teto de custo/abuso)", () => {
    const result = GenerateInputSchema.safeParse({ intent: "a".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("rejeita intent ausente", () => {
    const result = GenerateInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita intent não-string (número)", () => {
    const result = GenerateInputSchema.safeParse({ intent: 12345678901 });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// GeneratedCarouselSchema — revalidacao da saida da IA (AC-9, edge "nº absurdo")
// =============================================================================
describe("GeneratedCarouselSchema — estrutura válida aceita", () => {
  it("aceita título + slides bem formados", () => {
    const result = GeneratedCarouselSchema.safeParse(validGenerated());
    expect(result.success).toBe(true);
  });

  it("aceita exatamente 1 slide (mínimo)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: [{ body: "único slide", suggestImage: false }] }),
    );
    expect(result.success).toBe(true);
  });

  it("aceita exatamente 10 slides (máximo)", () => {
    const slides = Array.from({ length: 10 }, (_, i) => ({
      body: `slide ${i}`,
      suggestImage: false,
    }));
    const result = GeneratedCarouselSchema.safeParse(validGenerated({ slides }));
    expect(result.success).toBe(true);
  });

  it("aceita body exatamente com 2000 chars (teto alinhado ao slideInputSchema)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: [{ body: "a".repeat(2000), suggestImage: false }] }),
    );
    expect(result.success).toBe(true);
  });
});

describe("GeneratedCarouselSchema — estrutura ruim rejeitada (AC-9)", () => {
  it("rejeita 0 slides (array vazio, nº absurdo)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: [] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 10 slides (11, nº excessivo)", () => {
    const slides = Array.from({ length: 11 }, (_, i) => ({
      body: `slide ${i}`,
      suggestImage: false,
    }));
    const result = GeneratedCarouselSchema.safeParse(validGenerated({ slides }));
    expect(result.success).toBe(false);
  });

  it("rejeita body acima de 2000 chars (2001)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: [{ body: "a".repeat(2001), suggestImage: false }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita body vazio (min 1)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: [{ body: "", suggestImage: false }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita título vazio (min 1)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ title: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita título acima de 120 chars (max)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ title: "a".repeat(121) }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita slide sem suggestImage (campo faltando)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: [{ body: "sem flag" }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita suggestImage não-booleano", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: [{ body: "x", suggestImage: "sim" }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita slides ausente (JSON malformado)", () => {
    const result = GeneratedCarouselSchema.safeParse({ title: "só título" });
    expect(result.success).toBe(false);
  });

  it("rejeita slide como string solta (JSON fora do contrato)", () => {
    const result = GeneratedCarouselSchema.safeParse(
      validGenerated({ slides: ["não é objeto"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita payload nulo (parsed_output null tratado antes; defesa extra)", () => {
    const result = GeneratedCarouselSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});
