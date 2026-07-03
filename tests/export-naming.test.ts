import { describe, it, expect } from "vitest";

import {
  slidePngName,
  slugifyTitle,
  zipFileName,
} from "@/lib/export-png";

// Unit puro dos helpers de nomeacao (sem browser, deterministicos, baratos).
// Cobrem o AC "nomeacao ordenada slide-NN.png com zero-pad" e o AC
// "<titulo-slug>.zip / carrossel.zip" + edge de titulo com caracteres especiais.

describe("slidePngName — zero-pad de 2 digitos, 1-based", () => {
  it("indice 0 -> slide-01.png (primeiro slide)", () => {
    expect(slidePngName(0)).toBe("slide-01.png");
  });

  it("indice 8 -> slide-09.png (ultimo de 1 digito)", () => {
    expect(slidePngName(8)).toBe("slide-09.png");
  });

  it("indice 9 -> slide-10.png (transicao para 2 digitos)", () => {
    expect(slidePngName(9)).toBe("slide-10.png");
  });

  it("indice 19 -> slide-20.png (carrossel longo, dezenas)", () => {
    expect(slidePngName(19)).toBe("slide-20.png");
  });

  it("gera nomes lexicograficamente ordenaveis para 12 slides", () => {
    // A ordenacao lexicografica dos nomes deve bater com a ordem dos indices —
    // e o que garante a "mesma ordem do array" dentro do ZIP.
    const names = Array.from({ length: 12 }, (_, i) => slidePngName(i));
    const sorted = [...names].sort();
    expect(sorted).toEqual(names);
    expect(names[0]).toBe("slide-01.png");
    expect(names[11]).toBe("slide-12.png");
  });
});

describe("slugifyTitle — slug seguro para nome de arquivo", () => {
  it("minusculiza e troca espacos por hifen", () => {
    expect(slugifyTitle("Meu Carrossel")).toBe("meu-carrossel");
  });

  it("remove acentos (NFD) preservando as letras base", () => {
    expect(slugifyTitle("Ação e Coração")).toBe("acao-e-coracao");
  });

  it("colapsa multiplos separadores/simbolos em um unico hifen", () => {
    expect(slugifyTitle("Meu   Título!!!")).toBe("meu-titulo");
  });

  it("apara hifens das pontas", () => {
    expect(slugifyTitle("  -- Olá -- ")).toBe("ola");
  });

  it("titulo apenas com simbolos resulta em string vazia", () => {
    expect(slugifyTitle("!!! @#$ ???")).toBe("");
  });

  it("titulo apenas com acento/diacritico isolado resulta em vazio", () => {
    // Diacriticos combinantes puros sem letra base viram vazio apos remocao.
    expect(slugifyTitle("̀́̂")).toBe("");
  });

  it("string vazia -> vazia", () => {
    expect(slugifyTitle("")).toBe("");
  });

  it("preserva digitos", () => {
    expect(slugifyTitle("Top 10 Dicas")).toBe("top-10-dicas");
  });
});

describe("zipFileName — nome final do ZIP com fallback", () => {
  it("titulo comum -> <slug>.zip", () => {
    expect(zipFileName("Meu Título!")).toBe("meu-titulo.zip");
  });

  it("titulo com acento -> slug sem acento .zip", () => {
    expect(zipFileName("Estratégia de Vendas")).toBe("estrategia-de-vendas.zip");
  });

  it("undefined -> carrossel.zip (sem titulo)", () => {
    expect(zipFileName(undefined)).toBe("carrossel.zip");
  });

  it("string vazia -> carrossel.zip", () => {
    expect(zipFileName("")).toBe("carrossel.zip");
  });

  it("titulo so de simbolos (slug vazio) -> carrossel.zip", () => {
    expect(zipFileName("!!! ???")).toBe("carrossel.zip");
  });

  it("titulo so de espacos -> carrossel.zip", () => {
    expect(zipFileName("     ")).toBe("carrossel.zip");
  });
});
