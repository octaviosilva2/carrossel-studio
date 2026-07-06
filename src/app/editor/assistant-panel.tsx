"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "seed-1",
    role: "user",
    text: "Cria um carrossel sobre produtividade com 5 slides",
  },
  {
    id: "seed-2",
    role: "assistant",
    text: "Pronto! Gerei 5 slides. Veja o preview →",
  },
];

/**
 * Assistente de IA do editor — MOCK visual. Sempre aberto, sem opção de
 * fechar (regra do redesign). Conversa e so cosmetica: nao chama a Claude API
 * nem edita slides de verdade — geracao real por IA e uma fatia futura.
 */
export function AssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setDraft("");

    // Resposta fixa (mock) — nenhuma chamada de IA real acontece aqui.
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Em breve vou poder aplicar isso de verdade — por enquanto, edite os slides manualmente ao lado.",
        },
      ]);
    }, 500);
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
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border px-3.5 py-2.5">
        <p className="text-sm font-semibold">Assistente</p>
        <p className="text-xs text-muted-foreground">Peça o que quiser.</p>
      </div>

      <div className="max-h-64 space-y-3 overflow-y-auto p-3.5 text-sm lg:max-h-none lg:flex-1">
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
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Peça uma alteração…"
            aria-label="Mensagem para o assistente"
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" aria-label="Enviar mensagem">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
