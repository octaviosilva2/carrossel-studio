import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Testes da validacao de env do servidor (src/lib/env.ts). O modulo faz
// `safeParse(process.env)` na CARGA e deve falhar FECHADO: se uma chave
// obrigatoria faltar, lanca no boot citando O NOME da(s) chave(s) — nunca os
// valores. Cobre o AC "env.ts remove BLOB_READ_WRITE_TOKEN e adiciona as 6 S3_*
// com validacao Zod; app falha fechado no boot se alguma faltar" + o edge case
// "variavel S3_* ausente -> boot falha fechado em env.ts com o nome da chave".
//
// Detalhe de ambiente: env.ts faz `import "server-only"`, que LANCA sob Vitest
// (resolve o entry `default`, nao `react-server`). Neutralizamos com um mock
// vazio — NAO toca codigo de producao, so o marcador de bundling. Para reavaliar
// o parse por caso, mexemos em process.env, damos vi.resetModules() e reimportamos
// o modulo dinamicamente (o parse roda de novo na nova carga).

vi.mock("server-only", () => ({}));

// Conjunto MINIMO de env valido: todas as chaves que o envSchema exige. Cada
// teste parte daqui e remove/estraga UMA chave para provar a falha isolada.
const VALID_ENV: Record<string, string> = {
  DATABASE_URL: "postgres://user:pass@host:6432/db?sslmode=require",
  AUTH_SECRET: "um-segredo-qualquer-para-o-jwt",
  S3_ENDPOINT: "https://storage.evoiatecnologia.com",
  S3_PUBLIC_HOST: "storage.evoiatecnologia.com",
  S3_BUCKET: "carrossel-studio",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "carrossel-app",
  S3_SECRET_KEY: "um-secret-super-secreto-123",
};

// Guarda o process.env original para restaurar apos cada teste (isolamento).
const ORIGINAL_ENV = process.env;

/** Substitui process.env por uma copia limpa + as chaves passadas. */
function setEnv(overrides: Record<string, string | undefined>): void {
  const next: Record<string, string> = { ...VALID_ENV };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  process.env = next as NodeJS.ProcessEnv;
}

/** Carrega env.ts do zero (novo parse) e devolve o throw como Error, ou null. */
async function loadEnvModuleError(): Promise<Error | null> {
  vi.resetModules();
  try {
    await import("@/lib/env");
    return null;
  } catch (err) {
    return err as Error;
  }
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.resetModules();
});

describe("env.ts — validacao das env vars do servidor (falha fechado)", () => {
  it("com todas as chaves validas: carrega sem lancar e expoe env", async () => {
    setEnv({});
    const error = await loadEnvModuleError();
    expect(error).toBeNull();

    // E o env exportado reflete os valores validados.
    setEnv({});
    vi.resetModules();
    const mod = (await import("@/lib/env")) as { env: Record<string, string> };
    expect(mod.env.S3_BUCKET).toBe("carrossel-studio");
    expect(mod.env.S3_PUBLIC_HOST).toBe("storage.evoiatecnologia.com");
  });

  // --- Cada S3_* ausente -> boot falha com o NOME da chave (edge case) --------
  const s3Keys = [
    "S3_ENDPOINT",
    "S3_PUBLIC_HOST",
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
  ] as const;

  for (const key of s3Keys) {
    it(`${key} ausente => lanca no boot citando o nome da chave`, async () => {
      setEnv({ [key]: undefined });
      const error = await loadEnvModuleError();

      expect(error).toBeInstanceOf(Error);
      // A mensagem cita O NOME da chave faltante (falha fechado, diagnostico util).
      expect(error?.message).toContain(key);
    });
  }

  it("S3_ENDPOINT com valor nao-URL => lanca (regra .url() do Zod)", async () => {
    // A story exige validacao Zod: S3_ENDPOINT e URL. Valor invalido tambem falha.
    setEnv({ S3_ENDPOINT: "nao-e-uma-url" });
    const error = await loadEnvModuleError();

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain("S3_ENDPOINT");
  });

  it("nunca vaza o VALOR de uma chave secreta na mensagem de erro", async () => {
    // S3_SECRET_KEY presente mas S3_ACCESS_KEY ausente: a mensagem deve citar a
    // chave que falta, jamais imprimir o valor do secret que ESTA presente.
    const secret = "valor-secreto-que-nao-pode-vazar-999";
    setEnv({ S3_ACCESS_KEY: undefined, S3_SECRET_KEY: secret });
    const error = await loadEnvModuleError();

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain("S3_ACCESS_KEY");
    // O valor do secret NUNCA aparece na mensagem (so nomes de chave).
    expect(error?.message).not.toContain(secret);
  });

  it("multiplas chaves ausentes => a mensagem cita todas as faltantes", async () => {
    setEnv({ S3_BUCKET: undefined, S3_REGION: undefined });
    const error = await loadEnvModuleError();

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain("S3_BUCKET");
    expect(error?.message).toContain("S3_REGION");
  });

  it("DB_CA_CERT e opcional: ausente NAO impede o boot", async () => {
    setEnv({}); // VALID_ENV nao tem DB_CA_CERT
    expect(process.env.DB_CA_CERT).toBeUndefined();
    const error = await loadEnvModuleError();
    expect(error).toBeNull();
  });

  it("DB_CA_CERT presente: carrega sem lancar e expoe o valor", async () => {
    const pem = "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----";
    setEnv({ DB_CA_CERT: pem });
    vi.resetModules();
    const mod = (await import("@/lib/env")) as { env: Record<string, string> };
    expect(mod.env.DB_CA_CERT).toBe(pem);
  });

  it("BLOB_READ_WRITE_TOKEN foi removido: sua ausencia NAO impede o boot", async () => {
    // AC: env.ts remove BLOB_READ_WRITE_TOKEN. Com as 6 S3_* presentes e sem o
    // token antigo, o boot deve passar (o token nao e mais exigido).
    setEnv({}); // VALID_ENV nao tem BLOB_READ_WRITE_TOKEN
    expect(process.env.BLOB_READ_WRITE_TOKEN).toBeUndefined();
    const error = await loadEnvModuleError();
    expect(error).toBeNull();
  });
});
