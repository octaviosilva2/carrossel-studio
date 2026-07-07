"use client";

import { toPng } from "html-to-image";
import JSZip from "jszip";

import { CANVAS_H, CANVAS_W } from "@/components/slide/slide-tokens";
import { toSlideData } from "@/lib/editor-state";
import type {
  CarouselIdentity,
  EditorSlide,
} from "@/lib/editor-state";
import type { SlideData, SlideTheme } from "@/components/slide/types";

// Utilitario de export DOM->PNG (client-side: usa window/document/canvas).
// Estrategia de dimensao: o no do <Slide> ja e renderizado em 1080x1350 px CSS
// REAIS, entao capturamos com pixelRatio 1 -> o PNG sai EXATAMENTE 1080x1350,
// sem fator de escala (elimina o risco de DPR errado, o criterio central da S1).

export interface ExportResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

// Aguarda toda <img> dentro do no terminar de DECODIFICAR antes de rasterizar.
// Sem isso ha uma corrida entre o toPng() e o decode assincrono da imagem (o
// avatar, em especial, e uma data-URL base64 grande) — em celulares, mais lentos
// pra decodificar, a corrida se perde com frequencia e o avatar sai em branco no
// PNG exportado (o preview na tela nunca mostra esse bug, so a captura).
async function waitForImagesDecoded(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => (img.decode ? img.decode().catch(() => undefined) : undefined)),
  );
}

/**
 * Captura o no do slide (que deve estar em 1080x1350 reais) e devolve o PNG.
 * Aguarda as fontes E as imagens ficarem prontas antes de capturar, senao o
 * canvas cai em fallback (ou sai com imagem em branco) e quebra a fidelidade
 * ao modelo.
 */
export async function renderSlideToPng(node: HTMLElement): Promise<ExportResult> {
  // Garante que as fontes (Segoe UI / fallback) estao carregadas antes de rasterizar.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }
  await waitForImagesDecoded(node);

  const dataUrl = await toPng(node, {
    width: CANVAS_W,
    height: CANVAS_H,
    pixelRatio: 1, // no ja esta no tamanho fisico final -> 1:1
    cacheBust: true, // evita asset em cache stale
  });

  const blob = await dataUrlToBlob(dataUrl);
  return { blob, dataUrl, width: CANVAS_W, height: CANVAS_H };
}

/**
 * Renderiza e compartilha/baixa o PNG (ver `shareOrDownloadBlob`). Retorna o
 * resultado para quem quiser inspecionar (ex.: mostrar confirmacao de dimensao).
 */
export async function exportSlideToPng(
  node: HTMLElement,
  fileName: string
): Promise<ExportResult> {
  const result = await renderSlideToPng(node);
  await shareOrDownloadBlob(result.blob, fileName.endsWith(".png") ? fileName : `${fileName}.png`);
  return result;
}

// Converte a data-URL do PNG em Blob (para download e para o teste ler dimensoes).
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Compartilha o arquivo pelo share sheet nativo quando suportado (mobile: e o
 * caminho que deixa "Salvar imagem"/"Salvar na galeria" nativos do SO, em vez
 * de so cair na pasta Downloads do navegador sem confirmacao visual); senao cai
 * no download tradicional (<a download>, comportamento de sempre no desktop).
 * Cancelamento explicito do share (AbortError) NAO cai no fallback — o usuario
 * so fechou o share sheet, nao pediu pra baixar de outro jeito.
 */
export async function shareOrDownloadBlob(blob: Blob, fileName: string): Promise<void> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        // Checa `.name` direto (nao `instanceof Error`): o AbortError do share e
        // um DOMException, e em alguns runtimes (jsdom incluso) ele nao encadeia
        // o prototype ate Error — `.name` e o jeito confiavel de identificar.
        const name = err && typeof err === "object" ? (err as { name?: unknown }).name : undefined;
        if (name === "AbortError") return;
        // Outro erro do share (raro): cai pro download tradicional abaixo.
      }
    }
  }
  triggerBlobDownload(blob, fileName);
}

// ===========================================================================
// S4 — export multi-slide (ZIP) + mitigacao de tainted canvas. Aditivo puro:
// nada acima muda. renderSlideToPng/exportSlideToPng (pixelRatio 1) sao reusados.
// ===========================================================================

