import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes do route handler que gera a presigned PUT do MinIO/S3 (Estagio B). O
// reforco de seguranca do SERVER: (1) exige sessao (sem usuario => 401, nenhuma
// presigned emitida); (2) revalida content-type e tamanho na borda (Zod) — nao
// confia so no client; (3) deriva a key no server; (4) erro interno => 400 generico
// sem vazar detalhe. Mockamos o SDK S3 e o presigner (fronteira externa cara/instavel),
// `@/auth` (controla a sessao) e `@/lib/env` (o handler le S3_* na carga do modulo;
// no jsdom essas envs nao existem, entao mockamos como ja se faz com @/db e @/auth).

const { getSignedUrlMock } = vi.hoisted(() => ({ getSignedUrlMock: vi.fn() }));
const { putObjectCtorMock } = vi.hoisted(() => ({ putObjectCtorMock: vi.fn() }));
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

// Mock do env: o handler importa `env` na carga; sem isso o import quebraria no boot.
vi.mock("@/lib/env", () => ({
  env: {
    S3_ENDPOINT: "https://storage.evoiatecnologia.com",
    S3_PUBLIC_HOST: "storage.evoiatecnologia.com",
    S3_BUCKET: "carrossel-studio",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "test-access",
    S3_SECRET_KEY: "test-secret",
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  // S3Client so precisa existir (instanciado na carga do modulo). Sem comportamento.
  S3Client: class {},
  // PutObjectCommand: registramos os args pra assertar Key/ContentType/ContentLength.
  PutObjectCommand: class {
    constructor(input: unknown) {
      putObjectCtorMock(input);
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

vi.mock("@/auth", () => ({ auth: () => authMock() }));

import { POST } from "@/app/api/blob/upload/route";
import { MAX_IMAGE_BYTES } from "@/lib/image-upload";

/** Request minimo com corpo JSON (a rota faz request.json()). */
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/blob/upload", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Payload valido padrao (PNG de 800 KB). */
function validBody(over: Record<string, unknown> = {}) {
  return { filename: "foto.png", contentType: "image/png", size: 800_000, ...over };
}

beforeEach(() => {
  getSignedUrlMock.mockReset();
  putObjectCtorMock.mockReset();
  authMock.mockReset();
  // Presigned fake por padrao (os testes de sucesso dependem dela).
  getSignedUrlMock.mockResolvedValue(
    "https://storage.evoiatecnologia.com/carrossel-studio/slides/uuid.png?X-Amz-Signature=abc",
  );
});

describe("upload route — gate de sessão", () => {
  it("SEM sessão: responde 401 e não emite presigned", async () => {
    authMock.mockResolvedValue(null); // deslogado

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Não autorizado.");
    // Falha fechado: nenhuma URL assinada gerada.
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("COM sessão + payload válido: 200 com uploadUrl/publicUrl/contentType", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      uploadUrl: string;
      publicUrl: string;
      contentType: string;
    };
    expect(json.uploadUrl).toContain("X-Amz-Signature");
    // publicUrl path-style: host publico + bucket + key derivada no server.
    expect(json.publicUrl).toMatch(
      /^https:\/\/storage\.evoiatecnologia\.com\/carrossel-studio\/slides\/[0-9a-f-]+\.png$/,
    );
    // contentType ecoado (o client usa no header do PUT — precisa bater com o assinado).
    expect(json.contentType).toBe("image/png");
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });
});

describe("upload route — reforço server de tipo/tamanho", () => {
  // A story cita image/gif E application/pdf como exemplos de tipo barrado no
  // server. Ambos caem na mesma regra (z.enum da allowlist) — testados juntos.
  it.each(["image/gif", "application/pdf"])(
    "content-type não permitido (%s) => 400, nenhuma presigned",
    async (contentType) => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });

      const res = await POST(makeRequest(validBody({ contentType })));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Falha no upload.");
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    },
  );

  it("size acima do limite (6 MB + 1) => 400, nenhuma presigned (server, não só client)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(
      makeRequest(validBody({ size: MAX_IMAGE_BYTES + 1 })),
    );

    expect(res.status).toBe(400);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
    // O valor de corte e exatamente 6 MB.
    expect(MAX_IMAGE_BYTES).toBe(6 * 1024 * 1024);
  });

  it("size no limite exato (6 MB) => aceito (200)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(makeRequest(validBody({ size: MAX_IMAGE_BYTES })));

    expect(res.status).toBe(200);
  });

  it("body malformado (não-JSON) => 400, nenhuma presigned", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const badRequest = new Request("http://localhost/api/blob/upload", {
      method: "POST",
      body: "isto-nao-e-json",
      headers: { "content-type": "application/json" },
    });

    const res = await POST(badRequest);

    expect(res.status).toBe(400);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });
});

describe("upload route — ContentLength assinado (reforço de tamanho no MinIO)", () => {
  it("assina ContentType e ContentLength = size no PutObjectCommand", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    await POST(makeRequest(validBody({ size: 123_456 })));

    expect(putObjectCtorMock).toHaveBeenCalledTimes(1);
    const input = putObjectCtorMock.mock.calls[0]?.[0] as {
      Bucket: string;
      Key: string;
      ContentType: string;
      ContentLength: number;
    };
    expect(input.Bucket).toBe("carrossel-studio");
    expect(input.ContentType).toBe("image/png");
    // ContentLength assinado = reforco server: o MinIO recusa PUT com tamanho divergente.
    expect(input.ContentLength).toBe(123_456);
    // Key derivada no SERVER (prefixo slides/ + uuid), nunca vinda do cliente.
    expect(input.Key).toMatch(/^slides\/[0-9a-f-]+\.png$/);
  });
});

describe("upload route — erro interno não vaza detalhe", () => {
  it("falha do presigner (SDK) => 400 genérico, sem vazar a mensagem interna", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getSignedUrlMock.mockRejectedValue(new Error("credencial S3 invalida X"));

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Falha no upload.");
    // Detalhe interno nunca vai no body.
    expect(json.error).not.toContain("credencial S3");
  });
});
