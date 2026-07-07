// @vitest-environment node
// Ambiente node (undici): monta Request com body FormData e faz request.formData()
// de forma consistente (no jsdom o Content-Type multipart nao e setado no construtor).
// A rota e um handler de servidor — nao precisa de DOM.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Testes do route handler que recebe a imagem e a repassa ao MinIO/S3 PELO SERVIDOR
// (proxy). O reforco de seguranca do SERVER: (1) exige sessao (sem usuario => 401,
// nenhum objeto enviado); (2) revalida content-type e tamanho na borda — nao confia
// so no client; (3) deriva a key no server; (4) erro interno => 400 generico sem
// vazar detalhe. Mockamos o SDK S3 (fronteira externa cara/instavel), `@/auth`
// (controla a sessao) e `@/lib/env` (o handler le S3_* na carga do modulo; no jsdom
// essas envs nao existem, entao mockamos como ja se faz com @/db e @/auth).

const { s3SendMock } = vi.hoisted(() => ({ s3SendMock: vi.fn() }));
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
  // S3Client instanciado na carga do modulo; `send` e o ponto que o handler chama.
  S3Client: class {
    send = s3SendMock;
  },
  // PutObjectCommand: registramos os args pra assertar Key/ContentType/ContentLength.
  PutObjectCommand: class {
    constructor(input: unknown) {
      putObjectCtorMock(input);
    }
  },
}));

vi.mock("@/auth", () => ({ auth: () => authMock() }));

import { POST } from "@/app/api/blob/upload/route";
import { MAX_IMAGE_BYTES } from "@/lib/image-upload";

/** File de teste com `size` bytes reais e o content-type dado. */
function makeFile(
  type = "image/png",
  size = 800_000,
  name = "foto.png",
): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** Request multipart/form-data; `field` controla o valor do campo `file`. */
function makeRequest(field: File | string | null): Request {
  const form = new FormData();
  if (field !== null) form.append("file", field);
  return new Request("http://localhost/api/blob/upload", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  s3SendMock.mockReset();
  putObjectCtorMock.mockReset();
  authMock.mockReset();
  // Envio ao MinIO resolve por padrao (os testes de sucesso dependem disso).
  s3SendMock.mockResolvedValue({});
});

describe("upload route — gate de sessão", () => {
  it("SEM sessão: responde 401 e não envia objeto", async () => {
    authMock.mockResolvedValue(null); // deslogado

    const res = await POST(makeRequest(makeFile()));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Não autorizado.");
    // Falha fechado: nada enviado ao MinIO.
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  it("COM sessão + arquivo válido: 200 com a url pública", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(makeRequest(makeFile()));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    // url path-style: host publico + bucket + key derivada no server.
    expect(json.url).toMatch(
      /^https:\/\/storage\.evoiatecnologia\.com\/carrossel-studio\/slides\/[0-9a-f-]+\.png$/,
    );
    expect(s3SendMock).toHaveBeenCalledTimes(1);
  });
});

describe("upload route — reforço server de tipo/tamanho", () => {
  // A story cita image/gif E application/pdf como exemplos de tipo barrado no
  // server. Ambos caem na mesma regra (allowlist) — testados juntos.
  it.each(["image/gif", "application/pdf"])(
    "content-type não permitido (%s) => 400, nada enviado",
    async (contentType) => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });

      const res = await POST(makeRequest(makeFile(contentType)));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Falha no upload.");
      expect(s3SendMock).not.toHaveBeenCalled();
    },
  );

  it("size acima do limite (6 MB + 1) => 400, nada enviado (server, não só client)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(
      makeRequest(makeFile("image/png", MAX_IMAGE_BYTES + 1)),
    );

    expect(res.status).toBe(400);
    expect(s3SendMock).not.toHaveBeenCalled();
    // O valor de corte e exatamente 6 MB.
    expect(MAX_IMAGE_BYTES).toBe(6 * 1024 * 1024);
  });

  it("size no limite exato (6 MB) => aceito (200)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(
      makeRequest(makeFile("image/png", MAX_IMAGE_BYTES)),
    );

    expect(res.status).toBe(200);
  });

  it("campo `file` ausente ou não-arquivo => 400, nada enviado", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const semCampo = await POST(makeRequest(null));
    expect(semCampo.status).toBe(400);

    const naoArquivo = await POST(makeRequest("isto-nao-e-arquivo"));
    expect(naoArquivo.status).toBe(400);

    expect(s3SendMock).not.toHaveBeenCalled();
  });
});

describe("upload route — PutObjectCommand correto", () => {
  it("envia Bucket, Key derivada, ContentType e ContentLength = tamanho do arquivo", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    await POST(makeRequest(makeFile("image/png", 123_456)));

    expect(putObjectCtorMock).toHaveBeenCalledTimes(1);
    const input = putObjectCtorMock.mock.calls[0]?.[0] as {
      Bucket: string;
      Key: string;
      ContentType: string;
      ContentLength: number;
      Body: Uint8Array;
    };
    expect(input.Bucket).toBe("carrossel-studio");
    expect(input.ContentType).toBe("image/png");
    // ContentLength = bytes reais lidos do arquivo.
    expect(input.ContentLength).toBe(123_456);
    expect(input.Body.byteLength).toBe(123_456);
    // Key derivada no SERVER (prefixo slides/ + uuid), nunca vinda do cliente.
    expect(input.Key).toMatch(/^slides\/[0-9a-f-]+\.png$/);
  });
});

describe("upload route — erro interno não vaza detalhe", () => {
  it("falha do envio (SDK) => 400 genérico, sem vazar a mensagem interna", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    s3SendMock.mockRejectedValue(new Error("credencial S3 invalida X"));

    const res = await POST(makeRequest(makeFile()));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Falha no upload.");
    // Detalhe interno nunca vai no body.
    expect(json.error).not.toContain("credencial S3");
  });
});
