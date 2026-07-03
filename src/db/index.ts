// Client Drizzle para o runtime da app. Usa o driver `pg` (node-postgres) sobre
// um Pool — o que habilita `db.transaction()`, necessario para o saveCarousel
// atomico (replace-all dos slides). server-only: roda so em Node (server actions
// e route handlers), nunca no browser/edge.

import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// CA pinado do Postgres da VPS. Caminho FIXO relativo ao cwd do processo — nao
// parametrizado por env de proposito (YAGNI: a story e o .gitignore assumem
// certs/db-ca.pem). Se o arquivo faltar, readFileSync lanca ENOENT AQUI, na carga
// do modulo — falha clara e INTENCIONAL no boot: nunca cair pra conexao sem TLS.
// Nao capturar nem silenciar esse erro.
const ca = readFileSync(path.join(process.cwd(), "certs", "db-ca.pem"));

// Remove o `sslmode` da URL para o objeto `ssl` abaixo (CA pinado) ser a UNICA
// fonte da config TLS. No pg 8.22, `sslmode=require` na connection string e
// tratado como `verify-full` e conflita com/sobrescreve o objeto `ssl`, fazendo
// a validacao ignorar o CA pinado -> "self-signed certificate". Tirando o param
// da string, o objeto `ssl` (com o CA) vale sozinho.
const connectionString = (() => {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.delete("sslmode");
  return url.toString();
})();

// Pool sobre a connection string pooled (DATABASE_URL — PgBouncer :6432,
// transaction mode). Reusado entre invocacoes.
const pool = new Pool({
  connectionString,
  // max conservador: sem clientes reais ainda, nao ha necessidade de tuning.
  // Ajuste fino fica pra quando houver carga (YAGNI).
  max: 10,
  ssl: {
    // CA pinado: a cadeia do cert DO servidor E validada contra ele.
    ca,
    // NAO e bypass cego — a validacao da cadeia continua ativa.
    rejectUnauthorized: true,
    // Unico bypass: a checagem de hostname (que exige SAN no cert). O cert do
    // Postgres e self-signed SEM SAN (decisao do CEO: pinning, nao reemitir).
    // Retornar undefined = "hostname ok"; a seguranca vem do CA pinado acima,
    // que ja garante que o cert e exatamente o que confiamos.
    checkServerIdentity: () => undefined,
  },
});

/** Instancia unica do Drizzle, tipada com o schema completo. */
export const db = drizzle(pool, { schema });
