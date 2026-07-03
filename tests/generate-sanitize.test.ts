import { describe, it, expect } from "vitest";

// Testes da CAMADA 3 (rede de seguranca final) da geracao: sanitizacao de texto.
// Modulo PURO — sem API, sem DB, sem React. Deterministico.
//
// Prova (AC-7, edge "pede emojis/formatacao proibida"):
// - remove emojis (regra visual inviolavel), mesmo que a IA/usuario insista;
// - remove markdown/HTML de estilo (mantendo o texto puro);
// - normaliza paragrafos (colapsa 3+ quebras em \n\n) e faz trim;
// - preserva pt-BR/acentos e pontuacao normal (nao muti la o conteudo legitimo).

import { sanitizeGeneratedText } from "@/lib/generate-sanitize";

describe("sanitizeGeneratedText — remove emojis (AC-7)", () => {
  it("remove emoji de rosto do meio do texto", () => {
    const out = sanitizeGeneratedText("Vamos começar 🚀 agora");
    expect(out).not.toMatch(/🚀/u);
    expect(out).toContain("Vamos começar");
    expect(out).toContain("agora");
  });

  it("remove múltiplos emojis (pictogramas, símbolos, bandeiras)", () => {
    const out = sanitizeGeneratedText("Dica ✅ boa 🇧🇷 ideia ⭐ feita 🔥");
    // Nao deve sobrar nenhum caractere das faixas de emoji.
    expect(out).not.toMatch(
      /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u,
    );
    expect(out).toContain("Dica");
    expect(out).toContain("ideia");
    expect(out).toContain("feita");
  });

  it("mesmo com o texto pedindo emojis, o resultado sai sem emoji (edge case)", () => {
    // A intencao do usuario pode pedir emojis; a rede de seguranca os remove.
    const out = sanitizeGeneratedText("Use muitos emojis 😀😀😀 no texto 🎉");
    expect(out).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
  });

  it("um body que era só emojis vira string vazia (será descartado no mapping)", () => {
    const out = sanitizeGeneratedText("🚀🔥✨");
    expect(out).toBe("");
  });
});

describe("sanitizeGeneratedText — remove markdown/HTML (AC-7)", () => {
  it("remove marcadores de negrito/itálico mantendo o texto", () => {
    const out = sanitizeGeneratedText("Isto é **muito** _importante_");
    expect(out).toBe("Isto é muito importante");
  });

  it("remove crases de código inline mantendo o conteúdo", () => {
    const out = sanitizeGeneratedText("Use o comando `npm test` sempre");
    expect(out).toBe("Use o comando npm test sempre");
  });

  it("remove cabeçalho markdown (#) no início da linha", () => {
    const out = sanitizeGeneratedText("## Título grande");
    expect(out).toBe("Título grande");
  });

  it("remove tags HTML preservando o texto interno", () => {
    const out = sanitizeGeneratedText("Texto <strong>forte</strong> aqui");
    expect(out).toBe("Texto forte aqui");
  });

  it("remove tag de estilo/script sem deixar '<' solto", () => {
    const out = sanitizeGeneratedText("Antes <span class='x'>meio</span> depois");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("meio");
  });
});

describe("sanitizeGeneratedText — normaliza parágrafos e espaços (AC-7)", () => {
  it("colapsa 3+ quebras consecutivas em exatamente \\n\\n", () => {
    const out = sanitizeGeneratedText("Parágrafo um\n\n\n\nParágrafo dois");
    expect(out).toBe("Parágrafo um\n\nParágrafo dois");
  });

  it("preserva a separação padrão de parágrafo (\\n\\n)", () => {
    const out = sanitizeGeneratedText("Primeiro\n\nSegundo");
    expect(out).toBe("Primeiro\n\nSegundo");
  });

  it("faz trim das pontas do bloco inteiro", () => {
    const out = sanitizeGeneratedText("   texto com espaços   ");
    expect(out).toBe("texto com espaços");
  });

  it("colapsa espaços horizontais em excesso sem tocar quebras", () => {
    const out = sanitizeGeneratedText("palavra     com      espaços");
    expect(out).toBe("palavra com espaços");
  });

  it("preserva acentuação e pontuação normal do pt-BR", () => {
    const texto = "Atenção: você não vai acreditar. É simples, direto ao ponto!";
    expect(sanitizeGeneratedText(texto)).toBe(texto);
  });
});
