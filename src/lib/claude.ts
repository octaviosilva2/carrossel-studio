// Fronteira com a Claude API (S5). server-only. Isola TODA a interacao com o SDK
// Anthropic num unico ponto: a factory do client + a funcao requestGeneration. O
// estagio 06 mocka esta fronteira (nunca chama a API real em teste).
//
// Validacao LAZY da ANTHROPIC_API_KEY (decisao do CEO): a chave NAO entra no
// envSchema do boot — o app roda sem ela. Ela e lida aqui, so quando a geracao
// roda; ausente => GenerateError("NOT_CONFIGURED") (AC-10), sem derrubar o resto
// do app e sem expor o valor.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  GeneratedCarouselSchema,
  GenerateError,
  type GeneratedCarousel,
} from "@/lib/actions/generate-types";
import {
  GENERATE_MAX_TOKENS,
  GENERATE_MODEL,
  GENERATE_SYSTEM_PROMPT,
} from "@/lib/generate-prompt";

/**
 * Cria o client Anthropic lendo a chave do ambiente de forma LAZY. Isolada para o
 * 06 poder injetar/mockar. Chave ausente => NOT_CONFIGURED (nunca imprime o valor).
 * A chave e passada explicitamente (nao via env implicita do SDK) para deixar o
 * ponto de leitura visivel e testavel.
 */
export function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    // Falha fechado e tratavel: a action mapeia para mensagem generica pt-BR.
    throw new GenerateError("NOT_CONFIGURED");
  }
  return new Anthropic({ apiKey });
}

/**
 * Contrato da fronteira: recebe a intencao (ja validada na borda pela action) e
 * devolve a estrutura gerada, JA revalidada pelo Zod NOSSO (GeneratedCarouselSchema).
 * Toda falha (API, refusal, JSON fora do contrato) vira GenerateError. A action so
 * precisa sanitizar/persistir o resultado.
 *
 * Injecao de client (parametro opcional) existe para o 06 mockar sem tocar env; em
 * producao usa o client real criado pela factory acima.
 */
export async function requestGeneration(
  intent: string,
  client: Anthropic = createAnthropicClient(),
): Promise<GeneratedCarousel> {
  let response: Awaited<ReturnType<typeof client.messages.parse>>;

  try {
    response = await client.messages.parse({
      model: GENERATE_MODEL,
      max_tokens: GENERATE_MAX_TOKENS,
      // Thinking desligado (2026-07-03): tarefa e geracao de texto curto, nao
      // justifica raciocinio estendido — thinking em effort alto dominava o
      // custo (a maior parte do output billado era pensamento, nao o carrossel).
      // NUNCA budget_tokens no Sonnet 4.6. Sem temperature/top_p/top_k (proibidos).
      thinking: { type: "disabled" },
      // Structured output: o schema restringe a FORMA da saida (camada 1). O helper
      // zodOutputFormat suporta zod v4 (importa de "zod/v4"; peer ^4.0.0 do SDK).
      // effort:"medium" troca thinking pela profundidade de esforco do proprio
      // modelo (mais barato que high, sem cair pra low antes de medir qualidade).
      output_config: { format: zodOutputFormat(GeneratedCarouselSchema), effort: "medium" },
      // Regras visuais no SYSTEM; intencao do usuario SO na mensagem `user`
      // (protecao contra prompt injection).
      system: GENERATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: intent }],
    });
  } catch (err) {
    // NOT_CONFIGURED (da factory) sobe intacto; demais viram GENERATION_FAILED.
    if (err instanceof GenerateError) throw err;
    // Rate limit 429, auth 401, timeout, APIError, conexao — nunca vaza .message.
    // Log so o codigo HTTP internamente (sem corpo, sem chave).
    if (err instanceof Anthropic.APIError) {
      console.error(`[generate] Anthropic API error status=${err.status}`);
    } else {
      console.error("[generate] falha na chamada a Claude API");
    }
    throw new GenerateError("GENERATION_FAILED");
  }

  // stop_reason ANTES de ler o conteudo: refusal (HTTP 200, content vazio) =>
  // classificador recusou; trata como GENERATION_FAILED, nao como bug.
  if (response.stop_reason === "refusal") {
    console.error("[generate] Claude recusou a geracao (stop_reason=refusal)");
    throw new GenerateError("GENERATION_FAILED");
  }

  // parsed_output pode ser null em refusal/max_tokens/JSON invalido.
  const parsed = response.parsed_output;
  if (parsed === null) {
    console.error("[generate] parsed_output nulo (max_tokens ou JSON invalido)");
    throw new GenerateError("GENERATION_FAILED");
  }

  // Camada 2: revalida com o Zod NOSSO. O schema da API nao honra min/max de
  // tamanho/range; aqui reforcamos title 1..120, 1..10 slides, body 1..2000.
  const result = GeneratedCarouselSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[generate] saida fora do contrato apos revalidacao Zod");
    throw new GenerateError("GENERATION_FAILED");
  }

  return result.data;
}
