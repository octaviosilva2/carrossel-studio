"use client";

import { useEffect, useRef, useState, useReducer, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  FileArchive,
  MoreVertical,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  AssistantPanel,
  INITIAL_ASSISTANT_MESSAGES,
  type AssistantMessage,
} from "./assistant-panel";
import type { AssistantCarousel } from "@/lib/actions/assistant-types";
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

  // Assistente de IA: recolhido por padrao. Abre por botao no header como drawer
  // sobreposto. O estado do CHAT vive aqui (nao no painel) para PERSISTIR ao fechar/
  // abrir o drawer — a conversa "fica ali" entre idas e vindas.
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(
    INITIAL_ASSISTANT_MESSAGES,
  );
  // Dica que aponta o botao "Assistente IA". Comeca visivel a cada entrada no editor
  // (novo ou ja gerado) e some ao dispensar (X) ou ao abrir o assistente.
  const [showAssistantHint, setShowAssistantHint] = useState(true);

  // Lado do drawer do Assistente: em mobile/tablet (<lg) abre de baixo, em
  // meia altura; em desktop (>=lg) mantem o drawer lateral direito de sempre.
  const [assistantSide, setAssistantSide] = useState<"bottom" | "right">("right");
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setAssistantSide(query.matches ? "right" : "bottom");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  /**
   * Aplica no editor o carrossel PROPOSTO pela IA no chat (substitui titulo +
   * slides). NAO fecha o drawer — o chat continua disponivel. O autosave persiste.
   */
  function handleApplyCarousel(carousel: AssistantCarousel) {
    dispatch({
      type: "APPLY_GENERATED",
      title: carousel.title,
      slides: carousel.slides,
    });
  }

  /** Abre o assistente pelo botao do header e dispensa a dica. */
  function openAssistant() {
    setShowAssistantHint(false);
    setIsAssistantOpen(true);
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
      <header className="sticky top-14 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <Input
          value={title}
          placeholder={DEFAULT_CAROUSEL_TITLE}
          aria-label="Título do carrossel"
          onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-input focus-visible:border-input lg:max-w-xs lg:flex-none"
        />

        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
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

        {/* Desktop (>=lg): Assistente IA + Excluir lado a lado no header, como sempre.
            Em mobile/tablet o Assistente IA fica abaixo de "Adicionar slide" (na coluna
            de edição) e o Excluir vai para o menu de 3 pontinhos abaixo. */}
        <div className="relative ml-auto hidden lg:block">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAssistant}
          >
            <Sparkles className="h-4 w-4" />
            Assistente IA
          </Button>

          {showAssistantHint ? (
            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-border bg-card p-3 text-left shadow-md">
              {/* Setinha apontando o botão. */}
              <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-border bg-card" />
              <button
                type="button"
                aria-label="Dispensar dica"
                onClick={() => setShowAssistantHint(false)}
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Crie com IA
              </p>
              <p className="mt-0.5 pr-4 text-xs text-muted-foreground">
                Abra o Assistente IA para gerar ou ajustar seu carrossel por chat.
              </p>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="hidden lg:inline-flex"
          disabled={!state.carouselId}
          onClick={() => setIsDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </Button>

        {/* Mobile/tablet (<lg): menu de 3 pontinhos com a ação de excluir. */}
        <div className="ml-auto lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Mais opções">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!state.carouselId}
                onSelect={() => setIsDeleteOpen(true)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
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

      {/* Layout 3 colunas proporcionais: edição | preview protagonista | identidade.
          Larguras em % com min/max (escalam com a tela em vez de px fixos). Empilha
          abaixo de lg na ordem: edição -> preview -> identidade+exportação. */}
      <div className="flex flex-1 flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row lg:overflow-hidden">
        {/* ESQUERDA: edição (slides + slide selecionado). Um pouco mais larga. */}
        <div className="min-w-0 shrink-0 space-y-4 overflow-y-auto p-4 lg:w-[34%] lg:min-w-[320px] lg:max-w-[440px] lg:border-r lg:border-border">
          <SlideNav
            slides={state.slides}
            selectedSlideId={state.selectedSlideId}
            dispatch={dispatch}
          />

          {/* Mobile/tablet (<lg): Assistente IA logo abaixo de "Adicionar slide". */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-center lg:hidden"
            onClick={openAssistant}
          >
            <Sparkles className="h-4 w-4" />
            Assistente IA
          </Button>

          <SlideEditor slide={selectedSlide} dispatch={dispatch} />
        </div>

        {/* CENTRO: preview protagonista. Ocupa o espaço restante e centraliza. */}
        <div className="flex min-w-0 flex-1 justify-center overflow-y-auto border-t border-border p-4 lg:border-t-0">
          <div className="w-full max-w-[520px]">
            <ThemePreview
              identity={state.identity}
              theme={state.theme}
              slides={state.slides}
              slide={selectedSlide}
              dispatch={dispatch}
            />
          </div>
        </div>

        {/* DIREITA: identidade (sempre à direita) + exportação abaixo, no espaço que
            sobra. Botões menores, empilhados. */}
        <div className="min-w-0 shrink-0 space-y-4 overflow-y-auto border-t border-border p-4 lg:w-[30%] lg:min-w-[300px] lg:max-w-[360px] lg:border-l lg:border-t-0">
          <IdentityPanel identity={state.identity} dispatch={dispatch} />

          {/* Exportação: agrupada num card compacto, abaixo da identidade. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Exportar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                type="button"
                size="sm"
                className="w-full justify-center"
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
                size="sm"
                className="w-full justify-center"
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Drawer do Assistente de IA. Em mobile/tablet abre de baixo, em meia
          altura; em desktop mantem o drawer lateral direito de sempre. */}
      <Sheet open={isAssistantOpen} onOpenChange={setIsAssistantOpen}>
        <SheetContent
          side={assistantSide}
          className={cn(
            "flex flex-col gap-0 p-0",
            assistantSide === "bottom"
              ? "h-[50vh] rounded-t-xl"
              : "w-full sm:max-w-md",
          )}
        >
          <SheetHeader className="space-y-0 border-b border-border px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Assistente IA
            </SheetTitle>
            {/* Descrição só para leitores de tela. */}
            <SheetDescription className="sr-only">
              Converse com a IA para gerar ou ajustar seu carrossel. Ela pode
              pesquisar na web e propor slides para você aplicar.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <AssistantPanel
              messages={assistantMessages}
              setMessages={setAssistantMessages}
              onApplyCarousel={handleApplyCarousel}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