/**
 * Dispara o download de um Blob arbitrario (ZIP, PNG) via URL.createObjectURL.
 * Para um ZIP grande, objectURL evita materializar uma data-URL gigante em
 * memoria. Revoga o objectURL apos o click (nao vazar).
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoga apos o tick atual: garante que o browser ja iniciou o download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Captura uma lista ordenada de nos <Slide> (cada um 1080x1350 REAIS) em
 * SEQUENCIA — nao em paralelo, para nao acumular N canvases grandes em memoria
 * (risco em carrossel longo). Preserva a ordem de entrada = ordem do carrossel.
 * Se um no falhar, o erro propaga e a UI trata (mostra erro, editor segue vivo).
 */
export async function renderSlidesToPngs(
  nodes: HTMLElement[],
): Promise<ExportResult[]> {
  // Aguarda as fontes UMA vez para todos os nos (renderSlideToPng tambem aguarda,
  // mas o ready global cobre a captura em lote sem esperas redundantes relevantes).
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const results: ExportResult[] = [];
  for (const node of nodes) {
    // Sequencial de proposito: um canvas por vez. Nao usar Promise.all.
    const result = await renderSlideToPng(node);
    results.push(result);
  }
  return results;
}

/**
 * Captura todos os nos, monta um ZIP com um PNG por no (nome vindo de
 * `fileNames[i]`) e dispara o download do .zip com nome `zipName`.
 * Contrato do chamador: `fileNames.length` DEVE ser igual a `nodes.length`.
 */
export async function exportCarouselToZip(
  nodes: HTMLElement[],
  fileNames: string[],
  zipName: string,
): Promise<void> {
  // Segunda linha de defesa (o chamador ja desabilita o botao com 0 slides):
  // falha fechado se nao ha nada a exportar.
  if (nodes.length === 0) {
    throw new Error("Nenhum slide para exportar.");
  }
  if (fileNames.length !== nodes.length) {
    throw new Error("Quantidade de nomes diferente da de slides.");
  }

  const results = await renderSlidesToPngs(nodes);

  const zip = new JSZip();
  results.forEach((result, index) => {
    // PNGs na RAIZ do ZIP (sem subpasta). fileNames[i] pareado por indice; o
    // guarda de tamanho acima garante o acesso (noUncheckedIndexedAccess).
    const name = fileNames[index];
    if (!name) {
      throw new Error("Nome de arquivo ausente para um slide.");
    }
    zip.file(name, result.blob);
  });

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(zipBlob, zipName);
}

// --- Mitigacao do tainted canvas (imagem cross-origin do Vercel Blob) --------

/**
 * Host cross-origin permitido para o fetch de bytes do export: SO o storage publico
 * do MinIO (`storage.evoiatecnologia.com`, S3_PUBLIC_HOST) — o unico lugar de onde
 * imagens de avatar/slide legitimamente vem. Recusa qualquer outro host: a URL da
 * imagem pode vir de dado persistido; nao viramos um proxy de fetch arbitrario.
 * Exportada para teste.
 *
 * O MinIO path-style serve os objetos do PROPRIO host (`storage.evoiatecnologia.com/
 * <bucket>/<key>`), sem subdominio de store — por isso aceitamos o host EXATO. O
 * `|| endsWith(".storage...")` cobre um eventual virtual-hosted futuro sem custo,
 * mantendo o match por sufixo de ROTULO (o ponto na frente barra
 * `evil-storage.evoiatecnologia.com`; `...com.evil.com` tambem cai fora).
 *
 * NOTA: literal fixo em vez de S3_PUBLIC_HOST porque este modulo roda no BROWSER e
 * `@/lib/env` e server-only. Se o host publico mudar, atualizar aqui e no `.env`.
 */
export function isAllowedBlobHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "storage.evoiatecnologia.com" ||
    host.endsWith(".storage.evoiatecnologia.com")
  );
}


/**
 * Converte uma URL de imagem para uma forma SAFE de canvas (data-URL same-origin),
 * a ser injetada no SlideData de captura ANTES de rasterizar — assim o <Slide>
 * compartilhado nao precisa de `crossOrigin` e o preview fica intocado.
 *
 * - "" / undefined            -> retorna como veio (sem imagem).
 * - ja e data-URL             -> retorna igual (avatar default SVG, imagem via FileReader).
 * - http(s) same-origin       -> retorna igual (nao taint-a).
 * - http(s) CROSS-ORIGIN      -> fetch(url) -> blob -> FileReader -> data-URL.
 *   Se o fetch/leitura falhar (CORS/rede), LANCA erro legivel: o export inteiro
 *   falha com mensagem e o editor segue vivo (AC de erro).
 */
