"use client";

import { useReducer, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, FileArchive, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { saveCarousel } from "@/lib/actions/carousels";
import type { SaveCarouselInput } from "@/lib/actions/carousel-types";
import { ExportCapture, type ExportCaptureHandle } from "./export-capture";
import { IdentityPanel } from "./identity-panel";
import { SlideNav } from "./slide-nav";
import { SlideEditor } from "./slide-editor";
import { ThemePreview } from "./theme-preview";

// Estado visual do salvamento (union discriminada — impede combinacoes invalidas).
// `idle` = sem acao recente; `saving` = em voo; `saved` = sucesso; `error` = falha
// (o trabalho em memoria e preservado — o usuario pode tentar de novo).
type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

// Estado visual do export (S4) — union discriminada, mesmo padrao do SaveState.
// `kind` distingue ZIP (todos os slides) de single (o slide selecionado), para
// rotular o botao certo como "Gerando…". Em erro, mensagem generica ao usuario.
type ExportState =
  | { status: "idle" }
  | { status: "working"; kind: "zip" | "single" }
  | { status: "done"; kind: "zip" | "single" }
  | { status: "error"; message: string };

// Mensagem generica de falha (nao vaza detalhe tecnico — seguranca-baseline).
const EXPORT_ERROR_MESSAGE = "Falha ao exportar. Tente novamente.";

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
 * Editor manual de carrossel (S2 + persistencia S3). Client Component dono do
 * useReducer, agora semeado pelo estado carregado do banco (`initialState`).
 * Ganha campo Titulo (SET_TITLE) e botao Salvar (saveCarousel), com feedback
 * visual salvando -> salvo -> erro.
 */
export function EditorClient({ initialState }: EditorClientProps) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

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
   * Monta o SaveCarouselInput a partir do estado atual e persiste. So chama a
   * action se houver carouselId (o wrapper server garante que sempre ha um).
   * Em erro NAO afirma "salvo" e preserva o estado do editor (AC edge).
   */
  function handleSave() {
    const carouselId = state.carouselId;
    if (!carouselId) {
      // Guarda defensiva: sem id nao ha o que salvar (nao deveria ocorrer).
      setSaveState({
        status: "error",
        message: "Carrossel sem identificador. Recarregue a página.",
      });
      return;
    }

    // saveCarousel exige ao menos 1 slide (Zod .min(1)). Sem slides, aborta cedo
    // com erro claro em vez de deixar a validacao do servidor estourar.
    if (state.slides.length === 0) {
      setSaveState({
        status: "error",
        message: "Adicione ao menos um slide antes de salvar.",
      });
      return;
    }

    // Monta o payload conforme SaveCarouselSchema: imageUrl so quando houver
    // (slides sem imagem OMITEM o campo; o schema aceita url? opcional).
    const input: SaveCarouselInput = {
      id: carouselId,
      title,
      theme: state.theme,
      identity: {
        name: state.identity.name,
        handle: state.identity.handle,
        avatarUrl: state.identity.avatarUrl,
        verified: state.identity.verified,
      },
      slides: state.slides.map((slide) =>
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
        // o trabalho em memoria intacto (permite nova tentativa).
        setSaveState({
          status: "error",
          message: "Falha ao salvar. Tente novamente.",
        });
      }
    });
  }

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

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Editor de carrossel
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Monte o carrossel slide a slide com preview ao vivo.
              </p>
            </div>

            {/* Titulo do carrossel — editavel, ligado a SET_TITLE. */}
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="carousel-title">Título do carrossel</Label>
              <Input
                id="carousel-title"
                value={title}
                placeholder={DEFAULT_CAROUSEL_TITLE}
                onChange={(e) =>
                  dispatch({ type: "SET_TITLE", title: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/carousels">
                <ArrowLeft className="h-4 w-4" />
                Meus carrosséis
              </Link>
            </Button>

            {/* Baixar ZIP — todos os slides. Desabilitado sem slides, salvando
                ou exportando (evita exports concorrentes). */}
            <Button
              type="button"
              variant="outline"
              size="sm"
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
                : exportState.status === "done" && exportState.kind === "zip"
                  ? "Baixado"
                  : "Baixar ZIP"}
            </Button>

            {/* Baixar slide — o PNG do slide selecionado. Desabilitado sem slide
                selecionado ou durante qualquer export. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
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
                : exportState.status === "done" && exportState.kind === "single"
                  ? "Baixado"
                  : "Baixar slide"}
            </Button>

            {/* Salvar — desabilitado enquanto em voo. */}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {saveState.status === "saved" && !isSaving ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </header>

        {/* Feedback do salvamento (aria-live: leitores anunciam a mudanca). */}
        <div aria-live="polite" className="mb-6 min-h-[1.25rem]">
          {saveState.status === "saved" && !isSaving ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Salvo.
            </p>
          ) : null}
          {saveState.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {saveState.message}
            </p>
          ) : null}
        </div>

        {/* Feedback do export (aria-live gemea da de save). */}
        <div aria-live="polite" className="mb-6 min-h-[1.25rem]">
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

        {/* Nos de captura off-screen — montados SOB DEMANDA (captureData != null)
            so durante um export. Nao afeta a UI visivel nem o preview. */}
        {captureData !== null ? (
          <ExportCapture ref={captureRef} slides={captureData} />
        ) : null}

        {/* Layout: controles a esquerda, preview grudado a direita (desktop). */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* Coluna de controles */}
          <div className="space-y-6">
            <IdentityPanel identity={state.identity} dispatch={dispatch} />
            <SlideNav
              slides={state.slides}
              selectedSlideId={state.selectedSlideId}
              dispatch={dispatch}
            />
            <SlideEditor slide={selectedSlide} dispatch={dispatch} />
          </div>

          {/* Coluna de preview (fica no topo ao rolar em telas largas) */}
          <div className="lg:sticky lg:top-10 lg:self-start">
            <ThemePreview
              identity={state.identity}
              theme={state.theme}
              slide={selectedSlide}
              dispatch={dispatch}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
