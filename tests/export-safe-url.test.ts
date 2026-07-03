import { describe, it, expect, vi, afterEach } from "vitest";

import { isAllowedBlobHost, toExportSafeUrl } from "@/lib/export-png";

// Endurecimento do export: so buscamos bytes cross-origin do storage MinIO
// (storage.evoiatecnologia.com, S3_PUBLIC_HOST). Estes testes cobrem o allowlist
// puro + o comportamento de toExportSafeUrl nas rotas que NAO precisam de fetch
// (data-URL, same-origin, cross-origin recusado). jsdom expoe location.href =
// http://localhost:3000/. As garantias de seguranca sao as mesmas do Vercel Blob,
// so mudou o host confiavel.

describe("isAllowedBlobHost — allowlist do storage MinIO", () => {
  it("aceita o host EXATO storage.evoiatecnologia.com (path-style)", () => {
    // MinIO path-style serve os objetos do proprio host, sem subdominio de store.
    expect(isAllowedBlobHost("storage.evoiatecnologia.com")).toBe(true);
  });

  it("aceita subdomínio *.storage.evoiatecnologia.com (virtual-hosted futuro)", () => {
    expect(isAllowedBlobHost("carrossel-studio.storage.evoiatecnologia.com")).toBe(
      true,
    );
  });

  it("é case-insensitive", () => {
    expect(isAllowedBlobHost("Storage.EvoiaTecnologia.Com")).toBe(true);
  });

  it("recusa host de sufixo forjado (evil-storage...)", () => {
    // Match por rotulo: '.storage.evoiatecnologia.com' com o ponto na frente barra
    // isto, e o host exato tambem nao casa.
    expect(isAllowedBlobHost("evil-storage.evoiatecnologia.com")).toBe(false);
    expect(isAllowedBlobHost("storage.evoiatecnologia.com.evil.com")).toBe(false);
  });

  it("recusa hosts arbitrários e o IP de metadata", () => {
    expect(isAllowedBlobHost("evil.com")).toBe(false);
    expect(isAllowedBlobHost("localhost")).toBe(false);
    expect(isAllowedBlobHost("169.254.169.254")).toBe(false);
  });
});

describe("toExportSafeUrl — roteamento sem fetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("data-URL passa direto (canvas-safe)", async () => {
    const dataUrl = "data:image/png;base64,AAAA";
    expect(await toExportSafeUrl(dataUrl)).toBe(dataUrl);
  });

  it("undefined/'' passam direto (sem imagem)", async () => {
    expect(await toExportSafeUrl(undefined)).toBeUndefined();
    expect(await toExportSafeUrl("")).toBe("");
  });

  it("same-origin passa direto (não taint-a)", async () => {
    const sameOrigin = `${location.origin}/avatar.png`;
    expect(await toExportSafeUrl(sameOrigin)).toBe(sameOrigin);
  });

  it("cross-origin fora do allowlist é RECUSADO antes de qualquer fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      toExportSafeUrl("https://evil.com/leak.png"),
    ).rejects.toThrow(/nao permitida/i);
    // Prova o falha-fechado: nem chegou a buscar bytes do host proibido.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("host do MinIO permitido passa da allowlist e chega a buscar os bytes", async () => {
    // Mock do fetch para nao sair pra rede. O foco e provar que o host permitido
    // NAO e barrado pela allowlist — o fluxo prossegue ate o fetch (a conversao
    // FileReader->data-URL e coberta pelo smoke real do browser, nao aqui).
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("rede-mockada"));

    await expect(
      toExportSafeUrl(
        "https://storage.evoiatecnologia.com/carrossel-studio/slides/x.png",
      ),
    ).rejects.toThrow();
    // Chegou a buscar os bytes: a allowlist deixou passar (ao contrario do host proibido).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falha de rede/CORS em host permitido => erro LEGIVEL (edge case do export)", async () => {
    // Edge case da story: host permitido mas o fetch falha (CORS/rede). O
    // comportamento esperado NAO e engolir — e lancar um erro legivel para o
    // export inteiro falhar com mensagem, deixando o editor vivo. Provamos a
    // mensagem legivel (nao apenas "lanca algo").
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Failed to fetch"),
    );

    await expect(
      toExportSafeUrl(
        "https://storage.evoiatecnologia.com/carrossel-studio/slides/y.png",
      ),
    ).rejects.toThrow(/nao foi possivel carregar a imagem para o export/i);
  });
});
