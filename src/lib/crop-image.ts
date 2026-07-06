// Recorte REAL de imagem (substitui o crop mock). Recebe a area selecionada pelo
// usuario (em pixels da imagem natural, contrato do react-easy-crop), desenha num
// canvas do tamanho exato dessa area e devolve um File pronto para upload. Usa
// APIs de browser (Image/canvas) — so roda no client, acionado por handler.

/** Area de corte em pixels da imagem natural (formato do react-easy-crop). */
export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Carrega uma imagem a partir de uma URL (object URL) e resolve quando pronta. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () =>
      reject(new Error("Falha ao carregar a imagem.")),
    );
    image.src = src;
  });
}

/**
 * Recorta `imageSrc` na area `area` (px naturais) e devolve um File PNG. O canvas
 * tem o tamanho exato da area recortada: o que o usuario enquadrou (arrastar +
 * zoom) e exatamente o que sai — nada de zoom decorativo. Preserva o nome-base do
 * arquivo original (re-encoda para PNG, entao troca a extensao).
 */
export async function getCroppedImageFile(
  imageSrc: string,
  area: CropAreaPixels,
  fileName: string,
): Promise<File> {
  const image = await loadImage(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível.");

  // Copia so o retangulo selecionado da imagem original para o canvas cheio.
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height, // origem (recorte na imagem natural)
    0,
    0,
    canvas.width,
    canvas.height, // destino (canvas inteiro)
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("Falha ao gerar a imagem recortada.");

  // Nome estavel com extensao .png (o corte re-encoda para PNG).
  const baseName = fileName.replace(/\.[^./\\]+$/, "") || "imagem";
  return new File([blob], `${baseName}.png`, { type: "image/png" });
}
