// Validacao das variaveis de ambiente do servidor (borda). Falha fechado: se uma
// chave obrigatoria faltar/for invalida, lanca erro claro no boot em vez de deixar
// o app rodar meio configurado. server-only — NUNCA importar em codigo client.

import "server-only";
import { z } from "zod";

// Schema das env vars que o servidor precisa. Nao inclui SEED_* (usadas so pelo
// script de seed, fora do runtime da app — validadas la).
const envSchema = z.object({
  // Conexao pooled do Postgres self-hosted (runtime da app, via PgBouncer/pg).
  DATABASE_URL: z.string().min(1, "DATABASE_URL ausente"),
  // Segredo de assinatura do JWT de sessao (Auth.js).
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET ausente"),
  // --- MinIO / S3 (storage self-hosted; substitui o Vercel Blob) ---
  // Endpoint da API S3 (usado pelo SDK para assinar a presigned PUT). URL completa.
  S3_ENDPOINT: z.string().url("S3_ENDPOINT invalida (esperada URL)"),
  // Host publico onde os objetos ficam acessiveis (sem esquema; usado pra montar
  // a publicUrl path-style e casar com a allowlist do export).
  S3_PUBLIC_HOST: z.string().min(1, "S3_PUBLIC_HOST ausente"),
  // Nome do bucket.
  S3_BUCKET: z.string().min(1, "S3_BUCKET ausente"),
  // Regiao (MinIO exige um valor; nao e AWS real).
  S3_REGION: z.string().min(1, "S3_REGION ausente"),
  // Credenciais S3 — segredo. Nunca logadas (so o nome da chave em erro de env).
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY ausente"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY ausente"),
  // CA pinado do Postgres (conteudo PEM), para ambientes sem filesystem local
  // persistente (Vercel). Opcional: quando ausente, src/db/index.ts cai para o
  // arquivo certs/db-ca.pem (uso local/dev).
  DB_CA_CERT: z.string().optional(),
});

// Parse na carga do modulo. Erro de validacao => throw com mensagem util.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Nunca imprime valores — so os nomes das chaves invalidas.
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(
    `Variaveis de ambiente invalidas ou ausentes: ${missing}. Confira o .env.local.`,
  );
}

/** Env do servidor validada. Tipo derivado do schema (fonte unica de verdade). */
export const env = parsed.data;
