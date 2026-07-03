// Config do drizzle-kit (generate/migrate). Roda em Node fora do runtime da app;
// carrega .env.local explicitamente (drizzle-kit nao le sozinho). Migrations usam
// a conexao DIRETA (DATABASE_URL_UNPOOLED), nao o pooler.

import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

const rawUrl = process.env.DATABASE_URL_UNPOOLED;
if (!rawUrl) {
  throw new Error("DATABASE_URL_UNPOOLED ausente — necessario para migrations.");
}

// O Postgres direto (5432) tem um certificado self-signed PROPRIO, diferente do
// certificado do PgBouncer (6432, pinado em certs/db-ca.pem para o runtime da
// app) — confirmado via handshake TLS real contra os dois. sslmode=require na
// URL e tratado como verify-full pelo pg-connection-string e trava a migration
// num hang silencioso contra um CA nao reconhecido; removendo o parametro e
// pinando este CA especifico, a verificacao de cadeia passa a funcionar.
const ca = readFileSync(path.join(process.cwd(), "certs", "db-ca-migrate.pem"));
const url = (() => {
  const u = new URL(rawUrl);
  u.searchParams.delete("sslmode");
  return u.toString();
})();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url,
    ssl: {
      ca,
      rejectUnauthorized: true,
      // Unico bypass: checagem de hostname (cert sem SAN). Mesma decisao do
      // CEO aplicada em src/db/index.ts.
      checkServerIdentity: () => undefined,
    },
  },
});
