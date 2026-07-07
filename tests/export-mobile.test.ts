import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Testa as duas correcoes de export especificas de mobile/tablet:
// 1) shareOrDownloadBlob: no mobile, preferir o share sheet nativo (permite
//    "Salvar na galeria") em vez de so cair na pasta Downloads sem confirmacao
//    visual; cai pro download tradicional quando o share nao esta disponivel,
//    recusa o arquivo, ou falha por um motivo que NAO seja cancelamento do usuario.
// 2) renderSlideToPng aguarda o decode() de toda <img> do no ANTES de chamar
//    domToPng() — reforco de timing (nao e a causa raiz do avatar em branco no
//    Safari/iOS, que e um bug conhecido do proprio pipeline SVG do
//    html-to-image/modern-screenshot, ver comentario em export-png.ts).

vi.mock("modern-screenshot", () => ({
  domToPng: vi.fn(async () => "data:image/png;base64,AAAA"),
}));

import { domToPng } from "modern-screenshot";
import { renderSlideToPng, shareOrDownloadBlob } from "@/lib/export-png";

// --- shareOrDownloadBlob -------------------------------------------------------

let lastObjectUrlBlob: Blob | null = null;
let clickCount = 0;

beforeEach(() => {
  lastObjectUrlBlob = null;
  clickCount = 0;
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(
    (blob: Blob) => {
      lastObjectUrlBlob = blob;
      return "blob:mock/share";
    },
  );
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    clickCount += 1;
  });
});

afterEach(() => {
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  delete (navigator as unknown as { share?: unknown }).share;
  delete (navigator as unknown as { canShare?: unknown }).canShare;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fakeBlob(): Blob {
  return new Blob(["conteudo"], { type: "image/png" });
}

describe("shareOrDownloadBlob", () => {
  it("sem navigator.share (desktop/jsdom padrão) => cai no download tradicional", async () => {
    await shareOrDownloadBlob(fakeBlob(), "slide-01.png");
    expect(lastObjectUrlBlob).not.toBeNull();
    expect(clickCount).toBe(1);
  });

  it("navigator.share disponível e canShare aceita o arquivo => compartilha, NÃO baixa", async () => {
    const shareMock = vi.fn(async () => undefined);
    (navigator as unknown as { share: unknown }).share = shareMock;
    (navigator as unknown as { canShare: unknown }).canShare = () => true;

    await shareOrDownloadBlob(fakeBlob(), "slide-01.png");

    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(lastObjectUrlBlob).toBeNull();
    expect(clickCount).toBe(0);
  });

  it("usuário cancela o share (AbortError) => NÃO cai no download (respeita o cancelamento)", async () => {
    (navigator as unknown as { share: unknown }).share = vi.fn(async () => {
      throw new DOMException("cancelado", "AbortError");
    });
    (navigator as unknown as { canShare: unknown }).canShare = () => true;

    await shareOrDownloadBlob(fakeBlob(), "slide-01.png");

    expect(lastObjectUrlBlob).toBeNull();
    expect(clickCount).toBe(0);
  });

  it("share falha por outro motivo (não-AbortError) => cai no download tradicional", async () => {
    (navigator as unknown as { share: unknown }).share = vi.fn(async () => {
      throw new Error("falhou");
    });
    (navigator as unknown as { canShare: unknown }).canShare = () => true;

    await shareOrDownloadBlob(fakeBlob(), "slide-01.png");

    expect(lastObjectUrlBlob).not.toBeNull();
    expect(clickCount).toBe(1);
  });

  it("navigator.share existe mas canShare recusa o arquivo => cai no download tradicional", async () => {
    (navigator as unknown as { share: unknown }).share = vi.fn(async () => undefined);
    (navigator as unknown as { canShare: unknown }).canShare = () => false;

    await shareOrDownloadBlob(fakeBlob(), "slide-01.png");

    expect(lastObjectUrlBlob).not.toBeNull();
    expect(clickCount).toBe(1);
  });
});

// --- renderSlideToPng — espera o decode() das <img> -----------------------------

describe("renderSlideToPng — aguarda o decode das <img> antes de capturar", () => {
  it("só chama domToPng() depois que a <img> do nó terminou de decodificar", async () => {
    const node = document.createElement("div");
    const img = document.createElement("img");
    let decodeResolved = false;
    img.decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            decodeResolved = true;
            resolve();
          }, 10);
        }),
    );
    node.appendChild(img);

    vi.mocked(domToPng).mockImplementation(async () => {
      expect(decodeResolved).toBe(true);
      return "data:image/png;base64,AAAA";
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob() })),
    );

    await renderSlideToPng(node);

    expect(img.decode).toHaveBeenCalledTimes(1);
  });

  it("imagem cujo decode() rejeita não trava a captura (erro engolido)", async () => {
    const node = document.createElement("div");
    const img = document.createElement("img");
    img.decode = vi.fn(() => Promise.reject(new Error("decode falhou")));
    node.appendChild(img);

    vi.mocked(domToPng).mockResolvedValue("data:image/png;base64,AAAA");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob() })),
    );

    await expect(renderSlideToPng(node)).resolves.toBeDefined();
  });
});
