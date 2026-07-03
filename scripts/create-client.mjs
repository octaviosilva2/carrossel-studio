// Provisionamento de um cliente novo (modelo done-for-you, S6): cria 1 user (login)
// + 1 client (identidade padrao da marca). Espelha seed.mjs — Node puro (fora do
// type-check), le credenciais SO do ambiente (NUNCA hardcoded), idempotente por
// e-mail, senha hasheada (bcrypt 12). Nunca imprime a senha.
//
// Uso:
//   CLIENT_EMAIL=cliente@x.com CLIENT_PASSWORD='senha-provisoria' \
//   CLIENT_NAME='Marca do Cliente' CLIENT_HANDLE='marcacliente' \
//   npm run client:create
//
// CLIENT_NAME/CLIENT_HANDLE sao opcionais (default: placeholders editaveis depois
// na tela /settings). CLIENT_EMAIL e CLIENT_PASSWORD sao obrigatorios.

import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

config({ path: ".env.local" });

// --- Validacao de env (falha fechado) ----------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const CLIENT_PASSWORD = process.env.CLIENT_PASSWORD;
// Opcionais — editaveis depois em /settings.
const CLIENT_NAME = process.env.CLIENT_NAME || "Sua Marca";
const CLIENT_HANDLE = (process.env.CLIENT_HANDLE || "suamarca").replace(/@/g, "");

const missing = [];
if (!DATABASE_URL) missing.push("DATABASE_URL");
if (!CLIENT_EMAIL) missing.push("CLIENT_EMAIL");
if (!CLIENT_PASSWORD) missing.push("CLIENT_PASSWORD");
if (missing.length > 0) {
  console.error(`[create-client] Abortado — variaveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

// Validacao minima do handle (mesma regra do ClientSettingsSchema: [A-Za-z0-9_]).
if (!/^[A-Za-z0-9_]{1,30}$/.test(CLIENT_HANDLE)) {
  console.error(
    "[create-client] Abortado — CLIENT_HANDLE invalido (use letras, numeros e _, ate 30).",
  );
  process.exit(1);
}

// --- Placeholder de avatar (espelha DEFAULT_AVATAR_DATA_URL de editor-state.ts) ---
// data-URL SVG same-origin (zero CORS no export). Sincronizado manualmente com o TS.
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#cfd9de"/>
  <circle cx="100" cy="78" r="34" fill="#8899a6"/>
  <path d="M40 172c0-33 27-56 60-56s60 23 60 56z" fill="#8899a6"/>
</svg>`;
const DEFAULT_AVATAR_DATA_URL = `data:image/svg+xml,${encodeURIComponent(DEFAULT_AVATAR_SVG)}`;

// --- Provisionamento ----------------------------------------------------------
// CA pinado do Postgres da VPS (mesma config TLS do runtime em src/db/index.ts).
// Caminho fixo relativo ao cwd; se faltar, readFileSync lanca e o script aborta
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
  // Idempotente: se o e-mail ja existe, nao recria nada (nao sobrescreve senha).
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
    CLIENT_EMAIL,
  ]);
  if (existing.rows.length > 0) {
    console.log(
      `[create-client] Ja existe um usuario com esse e-mail — nada a fazer (idempotente).`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(CLIENT_PASSWORD, 12);

  // Transacao: user + client atomicos (nunca um sem o outro).
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [CLIENT_EMAIL, passwordHash],
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO clients (owner_id, name, handle, avatar_url, verified, theme)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, CLIENT_NAME, CLIENT_HANDLE, DEFAULT_AVATAR_DATA_URL, false, "light"],
    );

    await client.query("COMMIT");
    // Nunca imprime a senha; so o que e seguro logar.
    console.log(`[create-client] Cliente criado.`);
    console.log(`  user id : ${userId}`);
    console.log(`  e-mail  : ${CLIENT_EMAIL}`);
    console.log(`  marca   : ${CLIENT_NAME} (@${CLIENT_HANDLE})`);
    console.log(`  Entregue a URL + login; oriente a trocar a senha e ajustar em /settings.`);
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
    console.error("[create-client] Falhou:", err.message);
    await pool.end();
    process.exit(1);
  });
