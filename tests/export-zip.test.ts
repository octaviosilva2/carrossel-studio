import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";

// Testa a MONTAGEM e nomeacao do ZIP e as guardas de erro de `exportCarouselToZip`,
// mais o comportamento de `toExportSafeUrl` (mitigacao do tainted canvas).
//
// Estrategia de mock (fronteiras de browser caras/instaveis apenas):
// - `html-to-image.toPng`: mockado para devolver uma data-URL de PNG deterministica
//   por no. Assim `renderSlideToPng`/`renderSlidesToPngs` produzem Blobs REAIS de PNG
//   (via fetch de data-URL, que o jsdom suporta) sem precisar de canvas/DOM real.
//   O objetivo do teste e provar a montagem/ordem do ZIP, nao a rasterizacao.
// - `URL.createObjectURL`/`revokeObjectURL`: stub, pois `triggerBlobDownload`
//   (chamado no fim de exportCarouselToZip) usa objectURL, ausente no jsdom.
//   Capturamos o Blob do ZIP nesse stub para reabrir e inspecionar as entradas.

// PNG 1x1 valido em base64 (assinatura PNG real, para o blob ter type image/png).
const PNG_1x1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const PNG_1x1_DATAURL = `data:image/png;base64,${PNG_1x1_BASE64}`;

// html-to-image e um ESM default+named; mockamos o named `toPng` usado no modulo.
vi.mock("html-to-image", () => ({
  // Cada chamada devolve a mesma data-URL deterministica — suficiente para o ZIP.
  toPng: vi.fn(async () => PNG_1x1_DATAURL),
}));

import {
  exportCarouselToZip,
  toExportSafeUrl,
  slidePngName,
} from "@/lib/export-png";

// Captura o ultimo Blob passado a triggerBlobDownload (via stub de createObjectURL).
let lastObjectUrlBlob: Blob | null = null;

// IMPORTANTE: nao substituir o global `URL` inteiro (o fetch do jsdom/undici usa
// `new URL` internamente). So adicionamos as duas APIs de objectURL ausentes no
// jsdom DIRETAMENTE no construtor URL real, e removemos no afterEach.
// Decodifica a data-URL do PNG mockado em bytes (uma vez).
const PNG_1x1_BYTES = Uint8Array.from(atob(PNG_1x1_BASE64), (c) =>
  c.charCodeAt(0),
);

beforeEach(() => {
  lastObjectUrlBlob = null;
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(
    (blob: Blob) => {
      lastObjectUrlBlob = blob;
      return "blob:mock/zip";
    },
  );
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

  // Silencia o click real do <a download> (triggerBlobDownload) — no jsdom ele
  // dispara "navigation not implemented" (ruido inofensivo). O objectURL ja foi
  // capturado no stub de createObjectURL, entao o click nao precisa fazer nada.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  // Stub de fetch APENAS para a data-URL do PNG mockado: `dataUrlToBlob` (producao)
  // faz fetch(dataUrl).blob(). O Blob que o fetch nativo do jsdom devolve nao e
  // legivel pelo FileReader interno do jszip (quirk do jsdom). Retornamos um Blob
  // construido via `new Blob([bytes])`, que o FileReader do jsdom aceita — assim o
  // caminho REAL de exportCarouselToZip (zip.file(blob) + generateAsync) roda.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (typeof input === "string" && input === PNG_1x1_DATAURL) {
        return {
          ok: true,
          status: 200,
          blob: async () =>
            new Blob([PNG_1x1_BYTES], { type: "image/png" }),
        } as unknown as Response;
      }
      throw new Error(`fetch nao stubbado para: ${String(input)}`);
    }),
  );
});

