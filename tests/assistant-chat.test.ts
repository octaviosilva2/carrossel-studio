// @vitest-environment node
// Testes da fronteira do ASSISTENTE de chat (requestAssistantChat). Injetamos um
// client Anthropic FALSO (o proprio parametro `client` existe pra isso) e mockamos
// "server-only" para importar o modulo em node. Cobrem: (1) resposta textual pura,
// (2) proposta de carrossel valida (extraida da tool + sanitizada), (3) proposta
// invalida descartada (mantendo o texto), (4) refusal => GENERATION_FAILED, (5) loop
// de web search (pause_turn) reenviando, (6) resposta vazia => GENERATION_FAILED,
// (7) erro da API => GENERATION_FAILED.
import { describe, it, expect, vi, beforeEach } from "vitest";

// "server-only" lanca fora de um bundle de servidor; no-op para o teste em node.
vi.mock("server-only", () => ({}));

import { requestAssistantChat } from "@/lib/claude-chat";
import { GenerateError, isGenerateError } from "@/lib/actions/generate-types";
import type { ChatTurn } from "@/lib/actions/assistant-types";

// Bloco de conteudo minimo (o codigo so lê `type`, `text`, `name`, `input`).
type FakeBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "server_tool_use"; id: string; name: string; input: unknown };

interface FakeMessage {
  stop_reason: string;
  content: FakeBlock[];
}

// Client falso: devolve as respostas na sequencia dada. `create` conta chamadas.
function fakeClient(responses: FakeMessage[]) {
  const create = vi.fn();
  let i = 0;
  create.mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r;
  });
  // Cast: so precisamos de `.messages.create` no caminho testado.
  return { client: { messages: { create } } as never, create };
}

const HISTORY: ChatTurn[] = [{ role: "user", content: "Fala sobre X" }];

beforeEach(() => vi.clearAllMocks());

describe("requestAssistantChat — resposta textual", () => {
  it("sem tool: devolve a reply e carousel null", async () => {
    const { client, create } = fakeClient([
      { stop_reason: "end_turn", content: [{ type: "text", text: "Olá!" }] },
    ]);

    const out = await requestAssistantChat(HISTORY, client);

    expect(out.reply).toBe("Olá!");
    expect(out.carousel).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("requestAssistantChat — proposta de carrossel", () => {
  it("tool apply_carousel válida: extrai e sanitiza o carrossel", async () => {
    const { client } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Segue a proposta:" },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "apply_carousel",
            input: {
              title: "Copa 2026",
              slides: [
                { body: "Primeiro slide", suggestImage: false },
                { body: "Segundo slide", suggestImage: true },
              ],
            },
          },
        ],
      },
    ]);

    const out = await requestAssistantChat(HISTORY, client);

    expect(out.reply).toBe("Segue a proposta:");
    expect(out.carousel).not.toBeNull();
    expect(out.carousel?.title).toBe("Copa 2026");
    expect(out.carousel?.slides).toHaveLength(2);
    // suggestImage=true vira dica textual no body (camada 3 de sanitizacao).
    expect(out.carousel?.slides[1]?.body).toContain("[Sugestão");
  });

  it("tool sem texto: sintetiza uma reply padrão", async () => {
    const { client } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "apply_carousel",
            input: { title: "T", slides: [{ body: "Corpo", suggestImage: false }] },
          },
        ],
      },
    ]);

    const out = await requestAssistantChat(HISTORY, client);

    expect(out.carousel).not.toBeNull();
    expect(out.reply.length).toBeGreaterThan(0);
  });

  it("input inválido (0 slides): descarta o carrossel mas mantém o texto", async () => {
    const { client } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Tentei montar." },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "apply_carousel",
            input: { title: "T", slides: [] }, // Zod min(1) reprova
          },
        ],
      },
    ]);

    const out = await requestAssistantChat(HISTORY, client);

    expect(out.carousel).toBeNull();
    expect(out.reply).toBe("Tentei montar.");
  });
});

describe("requestAssistantChat — web search (pause_turn)", () => {
  it("reenvia até o modelo concluir e devolve a reply final", async () => {
    const { client, create } = fakeClient([
      {
        stop_reason: "pause_turn",
        content: [
          { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Segundo a busca, foi X." }],
      },
    ]);

    const out = await requestAssistantChat(HISTORY, client);

    expect(out.reply).toBe("Segundo a busca, foi X.");
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("requestAssistantChat — falhas", () => {
  it("refusal => GENERATION_FAILED", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal", content: [] }]);

    await expect(requestAssistantChat(HISTORY, client)).rejects.toSatisfy(
      (e: unknown) => isGenerateError(e) && e.code === "GENERATION_FAILED",
    );
  });

  it("resposta vazia (sem texto e sem carrossel) => GENERATION_FAILED", async () => {
    const { client } = fakeClient([{ stop_reason: "end_turn", content: [] }]);

    await expect(requestAssistantChat(HISTORY, client)).rejects.toBeInstanceOf(
      GenerateError,
    );
  });

  it("erro na chamada da API => GENERATION_FAILED (sem vazar detalhe)", async () => {
    const create = vi.fn().mockRejectedValue(new Error("boom interno"));
    const client = { messages: { create } } as never;

    await expect(requestAssistantChat(HISTORY, client)).rejects.toSatisfy(
      (e: unknown) => isGenerateError(e) && e.code === "GENERATION_FAILED",
    );
  });
});
