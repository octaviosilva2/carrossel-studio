import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes da SERVER ACTION generateCarousel (S5) com a FRONTEIRA ANTHROPIC MOCKADA
// (mocking-estrategico: mockar so a fronteira externa cara/instavel; NUNCA chamar a
// Claude API real). Mockamos tambem a persistencia (createGeneratedCarousel), o guard
// de sessao (requireUser) e next/navigation (redirect). jsdom nao conecta a Postgres
// nem a Anthropic — o valor testavel aqui e a ORQUESTRACAO:
//
// - caminho feliz: intencao valida -> requestGeneration -> mapeia -> persiste (ownerId
//   da sessao, dentro da action de escrita) -> redirect("/editor?id=") (AC-2, AC-3);
// - erro chave ausente: requestGeneration lanca NOT_CONFIGURED -> nada persiste (AC-10);
// - refusal / JSON fora do contrato: requestGeneration lanca GENERATION_FAILED -> nada
//   persiste, nenhum carrossel quebrado (AC-9, edge "refusal"/"nº absurdo");
// - input invalido: INVALID_INPUT SEM chamar a fronteira Anthropic (AC-2, edge "curta/longa");
// - authz/sessao: sem sessao, requireUser barra ANTES de chamar a API (AC-1).

// --- Mock da fronteira Anthropic (requestGeneration) -------------------------
// Isolada em @/lib/claude (server-only). Mockamos o modulo inteiro para nao arrastar
// o SDK Anthropic nem env para o jsdom. O comportamento e reconfiguravel por teste.
const { requestGenerationMock } = vi.hoisted(() => ({
  requestGenerationMock: vi.fn(),
}));

vi.mock("@/lib/claude", () => ({
  requestGeneration: (intent: string) => requestGenerationMock(intent),
}));

// --- Mock da persistencia (createGeneratedCarousel) --------------------------
// createGeneratedCarousel importa @/db (server) — mockamos a action de escrita para
// isolar a orquestracao. Capturamos o argumento para provar o que seria persistido.
const { createGeneratedCarouselMock } = vi.hoisted(() => ({
  createGeneratedCarouselMock: vi.fn(),
}));

vi.mock("@/lib/actions/carousels", () => ({
  createGeneratedCarousel: (mapped: unknown) => createGeneratedCarouselMock(mapped),
}));

// --- Mock do guard de sessao -------------------------------------------------
const SESSION_USER_ID = "session-user-123";
const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));

vi.mock("@/lib/auth-guard", () => ({
  requireUser: () => requireUserMock(),
}));

// --- Mock do next/navigation (redirect lanca no Next) ------------------------
const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(public readonly url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectError";
    }
  }
  return { RedirectError };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

import { generateCarousel, generateForEditor } from "@/lib/actions/generate";
import {
  GenerateError,
  isGenerateError,
  type GeneratedCarousel,
} from "@/lib/actions/generate-types";

const NEW_CAROUSEL_ID = "22222222-2222-4222-8222-222222222222";

/** Estrutura de saida "boa" que a fronteira Anthropic devolveria (ja validada). */
function goodGenerated(): GeneratedCarousel {
  return {
    title: "Carrossel gerado",
    slides: [
      { body: "Primeiro slide.", suggestImage: false },
      { body: "Segundo slide.", suggestImage: true },
    ],
  };
}

const validIntent = "Quero um carrossel sobre produtividade para founders.";

beforeEach(() => {
  requestGenerationMock.mockReset();
  createGeneratedCarouselMock.mockReset();
  requireUserMock.mockReset();
  // Por padrao: usuario logado.
  requireUserMock.mockResolvedValue({
    id: SESSION_USER_ID,
    email: "admin@example.com",
    name: "Admin",
  });
  // Por padrao: persistencia devolve o id do carrossel novo.
  createGeneratedCarouselMock.mockResolvedValue({ id: NEW_CAROUSEL_ID });
});

