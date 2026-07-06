"use server";

// Server action da geracao de carrossel com IA (Porta A, S5). Segue o PADRAO da S3:
// (1) requireUser() no topo, (2) Zod na borda da entrada, (3) tudo o mais so roda
// autenticado. Orquestra a defesa em 3 camadas e persiste um carrossel NOVO,
// redirecionando ao editor. Este arquivo "use server" exporta SOMENTE funcoes async;
// schemas/tipos/erros vivem em generate-types.ts (modulo neutro).

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth-guard";
import { requestGeneration } from "@/lib/claude";
import { mapGeneratedToSlideRows } from "@/lib/generate-sanitize";
import { createGeneratedCarousel } from "@/lib/actions/carousels";
import {
  GenerateInputSchema,
  GenerateError,
  isGenerateError,
  type GenerateInput,
  type GenerateForEditorResult,
} from "@/lib/actions/generate-types";

/**
 * Gera um carrossel a partir da intencao do usuario e o abre no editor.
 *
 * Fluxo (falha fechado em cada etapa):
 * 1. requireUser() — visitante nao logado nunca chega a Claude API (AC-1); redireciona /login.
 * 2. Zod na borda — intencao vazia/curta/longa => INVALID_INPUT antes de gastar API (AC-2).
 * 3. requestGeneration() — chama a Claude API, checa stop_reason/refusal, revalida com
 *    o Zod nosso (camadas 1 e 2). Falha => GENERATION_FAILED; chave ausente => NOT_CONFIGURED.
 * 4. mapGeneratedToSlideRows() — camada 3: sanitiza (emojis/markdown/paragrafos), aplica a
 *    dica de imagem, descarta bodies vazios. 0 slides uteis => GENERATION_FAILED (AC-9).
 * 5. createGeneratedCarousel() — persiste 1 carrossel + N slides (ownerId da sessao).
 * 6. redirect("/editor?id=<novo>") — aterrissa no editor da S2 ja preenchido (AC-3).
 *
 * Sucesso => redirect (lanca NEXT_REDIRECT internamente; retorno efetivo `never`).
 * Erro => lanca GenerateError com `code` estavel; o client mapeia para mensagem
 * generica pt-BR (nunca vaza detalhe tecnico — AC-9).
 */
export async function generateCarousel(input: GenerateInput): Promise<never> {
  // 1. Autenticacao (falha fechado -> /login antes de qualquer logica ou chamada a API).
  await requireUser();

  // 2. Validacao da borda. Entrada malformada => INVALID_INPUT, sem chamar a API.
  const parsed = GenerateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new GenerateError("INVALID_INPUT");
  }
  const { intent } = parsed.data;

  // 3. Chamada a Claude API + revalidacao Zod (camadas 1 e 2). Lanca GenerateError.
  const generated = await requestGeneration(intent);

  // 4. Sanitizacao + mapeamento (camada 3, modulo puro). null => nada utilizavel.
  const mapped = mapGeneratedToSlideRows(generated);
  if (mapped === null) {
    throw new GenerateError("GENERATION_FAILED");
  }

  // 5. Persiste o carrossel novo (ownerId da sessao dentro da action de escrita).
  const { id } = await createGeneratedCarousel(mapped);

  // 6. Aterrissa no editor. redirect() lanca NEXT_REDIRECT (navegacao), nao erro real.
  redirect(`/editor?id=${id}`);
}

/**
 * Gera slides a partir da intencao do usuario e DEVOLVE o resultado ao editor
 * (ADR 0004 — Assistente de IA). Reusa a MESMA defesa em camadas de
 * generateCarousel (auth -> Zod -> Claude API -> sanitizacao), mas NAO persiste
 * nem redireciona: o assistente aplica o resultado no carrossel ja aberto
 * (dispatch APPLY_GENERATED). O autosave existente cuida de salvar depois.
 *
 * Contrato de erro por UNIAO (nao throw): o client mostra a mensagem no chat sem
 * derrubar o editor. So o `code` estavel viaja — a mensagem pt-BR e resolvida no
 * client (nunca vaza detalhe tecnico). A unica excecao re-lancada e o redirect do
 * requireUser (visitante sem sessao): deixamos o Next tratar a navegacao a /login.
 */
export async function generateForEditor(
  input: GenerateInput,
): Promise<GenerateForEditorResult> {
  try {
    // 1. Autenticacao (falha fechado). Sem sessao -> requireUser lanca redirect.
    await requireUser();

    // 2. Validacao da borda. Entrada malformada => INVALID_INPUT, sem chamar a API.
    const parsed = GenerateInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

    // 3. Claude API + revalidacao Zod (camadas 1 e 2). Lanca GenerateError.
    const generated = await requestGeneration(parsed.data.intent);

    // 4. Sanitizacao + mapeamento (camada 3). null => nada utilizavel.
    const mapped = mapGeneratedToSlideRows(generated);
    if (mapped === null) return { ok: false, code: "GENERATION_FAILED" };

    // 5. Devolve so o essencial ao editor (title + bodies ja sanitizados).
    return {
      ok: true,
      title: mapped.title,
      slides: mapped.slides.map((slide) => ({ body: slide.body })),
    };
  } catch (err) {
    // GenerateError (NOT_CONFIGURED/GENERATION_FAILED) vira uniao tratavel.
    if (isGenerateError(err)) return { ok: false, code: err.code };
    // Qualquer outra coisa (ex.: NEXT_REDIRECT do requireUser) sobe intacta.
    throw err;
  }
}
