import { describe, it, expect } from "vitest";

import { validateImageFile, MAX_IMAGE_BYTES } from "@/lib/image-upload";

// Testes da validacao PURA de upload (S2). Primeira borda de input do projeto.
// Regra de fixtures: NUNCA imagem real de cliente — bytes sinteticos apenas.
// Para o caso "acima do limite" nao alocamos 6 MB: sobrescrevemos `file.size`
// via defineProperty (barato e deterministico), mantendo a assinatura File.

/**
 * Constroi um File sintetico com tamanho controlado. `bytes` define o conteudo
 * real (pequeno); `sizeOverride` forca o `.size` reportado sem alocar memoria.
 */
function fakeFile(
  type: string,
  { bytes = 4, sizeOverride }: { bytes?: number; sizeOverride?: number } = {},
): File {
  const file = new File([new Uint8Array(bytes)], "x", { type });
  if (sizeOverride !== undefined) {
    // Forca o size reportado (evita alocar 6 MB reais no teste).
    Object.defineProperty(file, "size", { value: sizeOverride });
  }
  return file;
}

describe("validateImageFile — tipo", () => {
  it("rejeita arquivo nao-imagem (application/pdf) com mensagem de imagem", () => {
    const file = fakeFile("application/pdf");
    const result = validateImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Envie um arquivo de imagem.");
    }
  });

  it("rejeita arquivo sem type (string vazia nao comeca com 'image/')", () => {
    const file = fakeFile("");
    const result = validateImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Envie um arquivo de imagem.");
    }
  });
});

describe("validateImageFile — tamanho", () => {
  it("rejeita imagem acima do limite (MAX + 1) com mensagem de 6 MB", () => {
    const file = fakeFile("image/png", {
      sizeOverride: MAX_IMAGE_BYTES + 1,
    });
    const result = validateImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Imagem acima de 6 MB.");
    }
  });

  it("aceita imagem exatamente no limite (MAX, nao estritamente maior)", () => {
    const file = fakeFile("image/png", { sizeOverride: MAX_IMAGE_BYTES });
    const result = validateImageFile(file);
    expect(result.ok).toBe(true);
  });
});

describe("validateImageFile — caso valido", () => {
  it("aceita image/png pequena (abaixo do limite)", () => {
    const file = fakeFile("image/png", { bytes: 100 });
    const result = validateImageFile(file);
    expect(result.ok).toBe(true);
  });

  it("aceita image/jpeg pequena", () => {
    const file = fakeFile("image/jpeg", { bytes: 100 });
    const result = validateImageFile(file);
    expect(result.ok).toBe(true);
  });
});

describe("MAX_IMAGE_BYTES", () => {
  it("vale exatamente 6 MB (6 * 1024 * 1024)", () => {
    expect(MAX_IMAGE_BYTES).toBe(6 * 1024 * 1024);
  });
});
