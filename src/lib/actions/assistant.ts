"use server";

// Server action do ASSISTENTE de chat (reformulacao do ADR 0004). Mesmo PADRAO das
// demais: (1) requireUser() no topo, (2) Zod na borda, (3) tudo o mais so autenticado.
// NAO persiste nem redireciona — devolve a resposta ao chat, que decide aplicar o
// carrossel proposto. Arquivo "use server" exporta SOMENTE funcoes async; schemas/
// tipos vivem em assistant-types.ts (modulo neutro).

import { requireUser } from "@/lib/auth-guard";
import { requestAssistantChat } from "@/lib/claude-chat";
import { isGenerateError } from "@/lib/actions/generate-types";
import {
  ASSISTANT_MEMORY_TURNS,
  AssistantInputSchema,
  type AssistantInput,
  type AssistantResult,
} from "@/lib/actions/assistant-types";

/**
 * Conversa com o assistente de IA do editor.
 *
 * Fluxo (falha fechado):
 * 1. requireUser() — visitante nao logado nunca chega a Claude API; redireciona /login.
 * 2. Zod na borda — historico vazio/malformado/gigante => INVALID_INPUT, sem chamar a API.
 * 3. Recorta a memoria aos ultimos 30 turnos (reforca o corte do client).
 * 4. requestAssistantChat() — Claude API (chat + web search + tool de carrossel),
 *    checa refusal, valida o carrossel proposto (Zod + sanitizacao).
 *
 * Contrato de erro por UNIAO (nao throw ao client): so o `code` estavel viaja — a
 * mensagem pt-BR e resolvida no client. A unica excecao re-lancada e o redirect do
 * requireUser (visitante sem sessao): deixa o Next tratar a navegacao a /login.
 */
export async function chatWithAssistant(
  input: AssistantInput,
): Promise<AssistantResult> {
  try {
    // 1. Autenticacao (falha fechado). Sem sessao -> requireUser lanca redirect.
    await requireUser();

    // 2. Validacao da borda. Historico malformado => INVALID_INPUT, sem chamar a API.
    const parsed = AssistantInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

    // 3. Recorta aos ultimos 30 turnos (janela de memoria do modelo).
    const windowed = parsed.data.messages.slice(-ASSISTANT_MEMORY_TURNS);

    // 4. Claude API + validacao do carrossel proposto. Lanca GenerateError em falha.
    const { reply, carousel } = await requestAssistantChat(windowed);

    return { ok: true, reply, carousel };
  } catch (err) {
    // GenerateError (NOT_CONFIGURED/GENERATION_FAILED) vira uniao tratavel.
    if (isGenerateError(err)) return { ok: false, code: err.code };
    // Qualquer outra coisa (ex.: NEXT_REDIRECT do requireUser) sobe intacta.
    throw err;
  }
}
