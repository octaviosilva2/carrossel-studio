"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ImageCropDialogProps {
  /** Arquivo escolhido no picker; null = dialog fechado. */
  file: File | null;
  /** "circle" para avatar, "rect" para imagem de slide. */
  shape: "circle" | "rect";
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
}

/**
 * Modal de "ajuste" de imagem — VISUAL APENAS (fatia futura: sem lib de crop,
 * sem lógica real de corte de pixel). Mostra o preview do arquivo com uma
 * máscara decorativa (círculo p/ avatar, retângulo p/ slide) e um slider de
 * zoom que não afeta o arquivo enviado. "Aplicar" segue com o arquivo ORIGINAL
 * para o upload real (uploadImageToBlob) — o mesmo caminho de antes do redesign.
 * TODO(fatia futura): trocar por lib de crop real (ex.: react-easy-crop) que
 * gere o arquivo já recortado antes do upload.
 */
export function ImageCropDialog({
  file,
  shape,
  onCancel,
  onConfirm,
  isBusy = false,
}: ImageCropDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.4);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setZoom(1.4);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar imagem</DialogTitle>
        </DialogHeader>

        <div className="relative flex h-64 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              style={{ transform: `scale(${zoom})` }}
              className="h-full w-full object-cover transition-transform"
            />
          ) : null}
          {/* Mascara decorativa: so indica a area de corte, nao recorta de verdade. */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-6 border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]",
              shape === "circle" ? "rounded-full" : "rounded-lg",
            )}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
            aria-label="Zoom da imagem"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Arraste a imagem para reposicionar e use o zoom para enquadrar.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isBusy || !file}>
            {isBusy ? "Enviando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
