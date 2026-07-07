"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { Check, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chatWithAssistant } from "@/lib/actions/assistant";
import {
  ASSISTANT_MEMORY_TURNS,
  type AssistantCarousel,
} from "@/lib/actions/assistant-types";
import type { GenerateErrorCode } from "@/lib/actions/generate-types";

/** Mensagem do chat (mantida no editor-client para persistir ao fechar/abrir). */
export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  // Proposta de carrossel anexada (so em mensagens do assistente). O usuario aplica.
  carousel?: AssistantCarousel;
  // Marca de "ja aplicado" (desabilita o botao apos aplicar).
  applied?: boolean;
  // Mensagem de boas-vindas: nao entra no historico enviado ao modelo.
  isSeed?: boolean;
}

/** Estado inicial: saudacao do assistente (nao vai no historico da API). */
export const INITIAL_ASSISTANT_MESSAGES: AssistantMessage[] = [
  {
    id: "seed-1",
    role: "assistant",
    isSeed: true,
    text: "Oi! Me diga o tema e o tom do carrossel e eu monto os slides. Posso pesquisar na web para não errar fatos recentes.",
  },
];

// Mensagens pt-BR por codigo de erro. TODAS genericas (nunca vaza detalhe tecnico).
const ERROR_MESSAGES: Record<GenerateErrorCode, string> = {
  INVALID_INPUT: "Escreva um pouco mais para eu entender o pedido.",
  NOT_CONFIGURED: "O assistente de IA está indisponível no momento.",
  GENERATION_FAILED: "Não consegui responder agora. Tente reformular.",
};

interface AssistantPanelProps {
  messages: AssistantMessage[];
  setMessages: Dispatch<SetStateAction<AssistantMessage[]>>;
  /** Aplica no editor o carrossel proposto (o pai despacha APPLY_GENERATED). */
  onApplyCarousel: (carousel: AssistantCarousel) => void;
}

/**
 * Assistente de IA do editor (reformulado): CHAT conversacional com memoria (ate 30
 * turnos), busca na web e proposta de carrossel aplicada por confirmacao. O estado
 * das mensagens vive no editor-client (persiste ao fechar/abrir o drawer).
 */
export function AssistantPanel({
  messages,
  setMessages,
  onApplyCarousel,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  // Ancora de rolagem para manter a conversa no fim a cada nova mensagem.
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage() {
    const text = draft.trim();
    // Ignora envio vazio ou durante uma resposta em voo (evita chamada dupla).
    if (!text || isSending) return;

    const userMsg: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    // Historico para a API: ultimos 30 turnos reais (sem seed), comecando por user.
    const apiTurns = [...messages, userMsg]
      .filter((m) => !m.isSeed && m.text.trim().length > 0)
      .slice(-ASSISTANT_MEMORY_TURNS)
      .map((m) => ({ role: m.role, content: m.text }));
    while (apiTurns.length > 0 && apiTurns[0]?.role !== "user") apiTurns.shift();

    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setIsSending(true);

    try {
      const result = await chatWithAssistant({ messages: apiTurns });
      if (result.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: result.reply,
            carousel: result.carousel ?? undefined,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: ERROR_MESSAGES[result.code],
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Algo deu errado. Tente novamente.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  /** Aplica a proposta e marca a mensagem como aplicada (botao vira "Aplicado"). */
  function handleApply(messageId: string, carousel: AssistantCarousel) {
    onApplyCarousel(carousel);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, applied: true } : m)),
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Conversa. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5",
                  message.role === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted",
                )}
              >
                {message.text}
              </div>
            </div>

            {/* Proposta de carrossel: card com o titulo + botao de aplicar. */}
            {message.carousel ? (
              <div className="ml-1 max-w-[85%] rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Proposta de carrossel
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">
                  {message.carousel.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {message.carousel.slides.length} slide
                  {message.carousel.slides.length > 1 ? "s" : ""}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 w-full justify-center"
                  disabled={message.applied}
                  onClick={() =>
                    message.carousel && handleApply(message.id, message.carousel)
                  }
                >
                  {message.applied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Aplicado
                    </>
                  ) : (
                    "Aplicar no editor"
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        ))}

        {/* Loading animado (tres pontos pulsando) enquanto a IA responde. */}
        {isSending ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {/* Composer. */}
      <form onSubmit={handleSubmit} className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Converse ou peça um carrossel…"
            aria-label="Mensagem para o assistente de IA"
            disabled={isSending}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Enviar"
            disabled={isSending || draft.trim().length === 0}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
