// Tipos e schemas Zod da geracao com IA (S5). Modulo NEUTRO (sem "use server"):
// um arquivo "use server" so pode exportar funcoes async, entao os schemas Zod, os
// tipos e a classe de erro vivem aqui. Consumidos tanto pela action (servidor)
// quanto pelo client (so os tipos). Espelha a separacao carousels.ts/carousel-types.ts.

import { z } from "zod";

// --- Input: intencao do usuario (entrada NAO confiavel) ----------------------

/**
 * Payload de generateCarousel. `intent` e a descricao livre do usuario — validada
 * na borda antes de gastar chamada a API. min(10) bloqueia intencao vazia/curta;
 * max(1000) e teto de custo/abuso (seguranca-baseline).
 */
export const GenerateInputSchema = z.object({
  intent: z.string().trim().min(10).max(1000),
});

export type GenerateInput = z.infer<typeof GenerateInputSchema>;

// --- Output interno: estrutura gerada pela IA (antes de persistir) -----------

/**
 * Schema NOSSO que revalida a saida da Claude API. Camada 2 da defesa em 3
 * camadas: o schema enviado a API restringe so a FORMA (nao honra min/max de
 * tamanho), entao aqui reforcamos limites — title 1..120, 1..10 slides, cada
 * body 1..2000 (alinhado ao slideInputSchema da S3), suggestImage booleano.
 * Qualquer coisa fora disso => rejeitado => GENERATION_FAILED (nada vai ao banco).
 */
export const GeneratedCarouselSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slides: z
    .array(
      z.object({
        body: z.string().trim().min(1).max(2000),
        // Sinal de "cabe imagem neste slide" (AC-5). Vira dica textual no body na
        // montagem — nao ha coluna/campo novo (decisao do CEO no gate).
        suggestImage: z.boolean(),
      }),
    )
    .min(1)
    .max(10),
});

export type GeneratedCarousel = z.infer<typeof GeneratedCarouselSchema>;

// --- Erro tipado da geracao --------------------------------------------------

/**
 * Codigo estavel do erro de geracao. Existe para telemetria/log server-side e
 * testes — o client trata TODOS com a MESMA mensagem generica pt-BR (AC-9); nunca
 * vaza texto tecnico ao usuario.
 */
export type GenerateErrorCode =
  | "INVALID_INPUT" // Zod da borda falhou (intencao vazia/curta/longa)
  | "GENERATION_FAILED" // Claude API: rate limit, auth, timeout, refusal, JSON fora do contrato
  | "NOT_CONFIGURED"; // ANTHROPIC_API_KEY ausente (AC-10, validacao lazy)

/** Erro de geracao com `code` estavel (para o client mapear e para log). */
export class GenerateError extends Error {
  constructor(public readonly code: GenerateErrorCode) {
    super(code);
    this.name = "GenerateError";
  }
}

/** Type guard: distingue GenerateError de erros genericos. */
export function isGenerateError(err: unknown): err is GenerateError {
  return err instanceof GenerateError;
}

// --- Resultado da geracao para o EDITOR (ADR 0004) ---------------------------

/**
 * Slide gerado a devolver ao editor: so o `body` (a geracao nunca traz imagem).
 * O client cria o EditorSlide (id/imageUrl) via o reducer (APPLY_GENERATED).
 */
export interface GeneratedEditorSlide {
  body: string;
}

/**
 * Resultado de `generateForEditor` — uniao discriminada (o assistente do editor
 * trata SEM throw, mostrando a mensagem no chat). Diferente de `generateCarousel`
 * (que persiste e redireciona), aqui NAO se cria carrossel novo: o resultado e
 * aplicado no carrossel ja aberto. Erro carrega so o `code` estavel — a mensagem
 * pt-BR e resolvida no client (nunca vaza detalhe tecnico).
 */
export type GenerateForEditorResult =
  | { ok: true; title: string; slides: GeneratedEditorSlide[] }
  | { ok: false; code: GenerateErrorCode };
