"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";

import { Slide } from "@/components/slide/slide";
import { CANVAS_H, CANVAS_W } from "@/components/slide/slide-tokens";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SlideTheme } from "@/components/slide/types";
import {
  toSlideData,
  type CarouselIdentity,
  type EditorAction,
  type EditorSlide,
} from "@/lib/editor-state";

// Preview escalado — o no do <Slide> continua em 1080x1350 REAIS; a escala e SO CSS
// visual (nunca `zoom`, nunca mexer em width/height do no, para nao quebrar a
// fidelidade do export S4). A largura agora e FLUIDA: mede a coluna (ResizeObserver)
// e escala o slide para preenche-la, com limites min/max — assim o preview cresce
// proporcionalmente com a tela em vez de ficar travado em pixels fixos.
const PREVIEW_MIN_W = 240;
const PREVIEW_MAX_W = 460;

interface ThemePreviewProps {
  identity: CarouselIdentity;
  theme: SlideTheme;
  slides: EditorSlide[];
  // Slide selecionado; null quando o carrossel esta vazio (0 slides).
  slide: EditorSlide | null;
  dispatch: Dispatch<EditorAction>;
}

/**
 * Coluna de preview (redesign): toggle de tema global + preview ao vivo +
 * miniaturas dos slides (clicaveis, despacham SELECT_SLIDE). Re-renderiza
 * sozinho a cada mudanca de estado. Se nao ha slide selecionado, mostra CTA e
 * NAO renderiza o <Slide> (evita <img src=""> quebrado / crash).
 */
export function ThemePreview({
  identity,
  theme,
  slides,
  slide,
  dispatch,
}: ThemePreviewProps) {
  const isDark = theme === "dark";
  const selectedIndex = slide
    ? slides.findIndex((s) => s.id === slide.id)
    : -1;

  // Mede a largura disponivel na coluna e escala o slide para preenche-la (com
  // limites). Comeca em PREVIEW_MAX_W e ajusta apos o mount — sem mismatch de SSR
  // (client component). Recalcula quando a coluna muda de tamanho (janela/split).
  const measureRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(PREVIEW_MAX_W);
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (!width) return;
      setPreviewW(Math.max(PREVIEW_MIN_W, Math.min(PREVIEW_MAX_W, width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const previewScale = previewW / CANVAS_W;
  const previewH = CANVAS_H * previewScale;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">
          Preview
          {slide ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · slide {selectedIndex + 1}/{slides.length}
            </span>
          ) : null}
        </CardTitle>
        {/* Toggle de tema global do carrossel (claro/escuro). */}
        <div className="flex items-center gap-2">
          <Label htmlFor="theme-toggle" className="text-sm text-muted-foreground">
            {isDark ? "Escuro" : "Claro"}
          </Label>
          <Switch
            id="theme-toggle"
            checked={isDark}
            onCheckedChange={(checked) =>
              dispatch({ type: "SET_THEME", theme: checked ? "dark" : "light" })
            }
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Wrapper de medicao: ocupa a largura da coluna; o ResizeObserver le daqui. */}
        <div ref={measureRef} className="w-full">
          {slide === null ? (
            // Estado vazio: 0 slides. NAO renderiza <Slide>.
            <div
              style={{ width: previewW, height: previewH }}
              className="mx-auto flex items-center justify-center rounded-md border border-dashed border-border bg-muted/40 p-6 text-center"
            >
              <p className="text-sm text-muted-foreground">
                Adicione um slide para comecar.
              </p>
            </div>
          ) : (
            // Container externo (recorta o excedente da escala).
            <div
              style={{ width: previewW, height: previewH }}
              className="mx-auto overflow-hidden rounded-md border border-border"
            >
              {/* Container interno: 1080x1350 reais, escalado por transform. */}
              <div
                style={{
                  width: CANVAS_W,
                  height: CANVAS_H,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
              >
                <Slide data={toSlideData(identity, slide, theme)} />
              </div>
            </div>
          )}
        </div>

        {/* Miniaturas: clique seleciona o slide (SELECT_SLIDE). */}
        {slides.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {slides.map((item, index) => {
              const isSelected = item.id === slide?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => dispatch({ type: "SELECT_SLIDE", id: item.id })}
                  aria-current={isSelected}
                  aria-label={`Ver slide ${index + 1}`}
                  className={cn(
                    "flex h-14 w-11 shrink-0 items-center justify-center rounded border text-[9px] text-muted-foreground transition-colors",
                    isSelected
                      ? "border-2 border-primary"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
