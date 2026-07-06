"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateForEditor } from "@/lib/actions/generate";
import type {
  GenerateErrorCode,
  GeneratedEditorSlide,
} from "@/lib/actions/generate-types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// Mensagem inicial do assistente (orienta o uso — sem seed falso de conversa).
const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "seed-1",
    role: "assistant",
    text: "Descreva o carrossel que você quer (tema, tom, quantos slides) e eu gero os slides aqui no editor.",
  },
];

// Mensagens pt-BR por codigo de erro. TODAS genericas (nunca vaza detalhe
// tecnico ao usuario — seguranca-baseline); so o texto muda por causa da UX.
const ERROR_MESSAGES: Record<GenerateErrorCode, string> = {
  INVALID_INPUT: "Descreva com um pouco mais de detalhe (mínimo 10 caracteres).",
  NOT_CONFIGURED: "A geração por IA está indisponível no momento.",
  GENERATION_FAILED: "Não consegui gerar agora. Tente reformular o pedido.",
};

interface AssistantPanelProps {
  /**
   * Aplica o carrossel gerado no editor (o pai despacha APPLY_GENERATED e fecha
   * o painel). O assistente nao conhece o reducer — so entrega o resultado.
   */
  onApply: (result: { title: string; slides: GeneratedEditorSlide[] }) => void;
}

/**
 * Assistente de IA do editor (ADR 0004). Agora FUNCIONAL: chama a Claude API via
 * a server action `generateForEditor`, e aplica o resultado no carrossel aberto.
 * Geracao a partir do prompt (nao edicao incremental slide a slide — essa fatia
 * segue futura). Vive dentro de um Sheet (drawer) que abre por botao no header.
 */
export function AssistantPanel({ onApply }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  function pushAssistant(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "assistant", text },
    ]);
  }

  async function sendMessage() {
    const text = draft.trim();
    // Ignora envio vazio ou durante uma geracao em voo (evita chamada dupla).
    if (!text || isGenerating) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setDraft("");
    setIsGenerating(true);

    try {
      const result = await generateForEditor({ intent: text });
      if (result.ok) {
        onApply({ title: result.title, slides: result.slides });
        pushAssistant(
          `Pronto! Gerei ${result.slides.length} slide${
            result.slides.length > 1 ? "s" : ""
          } e apliquei no editor. Ajuste o que quiser ao lado.`,
        );
      } else {
        pushAssistant(ERROR_MESSAGES[result.code]);
      }
    } catch {
      // Falha inesperada (rede/servidor): mensagem generica, editor intacto.
      pushAssistant("Algo deu errado ao gerar. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
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
      {/* Banner de topo — "Crie com IA". */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Crie com IA</p>
      </div>

      {/* Conversa. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-1.5",
                message.role === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted",
              )}
            >
              {message.text}
            </div>
          </div>
        ))}
        {isGenerating ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 text-muted-foreground">
              Gerando…
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer. */}
      <form onSubmit={handleSubmit} className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Descreva o que criar…"
            aria-label="Descreva o carrossel para a IA gerar"
            disabled={isGenerating}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Enviar"
            disabled={isGenerating || draft.trim().length === 0}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
