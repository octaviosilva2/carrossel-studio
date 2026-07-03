"use client";

import type { Dispatch } from "react";

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
import type { SlideTheme } from "@/components/slide/types";
import {
  toSlideData,
  type CarouselIdentity,
  type EditorAction,
  type EditorSlide,
} from "@/lib/editor-state";

// Preview escalado — fatia herda a formula validada em render-test/page.tsx. O no
// do <Slide> continua em 1080x1350 REAIS; a escala e SO CSS visual (nunca `zoom`,
// nunca mexer em width/height do no, para nao quebrar a fidelidade do export S4).
const PREVIEW_W = 420;
const PREVIEW_SCALE = PREVIEW_W / CANVAS_W;

interface ThemePreviewProps {
  identity: CarouselIdentity;
  theme: SlideTheme;
  // Slide selecionado; null quando o carrossel esta vazio (0 slides).
  slide: EditorSlide | null;
  dispatch: Dispatch<EditorAction>;
}

/**
 * Toggle de tema global + preview ao vivo. Re-renderiza sozinho a cada mudanca de
 * estado (sem botao "atualizar"). Se nao ha slide selecionado, mostra CTA e NAO
 * renderiza o <Slide> (evita <img src=""> quebrado / crash).
 */
export function ThemePreview({
  identity,
  theme,
  slide,
  dispatch,
}: ThemePreviewProps) {
  const isDark = theme === "dark";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Preview</CardTitle>
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

      <CardContent>
        {slide === null ? (
          // Estado vazio: 0 slides. NAO renderiza <Slide>.
          <div
            style={{ width: PREVIEW_W, height: CANVAS_H * PREVIEW_SCALE }}
            className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/40 p-6 text-center"
          >
            <p className="text-sm text-muted-foreground">
              Adicione um slide para comecar.
            </p>
          </div>
        ) : (
          // Container externo (recorta o excedente da escala).
          <div
            style={{ width: PREVIEW_W, height: CANVAS_H * PREVIEW_SCALE }}
            className="overflow-hidden rounded-md border border-border"
          >
            {/* Container interno: 1080x1350 reais, escalado por transform. */}
            <div
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: "top left",
              }}
            >
              <Slide data={toSlideData(identity, slide, theme)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