afterEach(() => {
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Cria um no HTML minimo — o conteudo nao importa (toPng esta mockado), so o tipo.
function fakeNode(): HTMLElement {
  return document.createElement("div");
}

// Reabre o ZIP capturado. Converte o Blob (jsdom) para Buffer via arrayBuffer()
// antes de passar ao JSZip — o FileReader do jsdom rejeita o Blob interno do
// jszip; ler os bytes direto contorna essa incompatibilidade de ambiente de teste
// (nao ha browser real aqui). Nao altera o que esta sendo verificado: os bytes do
// ZIP produzido por exportCarouselToZip sao exatamente os inspecionados.
async function reopenCapturedZip(): Promise<JSZip> {
  expect(lastObjectUrlBlob).not.toBeNull();
  const blob = lastObjectUrlBlob as Blob;
  // jsdom Blob nao expoe arrayBuffer() de forma confiavel; lemos via FileReader
  // (que o jsdom implementa) para obter os bytes crus do ZIP gerado.
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return JSZip.loadAsync(bytes);
}

describe("exportCarouselToZip — monta ZIP valido com N entradas ordenadas", () => {
  it("gera um ZIP com exatamente N PNGs, nomeados na ordem dada", async () => {
    const nodes = [fakeNode(), fakeNode(), fakeNode()];
    const fileNames = [slidePngName(0), slidePngName(1), slidePngName(2)];

    await exportCarouselToZip(nodes, fileNames, "carrossel.zip");

    // O ZIP foi passado ao download via objectURL — reabrimos o Blob capturado.
    expect(lastObjectUrlBlob).not.toBeNull();
    const zip = await reopenCapturedZip();
    const entries = Object.keys(zip.files);

    expect(entries).toHaveLength(3);
    // Ordem exata = ordem de fileNames = ordem do carrossel.
    expect(entries).toEqual(["slide-01.png", "slide-02.png", "slide-03.png"]);
  });

  it("PNGs ficam na raiz do ZIP (sem subpasta)", async () => {
    const nodes = [fakeNode(), fakeNode()];
    const fileNames = [slidePngName(0), slidePngName(1)];

    await exportCarouselToZip(nodes, fileNames, "x.zip");

    const zip = await reopenCapturedZip();
    for (const [name, entry] of Object.entries(zip.files)) {
      expect(name).not.toContain("/"); // sem diretorio interno
      expect(entry.dir).toBe(false);
    }
  });

  it("cada entrada do ZIP contem bytes de um PNG valido (assinatura PNG)", async () => {
    const nodes = [fakeNode()];
    const fileNames = [slidePngName(0)];

    await exportCarouselToZip(nodes, fileNames, "x.zip");

    const zip = await reopenCapturedZip();
    const bytes = await zip.file("slide-01.png")!.async("uint8array");
    // Assinatura PNG: 89 50 4E 47 0D 0A 1A 0A.
    expect(Array.from(bytes.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it("preserva a ordem apos reordenar (nomes recalculados por posicao)", async () => {
    // Simula 5 slides reordenados: os nomes seguem a NOVA posicao, nao o no.
    const nodes = Array.from({ length: 5 }, () => fakeNode());
    const fileNames = nodes.map((_, i) => slidePngName(i));

    await exportCarouselToZip(nodes, fileNames, "x.zip");

    const zip = await reopenCapturedZip();
    expect(Object.keys(zip.files)).toEqual([
      "slide-01.png",
      "slide-02.png",
      "slide-03.png",
      "slide-04.png",
      "slide-05.png",
    ]);
  });
});

describe("exportCarouselToZip — guardas de erro (falha fechado)", () => {
  it("lanca quando nao ha nenhum no (0 slides)", async () => {
    await expect(exportCarouselToZip([], [], "x.zip")).rejects.toThrow(
      /nenhum slide/i,
    );
    // Nada foi baixado.
    expect(lastObjectUrlBlob).toBeNull();
  });

  it("lanca quando a contagem de nomes difere da de nos", async () => {
    const nodes = [fakeNode(), fakeNode()];
    const fileNames = [slidePngName(0)]; // faltando um nome
    await expect(
      exportCarouselToZip(nodes, fileNames, "x.zip"),
    ).rejects.toThrow(/quantidade de nomes/i);
    expect(lastObjectUrlBlob).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toExportSafeUrl — mitigacao do tainted canvas (imagem cross-origin do Blob).
// ---------------------------------------------------------------------------

describe("toExportSafeUrl — normaliza URLs para forma canvas-safe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("undefined passa inalterado (sem imagem)", async () => {
    expect(await toExportSafeUrl(undefined)).toBeUndefined();
  });

  it("string vazia passa inalterada", async () => {
    expect(await toExportSafeUrl("")).toBe("");
  });

  it("data-URL passa inalterada (nao taint-a)", async () => {
    const dataUrl = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    expect(await toExportSafeUrl(dataUrl)).toBe(dataUrl);
  });

  it("URL same-origin (relativa a location) passa inalterada", async () => {
    // location.origin no jsdom e http://localhost:3000 por padrao.
    const sameOrigin = `${location.origin}/avatar.png`;
    expect(await toExportSafeUrl(sameOrigin)).toBe(sameOrigin);
  });

  it("caminho relativo (same-origin) passa inalterado", async () => {
    expect(await toExportSafeUrl("/logo.svg")).toBe("/logo.svg");
  });

  it("cross-origin (MinIO) e convertida via fetch -> data-URL", async () => {
    const crossUrl =
      "https://storage.evoiatecnologia.com/carrossel-studio/imagem.png";
    const pngBytes = Uint8Array.from(atob(PNG_1x1_BASE64), (c) =>
      c.charCodeAt(0),
    );
    // Mocka fetch: retorna um Response.ok com um Blob de PNG.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob([pngBytes], { type: "image/png" }),
      })),
    );

    const result = await toExportSafeUrl(crossUrl);
    expect(result).toBeTypeOf("string");
    expect(result!.startsWith("data:image/png")).toBe(true);
    // Busca via PROXY same-origin (/api/blob/proxy) com a URL original no query,
    // nao um fetch direto ao MinIO — assim o export nao depende de CORS no bucket.
    expect(fetch).toHaveBeenCalledWith(
      `/api/blob/proxy?url=${encodeURIComponent(crossUrl)}`,
    );
  });

  it("cross-origin com fetch !ok lanca erro legivel de export", async () => {
    const crossUrl =
      "https://storage.evoiatecnologia.com/carrossel-studio/faltando.png";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob() })),
    );

    await expect(toExportSafeUrl(crossUrl)).rejects.toThrow(
      /nao foi possivel carregar a imagem/i,
    );
  });

  it("cross-origin com fetch rejeitado (CORS/rede) lanca erro legivel", async () => {
    const crossUrl =
      "https://storage.evoiatecnologia.com/carrossel-studio/cors.png";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(toExportSafeUrl(crossUrl)).rejects.toThrow(
      /nao foi possivel carregar a imagem/i,
    );
  });
});
