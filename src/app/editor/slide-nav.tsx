"use client";

import type { Dispatch } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { EditorAction, EditorSlide } from "@/lib/editor-state";

interface SlideNavProps {
  slides: EditorSlide[];
  selectedSlideId: string | null;
  dispatch: Dispatch<EditorAction>;
}

// Trecho textual do corpo para identificar o slide na lista (fallback: "vazio").
function bodyPreview(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return "Slide vazio";
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
}

/**
 * Navegacao de slides: lista (com destaque no selecionado), selecionar, adicionar,
 * remover e mover ↑/↓ (com `disabled` nas pontas).
 */
export function SlideNav({
  slides,
  selectedSlideId,
  dispatch,
}: SlideNavProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Slides</CardTitle>
        <Button
          type="button"
          size="sm"
          onClick={() => dispatch({ type: "ADD_SLIDE" })}
        >
          <Plus className="h-4 w-4" />
          Adicionar slide
        </Button>
      </CardHeader>

      <CardContent>
        {slides.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum slide. Clique em &quot;Adicionar slide&quot; para comecar.
          </p>
        ) : (
          <ul className="space-y-2">
            {slides.map((slide, index) => {
              const isSelected = slide.id === selectedSlideId;
              const isFirst = index === 0;
              const isLast = index === slides.length - 1;
              return (
                <li key={slide.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2 transition-colors",
                      isSelected
                        ? "border-primary bg-accent"
                        : "border-border",
                    )}
                  >
                    {/* Selecionar: botao que ocupa o espaco textual do item. */}
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: "SELECT_SLIDE", id: slide.id })
                      }
                      aria-current={isSelected}
                      className="flex min-w-0 flex-1 flex-col items-start rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        Slide {index + 1}
                      </span>
                      <span className="w-full truncate text-sm">
                        {bodyPreview(slide.body)}
                      </span>
                    </button>

                    {/* Mover ↑ — desabilitado no primeiro. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isFirst}
                      aria-label={`Mover slide ${index + 1} para cima`}
                      onClick={() =>
                        dispatch({
                          type: "MOVE_SLIDE",
                          id: slide.id,
                          direction: "up",
                        })
                      }
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>

                    {/* Mover ↓ — desabilitado no ultimo. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isLast}
                      aria-label={`Mover slide ${index + 1} para baixo`}
                      onClick={() =>
                        dispatch({
                          type: "MOVE_SLIDE",
                          id: slide.id,
                          direction: "down",
                        })
                      }
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>

                    {/* Remover — variant destructive. */}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remover slide ${index + 1}`}
                      onClick={() =>
                        dispatch({ type: "REMOVE_SLIDE", id: slide.id })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
