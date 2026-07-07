// Fronteira do ASSISTENTE de chat com a Claude API. server-only. Isola a interacao
// com o SDK Anthropic para o chat conversacional (com memoria, busca na web e a tool
// de propor carrossel). Reusa a factory createAnthropicClient (validacao lazy da
// chave) e a defesa em camadas da geracao (Zod nosso + sanitizacao). O teste mocka
// esta fronteira (nunca chama a API real).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

import { createAnthropicClient } from "@/lib/claude";
import {
  GeneratedCarouselSchema,
  GenerateError,
} from "@/lib/actions/generate-types";
import { mapGeneratedToSlideRows } from "@/lib/generate-sanitize";
import type { AssistantCarousel, ChatTurn } from "@/lib/actions/assistant-types";
import {
  APPLY_CAROUSEL_INPUT_SCHEMA,
  APPLY_CAROUSEL_TOOL_NAME,
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_MODEL,
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_THINKING_BUDGET,
  ASSISTANT_WEB_SEARCH_MAX_USES,
} from "@/lib/assistant-prompt";

// Cap do loop de tools de servidor (web search). Cada `pause_turn` = o loop de
// busca do servidor bateu o limite interno; reenviamos para continuar, ate este teto.
const MAX_SERVER_TOOL_CONTINUATIONS = 4;

/** Resposta da fronteira: texto do assistente + carrossel proposto (ou null). */
export interface AssistantReply {
  reply: string;
  carousel: AssistantCarousel | null;
}

// Tools disponiveis ao assistente. web_search na variante BASICA (Haiku 4.5 nao
// suporta a `_20260209` com filtragem dinamica). apply_carousel = tool custom que a
// IA chama para propor o carrossel; validamos o input com o Zod nosso depois.
const ASSISTANT_TOOLS = [
  {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: ASSISTANT_WEB_SEARCH_MAX_USES,
  },
  {
    name: APPLY_CAROUSEL_TOOL_NAME,
    description:
      "Propõe um carrossel (título + slides) para o usuário aplicar no editor. Use ao criar ou ajustar o carrossel.",
    input_schema: APPLY_CAROUSEL_INPUT_SCHEMA,
  },
] as unknown as Anthropic.MessageCreateParams["tools"];

/**
 * Fala com o assistente: recebe o historico (ja recortado na borda) e devolve a
 * resposta textual + um carrossel proposto (se a IA chamou apply_carousel). Trata o
 * loop de web search (pause_turn) e o refusal. Toda falha vira GenerateError; a
 * action mapeia para a UX generica.
 *
 * Injecao de client (parametro opcional) existe para o teste mockar sem tocar env.
 */
export async function requestAssistantChat(
  messages: ChatTurn[],
  client: Anthropic = createAnthropicClient(),
): Promise<AssistantReply> {
  // Historico -> mensagens da API (papel + texto puro). O carrossel proposto NUNCA
  // entra no historico (o client guarda so texto), entao nao ha tool_use pendente.
  const apiMessages: Anthropic.MessageParam[] = messages.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: ASSISTANT_MAX_TOKENS,
      // Haiku 4.5: thinking CLASSICO (budget_tokens < max_tokens, >= 1024). Sem
      // effort (daria erro neste modelo).
      thinking: { type: "enabled", budget_tokens: ASSISTANT_THINKING_BUDGET },
      system: ASSISTANT_SYSTEM_PROMPT,
      tools: ASSISTANT_TOOLS,
      messages: apiMessages,
    });

    // Loop do tool de servidor (web search): pause_turn => reenvia com a resposta
    // anexada para o servidor retomar. Nao adiciona mensagem de usuario nova.
    let continuations = 0;
    while (
      response.stop_reason === "pause_turn" &&
      continuations < MAX_SERVER_TOOL_CONTINUATIONS
    ) {
      apiMessages.push({ role: "assistant", content: response.content });
      response = await client.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: ASSISTANT_MAX_TOKENS,
        thinking: { type: "enabled", budget_tokens: ASSISTANT_THINKING_BUDGET },
        system: ASSISTANT_SYSTEM_PROMPT,
        tools: ASSISTANT_TOOLS,
        messages: apiMessages,
      });
      continuations++;
    }
  } catch (err) {
    // NOT_CONFIGURED (da factory) sobe intacto; demais viram GENERATION_FAILED.
    if (err instanceof GenerateError) throw err;
    if (err instanceof Anthropic.APIError) {
      console.error(`[assistant] Anthropic API error status=${err.status}`);
    } else {
      console.error("[assistant] falha na chamada a Claude API");
    }
    throw new GenerateError("GENERATION_FAILED");
  }

  // Refusal (HTTP 200, classificador recusou) ANTES de ler o conteudo.
  if (response.stop_reason === "refusal") {
    console.error("[assistant] Claude recusou (stop_reason=refusal)");
    throw new GenerateError("GENERATION_FAILED");
  }

  // Extrai o texto e (se houver) a chamada da tool apply_carousel. Blocos de web
  // search (server_tool_use / web_search_tool_result) sao ignorados aqui.
  let text = "";
  let carouselInput: unknown = null;
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (
      block.type === "tool_use" &&
      block.name === APPLY_CAROUSEL_TOOL_NAME
    ) {
      carouselInput = block.input;
    }
  }

  // Valida o carrossel proposto: Zod nosso (camada 2) + sanitizacao (camada 3). Se
  // a proposta for invalida, descarta o carrossel mas mantem a resposta textual.
  let carousel: AssistantCarousel | null = null;
  if (carouselInput !== null) {
    const parsed = GeneratedCarouselSchema.safeParse(carouselInput);
    if (parsed.success) {
      const mapped = mapGeneratedToSlideRows(parsed.data);
      if (mapped) {
        carousel = {
          title: mapped.title,
          slides: mapped.slides.map((slide) => ({ body: slide.body })),
        };
      }
    }
  }

  const trimmed = text.trim();
  // Sem texto E sem carrossel utilizavel => resposta vazia; trata como falha.
  if (!trimmed && !carousel) {
    console.error("[assistant] resposta vazia (sem texto e sem carrossel)");
    throw new GenerateError("GENERATION_FAILED");
  }

  const reply =
    trimmed ||
    "Preparei uma proposta de carrossel. Confira e aplique quando quiser.";

  return { reply, carousel };
}
