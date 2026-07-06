"use client";

import { useEffect, useRef, useState, useReducer, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, FileArchive, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  editorReducer,
  DEFAULT_CAROUSEL_TITLE,
  type EditorState,
} from "@/lib/editor-state";
import {
  exportCarouselToZip,
  exportSlideToPng,
  slidePngName,
  toSlideDataForExport,
  zipFileName,
} from "@/lib/export-png";
import type { SlideData } from "@/components/slide/types";
import { deleteCarousel, saveCarousel } from "@/lib/actions/carousels";
import type { SaveCarouselInput } from "@/lib/actions/carousel-types";
import { AssistantPanel } from "./assistant-panel";
import { ExportCapture, type ExportCaptureHandle } from "./export-capture";
import { IdentityPanel } from "./identity-panel";
import { SlideNav } from "./slide-nav";
import { SlideEditor } from "./slide-editor";
import { ThemePreview } from "./theme-preview";

// Estado visual do autosave (union discriminada — impede combinacoes invalidas).
type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

// Estado visual do export (S4) — union discriminada, mesmo padrao do SaveState.
type ExportState =
  | { status: "idle" }
  | { status: "working"; kind: "zip" | "single" }
  | { status: "done"; kind: "zip" | "single" }
  | { status: "error"; message: string };

// Mensagem generica de falha (nao vaza detalhe tecnico — seguranca-baseline).
const EXPORT_ERROR_MESSAGE = "Falha ao exportar. Tente novamente.";

// Debounce do autosave: espera essa pausa na digitacao antes de persistir.
const AUTOSAVE_DEBOUNCE_MS = 1500;

// Aguarda o React pintar os nos de captura antes de ler os refs. Dois frames:
// o primeiro agenda apos o proximo paint, o segundo garante que o layout aplicou.
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

interface EditorClientProps {
  // Estado inicial vindo do servidor (getCarousel). Ja traz carouselId e title.
  initialState: EditorState;
}

/**
 * Editor manual de carrossel (redesign): layout 3 colunas (assistente mock |
 * slides manuais | preview), autosave por debounce (substitui o botao Salvar
 * manual) e exclusao com confirmacao. O useReducer + os paineis de slide
 * (SlideNav/SlideEditor/IdentityPanel) sao os MESMOS de antes — so o layout e
 * o gatilho de salvar mudaram.
 */