export async function toExportSafeUrl(
  url: string | undefined,
): Promise<string | undefined> {
  if (!url) return url;
  // data-URL ja e same-origin e canvas-safe.
  if (url.startsWith("data:")) return url;

  // Resolve a origem relativa a pagina atual; so http(s) cross-origin precisa fetch.
  let parsed: URL;
  try {
    parsed = new URL(url, location.href);
  } catch {
    // URL malformada: devolve como veio; o <Slide> lidara (ou o toPng falhara).
    return url;
  }

  const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
  const isCrossOrigin = parsed.origin !== location.origin;
  if (!isHttp || !isCrossOrigin) {
    // same-origin (public/) ou protocolo nao-http: nao taint-a, passa direto.
    return url;
  }

  // Endurecimento (S6): so buscamos bytes de host cross-origin CONFIAVEL — o storage
  // MinIO self-hosted. Qualquer outro host cross-origin e recusado (nao viramos um
  // proxy de fetch de host arbitrario a partir de uma URL que possa ter vindo de dado).
  if (!isAllowedBlobHost(parsed.hostname)) {
    throw new Error("Origem de imagem nao permitida para o export.");
  }

  // Cross-origin (Blob): busca os bytes via PROXY same-origin (/api/blob/proxy) e
  // converte em data-URL. O proxy evita depender de CORS no bucket — o browser fala
  // com o proprio Next (same-origin), que busca do MinIO no servidor. O host ja foi
  // validado acima (allowlist); o proxy revalida no servidor por defesa em profundidade.
  try {
    const proxied = `/api/blob/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxied);
    if (!response.ok) {
      throw new Error(`Falha ao buscar imagem (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (err) {
    // Nao vaza detalhe tecnico ao usuario final; o handler mostra msg generica.
    throw new Error(
      `Nao foi possivel carregar a imagem para o export: ${
        err instanceof Error ? err.message : "erro desconhecido"
      }`,
    );
  }
}

// Le um Blob como data-URL (base64) via FileReader — same-origin, canvas-safe.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("FileReader nao retornou uma data-URL."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha no FileReader."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Versao async de `toSlideData` que troca `avatarUrl` e `imageUrl` por formas
 * canvas-safe (data-URL). Chamada UMA vez por slide ANTES de montar os nos de
 * captura. NAO altera `toSlideData` nem o <Slide>.
 */
export async function toSlideDataForExport(
  identity: CarouselIdentity,
  slide: EditorSlide,
  theme: SlideTheme,
): Promise<SlideData> {
  const base = toSlideData(identity, slide, theme);
  // Avatar default e data-URL SVG (passa direto); avatar custom vindo do Blob
  // e imagem do slide passam pela conversao. Paralelo aqui e ok: sao fetches,
  // nao canvases (o gargalo de memoria e a captura, nao a busca).
  const [avatarUrl, imageUrl] = await Promise.all([
    toExportSafeUrl(base.avatarUrl),
    toExportSafeUrl(base.imageUrl),
  ]);
  return {
    ...base,
    // avatarUrl e obrigatorio (nunca ""); toExportSafeUrl so devolve undefined
    // quando a entrada e vazia — cai no default same-origin ja resolvido antes.
    avatarUrl: avatarUrl ?? base.avatarUrl,
    imageUrl, // undefined => sem imagem (corpo 52)
  };
}

// --- Helpers de nomeacao (puros, testaveis sem browser) ----------------------

/**
 * Nome do PNG por posicao (1-based), zero-pad de 2 digitos: index0 0 -> "slide-01.png".
 * Zero-pad garante ordenacao lexicografica correta com > 9 slides.
 */
export function slidePngName(index0: number): string {
  return `slide-${String(index0 + 1).padStart(2, "0")}.png`;
}

/**
 * Slug do titulo para nome de ZIP. Minusculo, sem acento, apenas [a-z0-9-],
 * colapsa hifens e apara as pontas. Titulo so de simbolos/acento -> "" (o
 * chamador cai no fallback "carrossel.zip").
 */
export function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacriticos (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // nao-alfanumerico vira hifen
    .replace(/^-+|-+$/g, ""); // apara hifens das pontas
}

/**
 * Nome final do ZIP: `<slug>.zip` quando o slug nao e vazio, senao "carrossel.zip".
 */
export function zipFileName(title: string | undefined): string {
  const slug = title ? slugifyTitle(title) : "";
  return slug !== "" ? `${slug}.zip` : "carrossel.zip";
}
