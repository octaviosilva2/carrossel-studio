"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateCarousel } from "@/lib/actions/generate";

// Limites de UX espelhando o Zod do servidor (a verdade e a borda do servidor).
// min/max identicos a GenerateInputSchema — evita chamada obviamente invalida.
const INTENT_MIN = 10;
const INTENT_MAX = 1000;

// Mensagem generica de falha (nao vaza detalhe tecnico — seguranca-baseline, AC-9).
// TODOS os codigos de erro caem nesta mesma mensagem.
const GENERATE_ERROR_MESSAGE =
  "Não consegui gerar o carrossel. Tente novamente.";

// Estado visual da geracao (union discriminada — mesmo padrao de SaveState/ExportState).
// Sucesso NAO tem estado: a action redireciona para /editor?id=. Enquanto o
// useTransition esta pendente, o estado e `generating`.
type GenerateState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "error"; message: string };

/**
 * Tela de intencao da geracao com IA (S5). Client Component dono do form e do
 * estado visual. Um pedido por vez (AC-8): durante `generating` os controles ficam
 * desabilitados. Erro => mensagem generica pt-BR (AC-9), texto do usuario preservado
 * para nova tentativa. Sucesso => redirect (tratado pelo Next via unstable_rethrow).
 */
export function GenerateClient() {
  const [intent, setIntent] = useState("");
  const [generateState, setGenerateState] = useState<GenerateState>({
    status: "idle",
  });
  const [isPending, startTransition] = useTransition();

  // Comprimento efetivo (trim) para a validacao de UX — casa com z.string().trim().
  const trimmedLength = intent.trim().length;
  const isGenerating = generateState.status === "generating" || isPending;
  // Ha texto insuficiente quando o usuario ja digitou algo, mas ainda abaixo do
  // minimo (edge case "intencao vazia"/curta da story). Espaco em branco puro
  // conta como vazio (trimmedLength === 0) e nao dispara o aviso.
  const isTooShort = trimmedLength > 0 && trimmedLength < INTENT_MIN;
  // Botao habilita so com texto dentro do minimo e fora de uma geracao em voo.
  const canSubmit =
    trimmedLength >= INTENT_MIN &&
    trimmedLength <= INTENT_MAX &&
    !isGenerating;

  /**
   * Edita a intencao. Ao digitar, descarta um estado de erro anterior — o erro
   * pertencia a tentativa passada; a nova edicao comeca limpa (padrao de form).
   */
  function handleIntentChange(value: string) {
    setIntent(value);
    if (generateState.status === "error") {
      setGenerateState({ status: "idle" });
    }
  }

  /**
   * Dispara a geracao. A action redireciona em sucesso (lanca NEXT_REDIRECT); o
   * catch usa unstable_rethrow para deixar o Next tratar o redirect — so erros
   * REAIS viram estado `error`. Em erro, os controles reabilitam e o texto fica.
   */
  function handleGenerate() {
    if (!canSubmit) return;

    setGenerateState({ status: "generating" });
    startTransition(async () => {
      try {
        await generateCarousel({ intent });
        // Sucesso => redirect ja aconteceu (navegacao); nada a fazer aqui.
      } catch (err) {
        // Re-lanca erros de controle de fluxo do Next (redirect/notFound); so o
        // resto vira erro de UI. Mensagem sempre generica (nao inspeciona o code).
        unstable_rethrow(err);
        setGenerateState({
          status: "error",
          message: GENERATE_ERROR_MESSAGE,
        });
      }
    });
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Gerar carrossel com IA
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Descreva o que você quer comunicar. A IA monta um rascunho de texto e
              slides — você ajusta e exporta no editor.
            </p>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href="/carousels">
              <ArrowLeft className="h-4 w-4" />
              Meus carrosséis
            </Link>
          </Button>
        </header>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="intent">O que você quer comunicar?</Label>
            <Textarea
              id="intent"
              value={intent}
              onChange={(e) => handleIntentChange(e.target.value)}
              placeholder="Ex.: 5 dicas práticas para quem está começando a investir, tom direto e sem jargão."
              rows={6}
              maxLength={INTENT_MAX}
              disabled={isGenerating}
              // A11y: liga o campo a dica/contador; marca invalido quando curto.
              aria-describedby="intent-hint intent-counter"
              aria-invalid={isTooShort}
            />
            {/* Aviso de minimo nao atingido — texto (nao so cor), some ao chegar
                no minimo (edge case "intencao vazia/curta" da story). */}
            <p
              id="intent-hint"
              className="text-xs text-muted-foreground"
            >
              {isTooShort
                ? `Descreva um pouco mais — pelo menos ${INTENT_MIN} caracteres.`
                : "Quanto mais claro o objetivo e o tom, melhor o rascunho."}
            </p>
            {/* Contador de caracteres — orienta o usuario sobre o limite. */}
            <p
              id="intent-counter"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {trimmedLength}/{INTENT_MAX} caracteres (mínimo {INTENT_MIN}).
            </p>
          </div>

          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!canSubmit}
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? "Gerando…" : "Gerar carrossel"}
          </Button>
        </div>

        {/* Feedback acessivel (aria-live: leitores anunciam a mudanca de estado). */}
        <div aria-live="polite" className="mt-6 min-h-[1.5rem]">
          {isGenerating ? (
            <p className="text-sm text-muted-foreground">
              Gerando o carrossel… isso pode levar alguns segundos.
            </p>
          ) : null}
          {generateState.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {generateState.message}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
