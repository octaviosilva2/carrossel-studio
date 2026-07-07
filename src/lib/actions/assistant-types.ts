// Tipos e schemas Zod do ASSISTENTE de chat (reformulacao do ADR 0004). Modulo
// NEUTRO (sem "use server"): um arquivo "use server" so exporta funcoes async,
// entao schemas/tipos/erros ficam aqui. Consumido pela action (servidor) e pelo
// client (so os tipos). Espelha a separacao generate.ts/generate-types.ts.
//
// Diferenca para a geracao one-shot: aqui e um CHAT com memoria. O client envia o
// historico (ate 30 turnos) e a IA pode (a) so responder em texto, (b) buscar na
// web, ou (c) PROPOR um carrossel (que o usuario aplica com um clique). O erro
// reusa os codigos de generate-types (mesma UX generica pt-BR).

import { z } from "zod";
import type { GenerateErrorCode, GeneratedEditorSlide } from "@/lib/actions/generate-types";

/** Janela de memoria enviada ao modelo (decisao do CEO: 30 mensagens). */
export const ASSISTANT_MEMORY_TURNS = 30;

/** Teto de caracteres por mensagem do historico (custo/abuso — seguranca-baseline). */
const MAX_TURN_CHARS = 4000;

/** Um turno da conversa: papel + texto puro (o carrossel proposto nao vai no historico). */
export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_TURN_CHARS),
});

export type ChatTurn = z.infer<typeof ChatTurnSchema>;

/**
 * Payload de chatWithAssistant. `messages` e o historico (ja recortado no client
 * para os ultimos 30 turnos; o servidor reforca o corte). min(1) exige ao menos a
 * mensagem nova do usuario; max reforca a janela.
 */
export const AssistantInputSchema = z.object({
  messages: z.array(ChatTurnSchema).min(1).max(ASSISTANT_MEMORY_TURNS),
});

export type AssistantInput = z.infer<typeof AssistantInputSchema>;

/**
 * Carrossel PROPOSTO pela IA no chat (nao aplicado ainda). Mesmo shape que o editor
 * consome no APPLY_GENERATED: title + bodies ja sanitizados. O usuario decide aplicar.
 */
export interface AssistantCarousel {
  title: string;
  slides: GeneratedEditorSlide[];
}

/**
 * Resultado de chatWithAssistant — uniao discriminada (o chat trata SEM throw). Em
 * sucesso: sempre uma `reply` textual; `carousel` != null quando a IA propos slides.
 * Erro carrega so o `code` estavel — a mensagem pt-BR e resolvida no client.
 */
export type AssistantResult =
  | { ok: true; reply: string; carousel: AssistantCarousel | null }
  | { ok: false; code: GenerateErrorCode };
