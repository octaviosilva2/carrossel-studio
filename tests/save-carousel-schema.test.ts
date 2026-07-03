import { describe, it, expect } from "vitest";

import {
  SaveCarouselSchema,
  type SaveCarouselInput,
} from "@/lib/actions/carousel-types";

// Testes da borda Zod do payload de saveCarousel (AC 22). Modulo NEUTRO (sem
// server-only) — importavel em jsdom. Prova que entrada malformada e rejeitada
// ANTES de qualquer efeito colateral e que payload valido passa. Deterministico.

// UUID valido reutilizavel (nunca dado real).
const VALID_UUID = "11111111-1111-4111-8111-111111111111";

/** Payload base valido. Sobrescreve campos pontuais para cada caso de erro. */
function validInput(overrides: Partial<SaveCarouselInput> = {}): SaveCarouselInput {
  return {
    id: VALID_UUID,
    title: "Meu carrossel",
    theme: "light",
    identity: {
      name: "Octavio",
      handle: "octaviosilva",
      avatarUrl: "https://blob.example/avatar.png",
      verified: true,
    },
    slides: [
      { body: "primeiro slide" },
      { body: "segundo", imageUrl: "https://blob.example/img.png" },
    ],
    ...overrides,
  };
}

describe("SaveCarouselSchema — payload válido (AC 22)", () => {
  it("aceita um payload completo e bem formado", () => {
    const result = SaveCarouselSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("aceita slide sem imageUrl (campo opcional)", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({ slides: [{ body: "sem imagem" }] }),
    );
    expect(result.success).toBe(true);
  });

  it("aceita body vazio no slide (string vazia é permitida, min 1 é só nos slides)", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({ slides: [{ body: "" }] }),
    );
    expect(result.success).toBe(true);
  });

  it("aceita avatarUrl como data-URL (placeholder) — min(1), não exige url", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({
        identity: {
          name: "x",
          handle: "y",
          avatarUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
          verified: false,
        },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("SaveCarouselSchema — entrada malformada rejeitada (AC 22)", () => {
  it("rejeita id que não é UUID", () => {
    const result = SaveCarouselSchema.safeParse(validInput({ id: "nao-uuid" }));
    expect(result.success).toBe(false);
  });

  it("rejeita title vazio (min 1)", () => {
    const result = SaveCarouselSchema.safeParse(validInput({ title: "" }));
    expect(result.success).toBe(false);
  });

  it("rejeita title acima de 120 caracteres (max)", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({ title: "a".repeat(121) }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita theme fora do enum ('sepia')", () => {
    const result = SaveCarouselSchema.safeParse(
      // @ts-expect-error — theme inválido de propósito (borda externa não confia no tipo)
      validInput({ theme: "sepia" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita slides vazio (min 1)", () => {
    const result = SaveCarouselSchema.safeParse(validInput({ slides: [] }));
    expect(result.success).toBe(false);
  });

  it("rejeita imageUrl que não é URL válida", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({ slides: [{ body: "x", imageUrl: "nao-e-url" }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita avatarUrl vazio (min 1 — nunca '')", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({
        identity: {
          name: "x",
          handle: "y",
          avatarUrl: "",
          verified: false,
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita identity ausente", () => {
    const bad = validInput();
    // Remove um campo obrigatório para simular payload corrompido do client.
    // @ts-expect-error — apagando identity de propósito
    delete bad.identity;
    const result = SaveCarouselSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejeita verified não-booleano", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({
        identity: {
          name: "x",
          handle: "y",
          avatarUrl: "https://blob.example/a.png",
          // @ts-expect-error — verified inválido de propósito
          verified: "sim",
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita body de slide acima de 2000 caracteres (max)", () => {
    const result = SaveCarouselSchema.safeParse(
      validInput({ slides: [{ body: "a".repeat(2001) }] }),
    );
    expect(result.success).toBe(false);
  });
});
