"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCroppedImageFile } from "@/lib/crop-image";

interface ImageCropDialogProps {
  /** Arquivo escolhido no picker; null = dialog fechado. */
  file: File | null;
  /** "circle" para avatar (proporção de foto de perfil), "rect" para imagem de slide. */
  shape: "circle" | "rect";
  onCancel: () => void;
  /** Recebe o arquivo JÁ RECORTADO (crop real), pronto para o upload. */
  onConfirm: (croppedFile: File) => void;
  isBusy?: boolean;
}

// Proporcoes oferecidas para a imagem de SLIDE. "Original" (value null) usa a
// proporcao natural da imagem — o padrao, que reproduz o comportamento de antes
// (imagem inteira, sem corte forcado). As demais recortam para o formato pedido.
type RectRatioKey = "original" | "1:1" | "4:5" | "16:9";
const RECT_RATIOS: { key: RectRatioKey; label: string; value: number | null }[] = [
  { key: "original", label: "Original", value: null },
  { key: "1:1", label: "1:1", value: 1 },
  { key: "4:5", label: "4:5", value: 4 / 5 },
  { key: "16:9", label: "16:9", value: 16 / 9 },
];

/**
 * Modal de ajuste de imagem com CROP REAL (react-easy-crop). Arrastar reposiciona,
 * o slider dá zoom, e "Aplicar" gera o arquivo recortado de verdade (não mais o
 * original). Avatar recorta em círculo 1:1 (foto de perfil); imagem de slide
 * deixa o usuário escolher a proporção, com "Original" como padrão.
 */
export function ImageCropDialog({
  file,
  shape,
  onCancel,
  onConfirm,
  isBusy = false,
}: ImageCropDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  // Proporcao natural da imagem (para a opcao "Original" do slide).
  const [naturalAspect, setNaturalAspect] = useState(1);
  const [ratioKey, setRatioKey] = useState<RectRatioKey>("original");
  const [isCropping, setIsCropping] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    // Reset do enquadramento a cada arquivo novo.
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRatioKey("original");
    setError("");
    // Le a proporcao natural para alimentar a opcao "Original".
    const probe = new Image();
    probe.onload = () =>
      setNaturalAspect(probe.naturalWidth / probe.naturalHeight || 1);
    probe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // aspect efetivo: avatar sempre 1 (círculo); slide segue a proporcao escolhida
  // (Original => proporcao natural da imagem).
  const aspect = useMemo(() => {
    if (shape === "circle") return 1;
    const found = RECT_RATIOS.find((r) => r.key === ratioKey);
    return found?.value ?? naturalAspect;
  }, [shape, ratioKey, naturalAspect]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleApply() {
    if (!file || !previewUrl || !croppedAreaPixels) return;
    setIsCropping(true);
    setError("");
    try {
      const cropped = await getCroppedImageFile(
        previewUrl,
        croppedAreaPixels,
        file.name,
      );
      onConfirm(cropped);
    } catch {
      // Falha do canvas: mostra erro e mantem o dialog aberto para nova tentativa.
      setError("Falha ao recortar. Tente novamente.");
    } finally {
      setIsCropping(false);
    }
  }

  const busy = isBusy || isCropping;

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

        {/* Area de crop real: arrastar reposiciona, zoom enquadra. */}
        <div className="relative h-64 w-full overflow-hidden rounded-lg bg-muted">
          {previewUrl ? (
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape={shape === "circle" ? "round" : "rect"}
              showGrid={shape === "rect"}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : null}
        </div>

        {/* Seletor de proporcao — so para imagem de slide. */}
        {shape === "rect" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Proporção</span>
            <div className="flex flex-wrap gap-1">
              {RECT_RATIOS.map((r) => (
                <Button
                  key={r.key}
                  type="button"
                  size="sm"
                  variant={ratioKey === r.key ? "default" : "outline"}
                  onClick={() => setRatioKey(r.key)}
                  disabled={busy}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Zoom */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
            aria-label="Zoom da imagem"
            disabled={busy}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Arraste a imagem para reposicionar e use o zoom para enquadrar.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={busy || !file || !croppedAreaPixels}
          >
            {busy ? "Enviando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
