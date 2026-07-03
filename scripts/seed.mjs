// Seed idempotente: cria o usuario admin + 1 client placeholder editavel.
// Roda em Node puro (fora do type-check). Le credenciais SO do ambiente — NUNCA
// hardcoded; aborta se ausentes. Carrega .env.local explicitamente (Node nao le
// sozinho num script standalone).
//
// Uso: npm run db:seed

import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

config({ path: ".env.local" });

// --- Validacao de env (falha fechado) ----------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

const missing = [];
if (!DATABASE_URL) missing.push("DATABASE_URL");
if (!SEED_ADMIN_EMAIL) missing.push("SEED_ADMIN_EMAIL");
if (!SEED_ADMIN_PASSWORD) missing.push("SEED_ADMIN_PASSWORD");
if (missing.length > 0) {
  console.error(`[seed] Abortado — variaveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

// --- Placeholder de avatar (espelha DEFAULT_AVATAR_DATA_URL de editor-state.ts) ---
// data-URL SVG same-origin (zero CORS no export). Mantido em sincronia manual com
// src/lib/editor-state.ts (o seed nao pode importar TS).
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#cfd9de"/>
  <circle cx="100" cy="78" r="34" fill="#8899a6"/>
  <path d="M40 172c0-33 27-56 60-56s60 23 60 56z" fill="#8899a6"/>
</svg>`;
const DEFAULT_AVATAR_DATA_URL = `data:image/svg+xml,${encodeURIComponent(DEFAULT_AVATAR_SVG)}`;

// --- Seed --------------------------------------------------------------------
// CA pinado do Postgres da VPS (mesma config TLS do runtime em src/db/index.ts).
// Caminho fixo relativo ao cwd; se faltar, readFileSync lanca e o seed aborta
// no boot — nunca conexao sem TLS.
const ca = readFileSync(path.join(process.cwd(), "certs", "db-ca.pem"));

// Remove o `sslmode` da URL: no pg 8.22 ele vira `verify-full` e ignora o CA
// pinado abaixo. Com o objeto `ssl` como unica fonte, a validacao usa o CA.
const cleanUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.delete("sslmode");
  return url.toString();
})();

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: {
    ca, // cadeia validada contra o CA pinado
    rejectUnauthorized: true, // nao e bypass cego
    // Cert self-signed sem SAN: so a checagem de hostname e ignorada; o CA pinado
    // acima garante que o cert e o que confiamos.
    checkServerIdentity: () => undefined,
  },
});

async function main() {
  // Idempotente: se o admin ja existe, nao recria nada.
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
    SEED_ADMIN_EMAIL,
  ]);
  if (existing.rows.length > 0) {
    console.log("[seed] Admin ja existe — nada a fazer (idempotente).");
    return;
  }

  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12);

  // Transacao: user + client atomicos.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [SEED_ADMIN_EMAIL, passwordHash],
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO clients (owner_id, name, handle, avatar_url, verified, theme)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, "Sua Marca", "suamarca", DEFAULT_AVATAR_DATA_URL, false, "light"],
    );

    await client.query("COMMIT");
    console.log(`[seed] Admin + client criados (user ${userId}).`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    // Nunca imprime a senha; so a mensagem de erro.
    console.error("[seed] Falhou:", err.message);
    await pool.end();
    process.exit(1);
  });
