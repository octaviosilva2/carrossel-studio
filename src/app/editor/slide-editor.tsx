"use client";

import { useRef, useState, type ChangeEvent, type Dispatch } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EditorAction, EditorSlide } from "@/lib/editor-state";
import { validateImageFile } from "@/lib/image-upload";
import { uploadImageToBlob } from "@/lib/blob-upload";

interface SlideEditorProps {
  // Slide selecionado; null quando o carrossel esta vazio (0 slides).
  slide: EditorSlide | null;
  dispatch: Dispatch<EditorAction>;
}

/**
 * Edicao do slide selecionado: corpo (textarea, preserva "\n\n") + upload/remocao
 * da imagem por-slide. Quando nao ha slide selecionado, mostra CTA e desabilita.
 */
export function SlideEditor({ slide, dispatch }: SlideEditorProps) {
  // Erro de validacao/upload da imagem — estado LOCAL, inline (falha fechado).
  const [imageError, setImageError] = useState<string>("");
  // Upload em voo: desabilita o botao e evita duplo envio.
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cancelou o picker, ou nao ha slide alvo: no-op.
    if (!file || !slide) return;

    // Validacao client antecipada (mesma regra 6 MB/tipo); o wrapper reforca.
    const validation = validateImageFile(file);
    if (!validation.ok) {
      // Rejeitado: erro inline e NAO despacha (imagem anterior permanece).
      setImageError(validation.error);
      e.target.value = "";
      return;
    }

    // Envia ao Vercel Blob (upload real, S3). Em sucesso grava a URL https; em
    // falha mostra erro inline e NAO altera o estado (imagem anterior permanece).
    setIsUploading(true);
    setImageError("");
    const result = await uploadImageToBlob(file);
    setIsUploading(false);
    // Permite reenviar o mesmo arquivo apos remover.
    e.target.value = "";

    if (result.ok) {
      dispatch({ type: "SET_SLIDE_IMAGE", id: slide.id, imageUrl: result.url });
    } else {
      setImageError(result.error);
    }
  }

  function handleRemoveImage() {
    if (!slide) return;
    dispatch({ type: "REMOVE_SLIDE_IMAGE", id: slide.id });
    setImageError("");
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Slide selecionado</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {slide === null ? (
          // Estado vazio: sem slide selecionado (carrossel com 0 slides).
          <p className="text-sm text-muted-foreground">
            Nenhum slide selecionado. Adicione um slide para editar o corpo e a
            imagem.
          </p>
        ) : (
          <>
            {/* Corpo do slide (multi-linha; "\n\n" separa blocos no preview). */}
            <div className="space-y-1.5">
              <Label htmlFor="slide-body">Corpo do slide</Label>
              <Textarea
                id="slide-body"
                value={slide.body}
                placeholder={
                  "Escreva o texto do slide.\n\nUse uma linha em branco para separar blocos de ideia."
                }
                className="min-h-[180px] resize-y"
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_SLIDE_BODY",
                    id: slide.id,
                    body: e.target.value,
                  })
                }
              />
            </div>

            {/* Imagem do slide (upload + remover; por-slide). */}
            <div className="space-y-1.5">
              <Label>Imagem do slide</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  {isUploading
                    ? "Enviando…"
                    : slide.imageUrl
                      ? "Trocar imagem"
                      : "Adicionar imagem"}
                </Button>
                {slide.imageUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover imagem
                  </Button>
                ) : null}
              </div>
              {/* Input nativo escondido; o Button acima e o gatilho visual. */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleImageChange}
              />
              {imageError ? (
                <p className="text-sm text-destructive">{imageError}</p>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