export function EditorClient({ initialState }: EditorClientProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Assistente de IA: recolhido por padrao (ADR 0004 revisada). Abre por botao no
  // header como drawer sobreposto — nao ocupa mais uma coluna fixa.
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  /**
   * Aplica o carrossel gerado pela IA no editor (substitui titulo + slides) e
   * fecha o painel. O autosave (debounce) persiste em seguida.
   */
  function handleApplyGenerated(result: {
    title: string;
    slides: { body: string }[];
  }) {
    dispatch({
      type: "APPLY_GENERATED",
      title: result.title,
      slides: result.slides,
    });
    setIsAssistantOpen(false);
  }

  // Estado do export (S4). captureData != null => o <ExportCapture> esta montado
  // (sob demanda, so durante um export). Concentra o custo (fetch/canvas) no
  // clique — nao re-monta a cada tecla.
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [captureData, setCaptureData] = useState<SlideData[] | null>(null);
  const captureRef = useRef<ExportCaptureHandle>(null);
  // Guarda o timer de reset do estado "done" para nao vazar entre exports.
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deriva o slide selecionado. noUncheckedIndexedAccess: `find` devolve
  // `EditorSlide | undefined`; normalizamos para `null` (contrato dos paineis).
  const selectedSlide =
    state.slides.find((slide) => slide.id === state.selectedSlideId) ?? null;

  // Titulo exibido: cai no default quando o campo estiver ausente/vazio.
  const title = state.title ?? DEFAULT_CAROUSEL_TITLE;

  /**
   * Monta o SaveCarouselInput a partir do estado atual e persiste. Chamada
   * pelo autosave (debounce abaixo) — nao ha mais botao "Salvar" manual.
   */
  function doSave(current: EditorState) {
    const carouselId = current.carouselId;
    // Guarda defensiva: sem id nao ha o que salvar (nao deveria ocorrer — o
    // wrapper server sempre garante um id antes de montar o editor).
    if (!carouselId) return;
    // saveCarousel exige ao menos 1 slide (Zod .min(1)); autosave so tenta
    // quando ha slide (o estado vazio nao acontece sem o usuario remover tudo,
    // e nesse caso simplesmente pulamos o autosave ate haver 1+ de novo).
    if (current.slides.length === 0) return;

    const input: SaveCarouselInput = {
      id: carouselId,
      title: current.title ?? DEFAULT_CAROUSEL_TITLE,
      theme: current.theme,
      identity: {
        name: current.identity.name,
        handle: current.identity.handle,
        avatarUrl: current.identity.avatarUrl,
        verified: current.identity.verified,
      },
      slides: current.slides.map((slide) =>
        slide.imageUrl
          ? { body: slide.body, imageUrl: slide.imageUrl }
          : { body: slide.body },
      ),
    };

    setSaveState({ status: "saving" });
    startTransition(async () => {
      try {
        await saveCarousel(input);
        setSaveState({ status: "saved" });
      } catch {
        // Falha de rede/banco/validacao: mostra erro, NAO afirma salvo, mantem
        // o trabalho em memoria intacto (permite nova tentativa no proximo autosave).
        setSaveState({
          status: "error",
          message: "Falha ao salvar. Tente novamente.",
        });
      }
    });
  }

  // Autosave por debounce: espera uma pausa na edicao antes de persistir.
  // Pula a primeira execucao (montagem) — o estado inicial ja veio do banco.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => doSave(state), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isSaving = saveState.status === "saving" || isPending;
  const isExporting = exportState.status === "working";

  /**
   * Agenda o retorno ao estado idle depois de mostrar "Baixado" por um instante,
   * e desmonta o <ExportCapture> (limpa captureData). Reune a limpeza comum aos
   * dois handlers de export.
   */
  function finishExport(kind: "zip" | "single") {
    setCaptureData(null);
    setExportState({ status: "done", kind });
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    doneTimerRef.current = setTimeout(() => {
      setExportState({ status: "idle" });
    }, 2000);
  }

  /** Limpeza comum ao falhar: desmonta a captura e mostra erro legivel. */
  function failExport() {
    setCaptureData(null);
    setExportState({ status: "error", message: EXPORT_ERROR_MESSAGE });
  }

  /**
   * Baixa TODOS os slides como ZIP. Resolve os SlideData canvas-safe (imagens
   * cross-origin viram data-URL), monta o <ExportCapture> sob demanda, aguarda o
   * paint, captura os nos em sequencia e dispara o download do .zip.
   */
  async function handleExportZip() {
    // Guarda: sem slides nao ha o que exportar (o botao ja fica disabled; 2a linha).
    if (state.slides.length === 0) {
      setExportState({ status: "error", message: "Adicione ao menos um slide." });
      return;
    }

    setExportState({ status: "working", kind: "zip" });
    try {
      // Pre-processa TODOS os slides (paralelo: sao fetches, nao canvases).
      const data = await Promise.all(
        state.slides.map((slide) =>
          toSlideDataForExport(state.identity, slide, state.theme),
        ),
      );
      // Monta o <ExportCapture> e espera o React pintar os nos.
      setCaptureData(data);
      await waitForPaint();

      const nodes = captureRef.current?.getNodes() ?? [];
      if (nodes.length !== state.slides.length) {
        throw new Error("Nos de captura ausentes apos o render.");
      }
      const fileNames = state.slides.map((_, index) => slidePngName(index));
      await exportCarouselToZip(nodes, fileNames, zipFileName(state.title));

      finishExport("zip");
    } catch (err) {
      // Detalhe tecnico so no console; usuario ve mensagem generica.
      console.error("Falha ao exportar ZIP:", err);
      failExport();
    }
  }

  /**
   * Baixa apenas o slide SELECIONADO como PNG. Mesmo pipeline do ZIP, mas captura
   * um unico no (o do slide selecionado) e usa exportSlideToPng.
   */
  async function handleExportSlide() {
    if (!selectedSlide) return;
    const index = state.slides.findIndex((s) => s.id === selectedSlide.id);
    if (index === -1) return;

    setExportState({ status: "working", kind: "single" });
    try {
      const data = await toSlideDataForExport(
        state.identity,
        selectedSlide,
        state.theme,
      );
      // Monta so o no do slide alvo (lista de 1) e espera o paint.
      setCaptureData([data]);
      await waitForPaint();

      const node = captureRef.current?.getNodeAt(0) ?? null;
      if (!node) {
        throw new Error("No de captura ausente apos o render.");
      }
      await exportSlideToPng(node, slidePngName(index));

      finishExport("single");
    } catch (err) {
      console.error("Falha ao exportar slide:", err);
      failExport();
    }
  }

  /** Exclui o carrossel (action real) e volta ao Histórico. */
  function handleDelete() {
    const carouselId = state.carouselId;
    if (!carouselId) return;

    setIsDeleting(true);
    startTransition(async () => {
      try {
        await deleteCarousel(carouselId);
        router.push("/carousels");
      } catch {
        setIsDeleting(false);
        setIsDeleteOpen(false);
      }
    });
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Cabecalho: titulo editavel + status do autosave + excluir. */}
      <header className="sticky top-14 z-10 flex h-14 flex-wrap items-center gap-3 border-b border-border bg-background/80 px-5 backdrop-blur lg:top-0">
        <Input
          value={title}
          placeholder={DEFAULT_CAROUSEL_TITLE}
          aria-label="Título do carrossel"
          onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
          className="h-8 max-w-xs border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-input focus-visible:border-input"
        />

        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {saveState.status === "saving" || isPending ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Salvando…
            </>
          ) : saveState.status === "error" ? (
            <span role="alert" className="text-destructive">
              {saveState.message}
            </span>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Salvo
            </>
          )}
        </span>

        {/* Assistente de IA: abre o drawer (não é mais coluna fixa). */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setIsAssistantOpen(true)}
        >
          <Sparkles className="h-4 w-4" />
          Assistente IA
        </Button>

        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!state.carouselId}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir carrossel</DialogTitle>
              <DialogDescription>
                Tem certeza que quer excluir &quot;{title}&quot;? Essa ação não pode
                ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Excluindo…" : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {/* Nos de captura off-screen — montados SOB DEMANDA (captureData != null)
          so durante um export. Nao afeta a UI visivel nem o preview. */}
      {captureData !== null ? (
        <ExportCapture ref={captureRef} slides={captureData} />
      ) : null}

      {/* Layout 2 colunas (ADR 0004 revisada): edição | preview protagonista.
          O assistente saiu da grade (virou drawer). Empilha abaixo de lg na
          ordem natural: edição -> preview. */}
      <div className="flex flex-1 flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row lg:overflow-hidden">
        {/* ESQUERDA: edição (slides + slide selecionado). Enxuta, ~38%. */}
        <div className="min-w-0 shrink-0 space-y-4 overflow-y-auto p-4 lg:w-[380px] lg:border-r lg:border-border">
          <SlideNav
            slides={state.slides}
            selectedSlideId={state.selectedSlideId}
            dispatch={dispatch}
          />
          <SlideEditor slide={selectedSlide} dispatch={dispatch} />
        </div>

        {/* DIREITA: preview protagonista. Ordem: baixar (topo) -> preview ->
            identidade (abaixo). */}
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto border-t border-border p-4 lg:border-t-0">
          {/* Exportação ACIMA do preview. */}
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1 justify-center"
              onClick={handleExportZip}
              disabled={state.slides.length === 0 || isExporting || isSaving}
            >
              {exportState.status === "done" && exportState.kind === "zip" ? (
                <Check className="h-4 w-4" />
              ) : (
                <FileArchive className="h-4 w-4" />
              )}
              {exportState.status === "working" && exportState.kind === "zip"
                ? "Gerando ZIP…"
                : "Baixar todos (ZIP)"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 justify-center"
              onClick={handleExportSlide}
              disabled={selectedSlide === null || isExporting || isSaving}
            >
              {exportState.status === "done" && exportState.kind === "single" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exportState.status === "working" && exportState.kind === "single"
                ? "Gerando…"
                : "Este slide (PNG)"}
            </Button>
          </div>

          {/* Feedback do export (aria-live). */}
          <div aria-live="polite" className="min-h-[1.25rem]">
            {exportState.status === "done" ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Exportado.
              </p>
            ) : null}
            {exportState.status === "error" ? (
              <p role="alert" className="text-sm text-destructive">
                {exportState.message}
              </p>
            ) : null}
          </div>

          {/* Preview protagonista. */}
          <ThemePreview
            identity={state.identity}
            theme={state.theme}
            slides={state.slides}
            slide={selectedSlide}
            dispatch={dispatch}
          />

          {/* Identidade ABAIXO do preview. */}
          <IdentityPanel identity={state.identity} dispatch={dispatch} />
        </div>
      </div>

      {/* Drawer do Assistente de IA — abre pelo botão do header. */}
      <Sheet open={isAssistantOpen} onOpenChange={setIsAssistantOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="space-y-0 border-b border-border px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Assistente IA
            </SheetTitle>
            {/* Descrição só para leitores de tela (o banner visível vem no painel). */}
            <SheetDescription className="sr-only">
              Descreva o carrossel e a IA gera os slides aqui no editor.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <AssistantPanel onApply={handleApplyGenerated} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
