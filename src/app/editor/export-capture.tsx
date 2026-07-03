"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

import { Slide } from "@/components/slide/slide";
import { CANVAS_H, CANVAS_W } from "@/components/slide/slide-tokens";
import type { SlideData } from "@/components/slide/types";

// Componente de captura off-screen (S4). Monta N nos <Slide> em 1080x1350 REAIS
// fora da viewport, um por slide, na ORDEM do array. NAO e visivel (aria-hidden,
// position absolute left:-99999). O pai captura esses nos via ref. Recebe os
// SlideData JA resolvidos (imagens em data-URL) — a conversao cross-origin
// acontece no handler de export, fora deste componente e fora do <Slide>.

/** Handle exposto ao pai para ler os nos de captura. */
export interface ExportCaptureHandle {
  /** Todos os nos, na ordem do carrossel. */
  getNodes(): HTMLElement[];
  /** No de um slide especifico (para "Baixar slide"); null se indice invalido. */
  getNodeAt(index0: number): HTMLElement | null;
}

interface ExportCaptureProps {
  /** SlideData ja canvas-safe, na ordem do carrossel (fonte da ordem = array). */
  slides: SlideData[];
}

/**
 * Monta os nos de captura declarativamente (como render-test faz) e expoe os
 * refs ao pai. Renderizado SOB DEMANDA no clique de export (o pai so monta
 * quando ha `slides` a capturar), entao nao re-renderiza a cada tecla nem
 * dispara fetch de imagem repetido.
 */
export const ExportCapture = forwardRef<ExportCaptureHandle, ExportCaptureProps>(
  function ExportCapture({ slides }, ref) {
    // Array de refs, um por no de captura. Populado durante o render.
    const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);

    useImperativeHandle(
      ref,
      () => ({
        getNodes() {
          // Filtra nulos (nenhum deve existir apos o paint) preservando a ordem.
          return nodeRefs.current.filter(
            (node): node is HTMLDivElement => node !== null,
          );
        },
        getNodeAt(index0) {
          return nodeRefs.current[index0] ?? null;
        },
      }),
      // slides muda -> os nos podem mudar; recria o handle para refletir.
      [slides],
    );

    return (
      // Container fora da viewport: nao polui a UI visivel, nao afeta layout.
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: -99999,
          top: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          pointerEvents: "none",
        }}
      >
        {slides.map((data, index) => (
          // Cada no e 1080x1350 FISICO (nao escala por transform: e o no de
          // captura real). Key por indice: a lista e efemera e nao reordena
          // durante a vida deste componente (montado so para o export).
          <div
            key={index}
            ref={(node) => {
              nodeRefs.current[index] = node;
            }}
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            <Slide data={data} />
          </div>
        ))}
      </div>
    );
  },
);