// =============================================================================
// Caminho feliz (AC-2, AC-3)
// =============================================================================
describe("generateCarousel — caminho feliz (AC-2, AC-3)", () => {
  it("intenção válida => gera, persiste e redireciona ao editor com o novo id", async () => {
    requestGenerationMock.mockResolvedValue(goodGenerated());

    // Sucesso lanca RedirectError (redirect() do Next). Capturamos a URL.
    const err = await generateCarousel({ intent: validIntent }).catch((e) => e);
    expect(err).toBeInstanceOf(RedirectError);
    expect((err as InstanceType<typeof RedirectError>).url).toBe(
      `/editor?id=${NEW_CAROUSEL_ID}`,
    );

    // A fronteira foi chamada com a intencao (nao vazou nada estranho).
    expect(requestGenerationMock).toHaveBeenCalledWith(validIntent);
    // E a persistencia recebeu a estrutura mapeada exatamente uma vez.
    expect(createGeneratedCarouselMock).toHaveBeenCalledTimes(1);
  });

  it("persiste a estrutura sanitizada/mapeada (title + slides com position 0-based)", async () => {
    requestGenerationMock.mockResolvedValue(goodGenerated());

    await generateCarousel({ intent: validIntent }).catch(() => {});

    const firstCall = createGeneratedCarouselMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const mapped = firstCall![0] as {
      title: string;
      slides: { position: number; body: string; imageUrl: null }[];
    };
    expect(mapped.title).toBe("Carrossel gerado");
    expect(mapped.slides).toHaveLength(2);
    expect(mapped.slides.map((s) => s.position)).toEqual([0, 1]);
    // Sinal de imagem virou dica no body do slide 2; imageUrl nunca preenchido.
    const signaled = mapped.slides[1];
    expect(signaled).toBeDefined();
    expect(signaled!.body).toContain("[Sugestão: adicione uma imagem");
    for (const s of mapped.slides) expect(s.imageUrl).toBeNull();
  });

  it("authz: persiste via createGeneratedCarousel (ownerId da sessão vem de dentro dela)", async () => {
    // A action delega a escrita a createGeneratedCarousel, que aplica requireUser +
    // ownerId da sessao internamente (coberto em carousel-actions.test.ts). Aqui
    // provamos que a action SEMPRE roteia a persistencia por essa funcao — nunca
    // insere direto sem o guard de dono.
    requestGenerationMock.mockResolvedValue(goodGenerated());
    await generateCarousel({ intent: validIntent }).catch(() => {});
    expect(createGeneratedCarouselMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Erros tratados (AC-9, AC-10) — nenhum carrossel quebrado criado
// =============================================================================
describe("generateCarousel — erros da fronteira Anthropic tratados (AC-9, AC-10)", () => {
  it("chave ausente (NOT_CONFIGURED) propaga o código e NÃO persiste (AC-10)", async () => {
    requestGenerationMock.mockRejectedValue(new GenerateError("NOT_CONFIGURED"));

    const err = await generateCarousel({ intent: validIntent }).catch((e) => e);
    expect(isGenerateError(err)).toBe(true);
    expect((err as GenerateError).code).toBe("NOT_CONFIGURED");
    expect(createGeneratedCarouselMock).not.toHaveBeenCalled();
  });

  it("refusal (GENERATION_FAILED) propaga o código e NÃO persiste (AC-9, edge refusal)", async () => {
    // A fronteira ja traduz stop_reason:refusal -> GenerateError("GENERATION_FAILED").
    requestGenerationMock.mockRejectedValue(new GenerateError("GENERATION_FAILED"));

    const err = await generateCarousel({ intent: validIntent }).catch((e) => e);
    expect(isGenerateError(err)).toBe(true);
    expect((err as GenerateError).code).toBe("GENERATION_FAILED");
    expect(createGeneratedCarouselMock).not.toHaveBeenCalled();
  });

  it("JSON/estrutura inválida da IA (GENERATION_FAILED) => não abre editor, nada persistido", async () => {
    // Fronteira rejeita saida fora do contrato apos revalidacao Zod.
    requestGenerationMock.mockRejectedValue(new GenerateError("GENERATION_FAILED"));

    const err = await generateCarousel({ intent: validIntent }).catch((e) => e);
    expect((err as GenerateError).code).toBe("GENERATION_FAILED");
    // Nenhum redirect (nao aterrissou no editor) e nenhuma persistencia.
    expect(err).not.toBeInstanceOf(RedirectError);
    expect(createGeneratedCarouselMock).not.toHaveBeenCalled();
  });

  it("saída que sanitiza para 0 slides úteis => GENERATION_FAILED, sem persistir", async () => {
    // A IA passou pelo Zod, mas todos os bodies eram so emojis => mapping retorna null.
    requestGenerationMock.mockResolvedValue({
      title: "Título ok",
      slides: [
        { body: "🚀", suggestImage: false },
        { body: "🔥", suggestImage: false },
      ],
    } as GeneratedCarousel);

    const err = await generateCarousel({ intent: validIntent }).catch((e) => e);
    expect(isGenerateError(err)).toBe(true);
    expect((err as GenerateError).code).toBe("GENERATION_FAILED");
    expect(createGeneratedCarouselMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Input invalido (AC-2, edge "vazia/curta/longa") — nao chama a fronteira
// =============================================================================
describe("generateCarousel — input inválido barrado na borda (AC-2)", () => {
  it("intenção curta (<10) => INVALID_INPUT SEM chamar a Claude API", async () => {
    const err = await generateCarousel({ intent: "curta" }).catch((e) => e);
    expect(isGenerateError(err)).toBe(true);
    expect((err as GenerateError).code).toBe("INVALID_INPUT");
    // A fronteira Anthropic NUNCA foi tocada (economia + seguranca).
    expect(requestGenerationMock).not.toHaveBeenCalled();
    expect(createGeneratedCarouselMock).not.toHaveBeenCalled();
  });

  it("intenção vazia => INVALID_INPUT sem chamar a API", async () => {
    const err = await generateCarousel({ intent: "" }).catch((e) => e);
    expect((err as GenerateError).code).toBe("INVALID_INPUT");
    expect(requestGenerationMock).not.toHaveBeenCalled();
  });

  it("intenção longa (>1000) => INVALID_INPUT sem chamar a API", async () => {
    const err = await generateCarousel({ intent: "a".repeat(1001) }).catch((e) => e);
    expect((err as GenerateError).code).toBe("INVALID_INPUT");
    expect(requestGenerationMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Barreira de sessao (AC-1) — sem sessao, nao chega a Claude API
// =============================================================================
describe("generateCarousel — barreira de sessão (AC-1)", () => {
  it("sem sessão, requireUser redireciona e a Claude API nunca é chamada", async () => {
    // Simula a implementacao real: sem sessao, requireUser lanca (redirect /login).
    requireUserMock.mockRejectedValue(new RedirectError("/login"));

    const err = await generateCarousel({ intent: validIntent }).catch((e) => e);
    expect(err).toBeInstanceOf(RedirectError);
    expect((err as InstanceType<typeof RedirectError>).url).toBe("/login");
    // Nem a fronteira Anthropic nem a persistencia rodaram.
    expect(requestGenerationMock).not.toHaveBeenCalled();
    expect(createGeneratedCarouselMock).not.toHaveBeenCalled();
  });

  it("requireUser é chamado antes de qualquer chamada à API", async () => {
    requestGenerationMock.mockResolvedValue(goodGenerated());
    await generateCarousel({ intent: validIntent }).catch(() => {});
    expect(requireUserMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// generateForEditor (ADR 0004) — mesma defesa em camadas, mas DEVOLVE o
// resultado (uniao) em vez de persistir/redirecionar. O assistente do editor
// aplica no carrossel aberto; erro vira `{ ok:false, code }` (sem throw).
// =============================================================================
describe("generateForEditor — devolve resultado ao editor (não persiste)", () => {
  it("intenção válida => { ok:true } com title + slides, SEM persistir nem redirecionar", async () => {
    requestGenerationMock.mockResolvedValue(goodGenerated());

    const result = await generateForEditor({ intent: validIntent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe("Carrossel gerado");
      expect(result.slides.map((s) => s.body)).toEqual([
        "Primeiro slide.",
        expect.stringContaining("Segundo slide."),
      ]);
      // Slide 2 sinalizou imagem: a dica textual entra no body (sem imageUrl).
      expect(result.slides[1]?.body).toContain("[Sugestão: adicione uma imagem");
    }
    // NÃO cria carrossel novo (diferente de generateCarousel).
    expect(createGeneratedCarouselMock).not.toHaveBeenCalled();
    // A fronteira foi chamada com a intenção.
    expect(requestGenerationMock).toHaveBeenCalledWith(validIntent);
  });

  it("intenção curta (<10) => { ok:false, INVALID_INPUT } SEM chamar a API", async () => {
    const result = await generateForEditor({ intent: "curta" });
    expect(result).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(requestGenerationMock).not.toHaveBeenCalled();
  });

  it("chave ausente => { ok:false, NOT_CONFIGURED }", async () => {
    requestGenerationMock.mockRejectedValue(new GenerateError("NOT_CONFIGURED"));
    const result = await generateForEditor({ intent: validIntent });
    expect(result).toEqual({ ok: false, code: "NOT_CONFIGURED" });
  });

  it("refusal/JSON inválido => { ok:false, GENERATION_FAILED }", async () => {
    requestGenerationMock.mockRejectedValue(
      new GenerateError("GENERATION_FAILED"),
    );
    const result = await generateForEditor({ intent: validIntent });
    expect(result).toEqual({ ok: false, code: "GENERATION_FAILED" });
  });

  it("saída que sanitiza para 0 slides úteis => { ok:false, GENERATION_FAILED }", async () => {
    requestGenerationMock.mockResolvedValue({
      title: "Título ok",
      slides: [{ body: "🚀", suggestImage: false }],
    } as GeneratedCarousel);
    const result = await generateForEditor({ intent: validIntent });
    expect(result).toEqual({ ok: false, code: "GENERATION_FAILED" });
  });

  it("sem sessão, o redirect do requireUser é re-lançado (não vira união)", async () => {
    requireUserMock.mockRejectedValue(new RedirectError("/login"));
    const err = await generateForEditor({ intent: validIntent }).catch((e) => e);
    expect(err).toBeInstanceOf(RedirectError);
    expect(requestGenerationMock).not.toHaveBeenCalled();
  });
});
