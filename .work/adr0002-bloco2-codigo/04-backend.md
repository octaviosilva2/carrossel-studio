# Backend — Migração de infra (Bloco 2, código) · Estágio A (banco Neon→`pg`)

> Só o **Estágio A** desta rodada (driver de banco). Estágio B (storage MinIO/S3) NÃO foi tocado —
> vem numa rodada separada depois do A estar 100% verde, conforme instrução do orquestrador.

## O que foi implementado

- **`src/db/index.ts`** (reescrita completa) — troca o driver Neon serverless (`Pool` +
  WebSocket via `ws`) por **`pg.Pool` + `drizzle-orm/node-postgres`**. Lê o CA pinado de
  `certs/db-ca.pem` via `node:fs` na carga do módulo (falha clara e intencional no boot se ausente —
  nunca conexão sem TLS). Config TLS: `ca` pinado + `rejectUnauthorized: true` (cadeia validada, não é
  bypass cego) + `checkServerIdentity: () => undefined` (único bypass — cert self-signed sem SAN,
  decisão do CEO). `max: 10` (conservador, sem tuning). Bloco de WebSocket/Neon removido por completo.
  `export const db` mantém a assinatura pública (instância Drizzle tipada com `schema`); `db.transaction()`
  segue disponível (garantido pelo `node-postgres`).
- **`scripts/seed.mjs`** (migrado) — de `@neondatabase/serverless`+`ws` para `pg`, com a MESMA config
  TLS (CA pinado + bypass de hostname). Preserva 100% da lógica idempotente (por e-mail) e a transação
  `BEGIN/COMMIT/ROLLBACK`. Nunca imprime a senha.
- **`scripts/create-client.mjs`** (migrado) — idem seed: `pg` + mesma config TLS, lógica idempotente e
  transação intactas.
- **`package.json`** — `rm @neondatabase/serverless ws @types/ws`; `add pg` (dep) + `@types/pg` (dev).
  `package-lock.json` regenerado.
- **`drizzle.config.ts`** — SEM edição (segue lendo `DATABASE_URL_UNPOOLED`). Ver "Desvios" abaixo:
  o `drizzle-kit migrate` NÃO recusou por cert self-signed, então não foi preciso pinar o CA aqui.

## Contrato real entregue

**Nenhum contrato de API/HTTP muda no Estágio A** — é refactor de fronteira de infra. A assinatura
pública consumida pelo resto do código é preservada byte a byte:

```ts
// src/db/index.ts
export const db; // instância Drizzle tipada com `schema`; db.transaction() disponível
```

Todos os consumidores (`src/auth.ts`, `src/lib/client-repo.ts`, `src/lib/actions/*.ts`) importam
`{ db } from "@/db"` e **não mudam**. Frontend: nada a consumir/ajustar nesta etapa (Estágio A não
toca UI, rota nem contrato de tela).

## Migrations / dados

- **Migração destrutiva?** Não. Nenhum `db:generate` novo, nenhum schema alterado. `db:migrate` apenas
  aplicaria o schema já versionado (`drizzle/`) num Postgres vazio na VPS. Nenhum dado real em jogo.
- **`npm run db:migrate` — BLOQUEADO pela porta 5432 fechada.** Rodado contra a VPS; fica pendurado em
  "applying migrations..." indefinidamente (cortado por timeout), **sem** erro de TLS e **sem** concluir.
  Probe TCP confirmou: `72.60.6.238:5432` → **TIMEOUT (filtrada/fechada por firewall)**, exatamente
  como documentado no `.env.local` (linhas 8-13: a 5432 só abre sob demanda no EasyPanel + `ufw`).
  **Esta etapa depende do orquestrador coordenar com o humano para abrir a porta 5432 temporariamente.**
- **`npm run db:seed` — conectou com TLS OK, mas precisa do schema (que depende do migrate).** O seed
  usa `DATABASE_URL` (PgBouncer :6432, que probe confirmou **ABERTA**). Após corrigir o TLS (ver Desvios),
  o seed **conectou e executou SQL contra o Postgres real**, falhando só com `relation "users" does not
  exist` — porque o schema ainda não foi migrado. Isso **prova que o novo driver `pg` + CA pinado
  conecta de verdade na VPS**; só falta o `db:migrate` (porta 5432) rodar antes.
- **RLS / authz:** o projeto não usa RLS do Postgres; authz vive nas server actions (`requireUser` +
  filtro por `ownerId`), não tocada nesta feature. Confirmado.

## Comandos rodados

| Comando | Resultado real |
|---|---|
| `npm rm @neondatabase/serverless ws @types/ws` | `removed 2 packages` — OK |
| `npm i pg` / `npm i -D @types/pg` | `pg@^8.22.0` + `@types/pg@^8.20.0` adicionados — OK |
| `npm run type-check` | **limpo, zero erro** (`@types/pg` cobre o `pg`) |
| `npm run test` | **250 passed, 1 skipped** (18 arquivos) — o skip é o único herdado da S1. Inclui `carousel-actions.test.ts` (19 tests) com a prova de `db.transaction()`/`saveCarousel`, **sem edição** |
| `npm run build` (puro) | **compila + type-check OK**; falha só em "Collecting page data" por `BLOB_READ_WRITE_TOKEN` ausente — **bloqueio do Estágio B** (ver Desvios) |
| `BLOB_READ_WRITE_TOKEN=dummy npm run build` | **build completo, 6/6 páginas geradas** — prova que o Estágio A não bloqueia o build |
| Probe TCP `72.60.6.238:5432` / `:6432` | 5432 = **TIMEOUT (fechada)**; 6432 = **ABERTA** |
| `npm run db:seed` (após fix TLS) | conectou via PgBouncer + CA pinado; `relation "users" does not exist` (schema não migrado — esperado) |
| `npm run db:migrate` | pendurado em "applying migrations…" (porta 5432 filtrada); cortado por timeout; **sem** erro de cert |
| Busca textual `@neondatabase/serverless|neonConfig|neon-serverless` em `src/`,`tests/`,`scripts/` | **zero ocorrência** |
| `ws`/`@types/ws` como dep direta | **não sobra** no `package.json`; no `package-lock.json` `ws` existe só como **transitiva legítima do `jsdom`** (dev/test) — aceitável (decisão do gate, R3) |

## Desvios da spec

1. **Remoção do `sslmode` da connection string em código (necessário, não previsto na spec).**
   A spec dizia `connectionString: env.DATABASE_URL` direto. Ao rodar contra a VPS real, o `db:seed`
   falhou com `self-signed certificate` **apesar** do CA pinado. Causa: no `pg` 8.22 /
   `pg-connection-string` 2.14, o `sslmode=require` presente na URL (`.env.local`) é tratado como
   `verify-full` e **sobrescreve/conflita** com o objeto `ssl`, fazendo a validação ignorar o CA
   pinado. Correção aplicada nos 3 lugares (`src/db/index.ts`, `seed.mjs`, `create-client.mjs`): antes
   de passar a URL ao `Pool`, remover o parâmetro `sslmode` (`new URL(...).searchParams.delete("sslmode")`),
   deixando o objeto `ssl` (CA pinado) como **única** fonte da config TLS. **Validado contra o Postgres
   real via PgBouncer (6432):** `SELECT 1` retornou `{ ok: 1 }` — cadeia validada pelo CA, hostname
   bypassed, exatamente o comportamento que a story/spec exige. Sem essa correção o runtime da app na
   VPS não conectaria. Este era o tipo de item que a própria spec marcou como "VERIFICAR NA
   IMPLEMENTAÇÃO".

2. **`drizzle.config.ts` sem edição — confirmado desnecessário.** A spec dizia editar só se
   `db:migrate` recusasse por cert self-signed. O `drizzle-kit migrate` **não** recusou por TLS (chegou
   a "applying migrations"); o único bloqueio é a porta 5432 fechada. Portanto nenhuma edição — alinhado
   ao item 4 da instrução.

3. **`npm run build` "puro" ainda falha — mas por causa do Estágio B, não do A.** O `.env.local` já foi
   migrado para MinIO no Bloco 1 (não tem mais `BLOB_READ_WRITE_TOKEN`), mas o `src/lib/env.ts` ainda
   exige essa var. Provado que é o único bloqueio: com um `BLOB_READ_WRITE_TOKEN` dummy no ambiente, o
   build completa 6/6. A remoção de `BLOB_READ_WRITE_TOKEN` de `env.ts` (+ adição das `S3_*`) é escopo
   do **Estágio B**. O código do Estágio A está limpo em compilação, tipos e page-data.

## O que o Frontend precisa saber

Nada muda para o Frontend no Estágio A. Nenhum componente, rota, estado, contrato de tela ou de API
foi tocado. `{ db }` mantém a mesma assinatura pública e `db.transaction()` continua funcional (provado
pela suíte). A troca é 100% de fronteira de infra (driver de banco), invisível para as camadas acima.

---

## Pendências para o orquestrador (não bloqueiam o fim do Estágio A)

- ~~Abrir a porta 5432 sob demanda~~ — **feito pelo CEO**. Ao reabrir, `npm run db:migrate` continuou
  pendurado indefinidamente (sem erro de TLS) — investigação do orquestrador achou a causa real:
  **o Postgres direto (porta 5432) usa um certificado self-signed PRÓPRIO, diferente do certificado do
  PgBouncer (porta 6432)** — fingerprints SHA-256 distintos, confirmados via handshake TLS real nas
  duas portas. `drizzle.config.ts` não pinava CA nenhum, então a verificação de cadeia (`sslmode=require`
  → tratado como `verify-full` pelo `pg-connection-string`) travava contra um CA desconhecido. Corrigido:
  - Novo arquivo `certs/db-ca-migrate.pem` (CA da porta 5432, separado do `certs/db-ca.pem` do runtime).
  - `drizzle.config.ts` atualizado: remove `sslmode` da URL e pina esse CA (`ca` + `rejectUnauthorized:
    true` + `checkServerIdentity: () => undefined` — mesma decisão do CEO, cadeia ainda validada).
  - `npm run db:migrate` → **`migrations applied successfully!`**. `npm run db:seed` → admin + client
    "Sua Marca" criados (`user 41e4bda1-ccde-437d-9b2d-a36cc95f8503`).
  - `npm run test` re-rodado após o ajuste: **250 passed / 1 skip**, sem regressão.
- **Estágio A agora 100% fechado**, incluindo os itens que dependiam da VPS real (migrate + seed).
- **Estágio B (storage)** é a próxima rodada — não iniciado aqui, por instrução.

---
---

# Backend — Migração de infra (Bloco 2, código) · Estágio B (storage Vercel Blob→MinIO/S3)

> Só o **Estágio B** desta rodada (storage). O Estágio A (banco) já estava 100% verde e **não foi
> tocado** (`src/db/index.ts`, `drizzle.config.ts`, `scripts/*.mjs`, `certs/*.pem` intactos). Suíte
> verde ao fim (255 passed / 1 skip) + build limpo.

## O que foi implementado

- **`src/app/api/blob/upload/route.ts`** (reescrita da lógica) — trocou o `handleUpload` do Vercel Blob
  por geração de **presigned PUT** (`PutObjectCommand` + `getSignedUrl` do AWS SDK). Gate de sessão via
  `auth()` no topo (401 falha-fechado, nenhuma presigned emitida sem `session.user.id`). Validação de
  borda com **Zod** (`uploadRequestSchema`): `filename` não vazio, `contentType` ∈ allowlist
  (`image/png|image/jpeg|image/webp`), `size` inteiro positivo `<= MAX_IMAGE_BYTES` (6 MB). Body
  não-JSON ou payload/tipo/tamanho inválido → **400 genérico** (`{ error: "Falha no upload." }`). A
  `key` é derivada **no server** (`slides/${randomUUID()}.${ext}`, `ext` de um mapa fechado
  `contentType→extensão`), nunca do path do cliente. `ContentLength: size` **assinado** no
  `PutObjectCommand` (reforço server do tamanho — o MinIO recusa PUT divergente). `S3Client` com
  `forcePathStyle: true`. Resposta 200 `{ uploadUrl, publicUrl, contentType }`; `publicUrl` path-style
  (`https://${S3_PUBLIC_HOST}/${S3_BUCKET}/${key}`); `contentType` ecoado (o client precisa usá-lo no
  header do PUT — faz parte da assinatura). Erro interno → `console.error` server-side + 400 genérico,
  nunca vaza detalhe no body.
- **`src/lib/blob-upload.ts`** (reescrita interna, contrato público inalterado) — fluxo novo no browser:
  `validateImageFile` (mantido) → `POST /api/blob/upload` pedindo a presigned → `PUT` direto no MinIO com
  o corpo = `file` e header `Content-Type` = o `contentType` **ecoado** pela resposta (não o `file.type`
  reinferido, por causa da assinatura) → devolve `{ ok:true, url: publicUrl }`. Type guard
  `isPresignResponse` valida o shape da resposta (dado externo tratado como `unknown` antes de usar).
  Qualquer não-2xx (presign ou PUT) ou `throw` (rede/CORS) → `{ ok:false, error }` genérico, sem mutar
  estado. `UploadResult` (union discriminada `{ ok:true; url } | { ok:false; error }`) e a assinatura
  `uploadImageToBlob(file: File): Promise<UploadResult>` **preservadas byte a byte** — os 3 consumidores
  (`settings-form.tsx`, `identity-panel.tsx`, `slide-editor.tsx`) e o mock de `editor-page.test.tsx` não
  precisam de nenhuma edição.
- **`src/lib/export-png.ts`** (`isAllowedBlobHost`, ~L168) — allowlist agora aceita o **host exato**
  `storage.evoiatecnologia.com` (path-style serve os objetos do próprio host, sem subdomínio de store) E
  `.storage.evoiatecnologia.com` (virtual-hosted futuro), mantendo o **match por sufixo de rótulo** (o
  ponto na frente barra `evil-storage.evoiatecnologia.com`; `...com.evil.com` também cai fora). JSDoc
  reescrito para MinIO. Literal fixo (não `S3_PUBLIC_HOST`) porque o módulo roda no browser e `@/lib/env`
  é `server-only` — comentado no código.
- **`src/lib/env.ts`** — removido `BLOB_READ_WRITE_TOKEN`; adicionadas as 6 `S3_*` ao `envSchema`:
  `S3_ENDPOINT` (`.url()`), `S3_PUBLIC_HOST`/`S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`
  (`.min(1)`). Comportamento de falha-fechada no boot preservado (`safeParse` → throw só com os **nomes**
  das chaves faltantes, nunca valores). Comentário do `DATABASE_URL` atualizado (não é mais driver Neon).
- **`package.json`** — `rm @vercel/blob`; `add @aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  (`^3.1078.0`). `package-lock.json` regenerado.
- **`tests/blob-upload-route.test.ts`** (reescrito) — mocka `@aws-sdk/client-s3` (`S3Client`,
  `PutObjectCommand`), `@aws-sdk/s3-request-presigner` (`getSignedUrl`) e `@/lib/env` (Risco R4), além do
  `@/auth` que já existia. 8 testes cobrindo: 401 sem sessão (nenhuma presigned), 200 com payload válido
  (`publicUrl` path-style + `contentType` ecoado), `image/gif`→400, `size > 6MB`→400, `size == 6MB`→200,
  body malformado→400, `ContentLength/ContentType/Key` assinados corretos, erro do SDK→400 sem vazar.
- **`tests/export-safe-url.test.ts`** (reescrito) — host do MinIO na allowlist, preservando TODAS as
  garantias: aceita host exato + subdomínio, case-insensitive, recusa sufixo forjado / arbitrário /
  `169.254.169.254`, e `toExportSafeUrl` recusa cross-origin fora da allowlist **antes de qualquer fetch**.
- **`tests/export-zip.test.ts`** e **`tests/settings-action.test.ts`** (higiene, fora dos 2 testes-alvo)
  — trocadas as fixtures de URL `*.public.blob.vercel-storage.com` pelo host do MinIO. Ver "Desvios": era
  necessário no `export-zip` (os hosts passam por `isAllowedBlobHost` e seriam recusados agora); no
  `settings-action` é URL inerte (só precisa começar com `https://`), trocada por consistência.
- **`.env.example`** (higiene) — seções de banco e storage atualizadas para pg self-hosted + MinIO; a var
  `BLOB_READ_WRITE_TOKEN` removida, as 6 `S3_*` documentadas (sem valores). Ver "Desvios".

## Contrato real entregue

**Contrato HTTP do handler (interno ao app; `blob-upload.ts` é o único cliente):**

```
POST /api/blob/upload   (runtime nodejs)

Request (JSON):
  { "filename": string(≥1), "contentType": "image/png"|"image/jpeg"|"image/webp", "size": int>0 e ≤6291456 }

Response 200 (JSON):
  { "uploadUrl": string,   // presigned PUT (expiresIn 300s) — X-Amz-Signature
    "publicUrl": string,   // https://storage.evoiatecnologia.com/carrossel-studio/slides/<uuid>.<ext>
    "contentType": string } // eco do assinado — o client DEVE usá-lo no header do PUT

Erros:
  401 { "error": "Não autorizado." }   // sem sessão
  400 { "error": "Falha no upload." }  // body inválido / tipo / tamanho / erro interno
```

**Contrato público do wrapper (consumido pelo Frontend — INALTERADO):**

```ts
// src/lib/blob-upload.ts
export type UploadResult = { ok: true; url: string } | { ok: false; error: string };
export async function uploadImageToBlob(file: File): Promise<UploadResult>;
```

Os 3 consumidores (`settings-form.tsx:69`, `identity-panel.tsx:61`, `slide-editor.tsx:54`) chamam
`await uploadImageToBlob(file)` e ramificam por `result.ok` — **zero edição**, o contrato é o mesmo. A
única diferença observável é a **origem da URL** devolvida em `{ ok:true }`: antes
`*.public.blob.vercel-storage.com`, agora `https://storage.evoiatecnologia.com/carrossel-studio/slides/<uuid>.<ext>`.

## Migrations / dados

**Nenhuma.** O Estágio B não toca schema, migration, RLS ou dado — é troca de fronteira de storage
(client-upload do Blob → presigned PUT do MinIO). Nenhuma operação destrutiva. RLS/authz seguem nas
server actions (não tocadas). Nenhum `db:generate`/`db:migrate`/`db:seed` nesta etapa.

## Comandos rodados

| Comando | Resultado real |
|---|---|
| `npm rm @vercel/blob` | removido — OK |
| `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` | `@aws-sdk/client-s3@^3.1078.0` + `@aws-sdk/s3-request-presigner@^3.1078.0` — OK |
| `npm audit` (após instalar) | 10 vulnerabilidades — **todas pré-existentes** (`drizzle-kit`, `esbuild`, `next`, `postcss`, `vitest`/`vite`); **nenhuma vem do aws-sdk** (confirmado via `npm audit --json`). Fora do escopo desta feature |
| `npm run type-check` | **limpo, zero erro** |
| `npm run test` | **255 passed, 1 skipped** (18 arquivos). O skip é o único herdado da S1. `blob-upload-route.test.ts` subiu de 4→8 testes; suíte 250→255. Os 2 `stderr` visíveis são os `console.error` **esperados** dos testes de erro (body malformado + falha do SDK) — provam que o detalhe fica só no log server-side, não no body |
| `npm run build` | **limpo, 6/6 páginas geradas**, sem erro de tipo. O bloqueio do `BLOB_READ_WRITE_TOKEN` que travava o build "puro" no Estágio A **sumiu** — o build usou o `.env.local` real e passou, o que também **confirma que as 6 `S3_*` estão presentes e válidas** (senão `env.ts` teria falhado fechado no "Collecting page data") |
| `grep -rn "@vercel/blob" src/ tests/` | **zero ocorrência** |
| `grep "@vercel/blob" package.json` | **zero** |
| `grep -c "@vercel/blob" package-lock.json` | **0** |
| `grep -c "@aws-sdk/client-s3" package-lock.json` | **3** (dep presente no lock) |
| `grep -rn "BLOB_READ_WRITE_TOKEN" src/ tests/` | **zero** |
| `grep -rn "vercel-storage" src/ tests/` | **zero** (fixtures de teste migradas ao host do MinIO) |

## Desvios da spec

1. **Fixtures de URL em `tests/export-zip.test.ts` e `tests/settings-action.test.ts` (não listados nos
   "Arquivos a tocar", mas necessário).** A spec só listou `export-safe-url` e `blob-upload-route` como
   testes a editar. Mas `export-zip.test.ts` usava `abc123.public.blob.vercel-storage.com` como host
   cross-origin que passa por `toExportSafeUrl`/`isAllowedBlobHost` — com a nova allowlist esses 3 testes
   **quebrariam** (o host seria recusado antes do fetch). Troquei as fixtures pelo host do MinIO. No
   `settings-action.test.ts:102` a URL é inerte (o schema só exige `https://`), mas troquei por
   consistência e para zerar `vercel-storage` no código de teste. **Não afrouxa nenhuma garantia** — só
   atualiza o host de exemplo. Suíte verde confirma.

2. **`.env.example` atualizado (não listado na spec).** O `.env.example` ainda descrevia Neon (Estágio A
   já migrou o runtime) e `BLOB_READ_WRITE_TOKEN`. Como `env.ts` agora exige as 6 `S3_*` e não mais o
   token do Blob, o `.env.example` **precisava** refletir isso para não enganar quem for provisionar
   ambiente (o ADR 0002 lista isso explicitamente). Só documentação de env (sem valores reais), coerente
   com o AC de segurança "existe `.env.example` documentando as chaves sem valores".

3. **URL pública path-style confirmada contra o `.env.local` real.** `S3_ENDPOINT` e `S3_PUBLIC_HOST` são
   o **mesmo host** (`storage.evoiatecnologia.com`) — exatamente o sinal, previsto na spec (seção
   "Decisões"), de MinIO atrás de proxy único. Path-style é o formato entregue. O smoke real (Bloco 3)
   ainda deve confirmar que o MinIO responde a URLs path-style; se exigir virtual-hosted, a `publicUrl`
   muda e a allowlist já cobre (`.storage.evoiatecnologia.com`) — custo baixo, como a spec antecipou.

**Sem desvio de contrato ou de segurança.** Todos os pontos do gate da spec foram seguidos: presigned no
lugar do `handleUpload`, 401 sem sessão, reforço server de tipo/tamanho via Zod + `ContentLength`
assinado, key derivada no server, erro genérico sem vazar, `UploadResult`/`validateImageFile` intactos.

## O que o Frontend precisa saber

**Nada muda no contrato consumido.** `uploadImageToBlob(file): Promise<UploadResult>` e o
narrowing por `result.ok` são idênticos. A UI (estados carregando/erro/sucesso) não muda — ela só olha
`{ ok, url } | { ok, error }`, indiferente a Blob vs MinIO por baixo.

Único detalhe observável: em `{ ok:true }`, `result.url` agora aponta para
`https://storage.evoiatecnologia.com/carrossel-studio/slides/<uuid>.<ext>` (antes era
`*.public.blob.vercel-storage.com`). Essa URL já está na allowlist do export (`isAllowedBlobHost`), então
o export de PNG segue funcionando sem ajuste no Frontend.

> **Ops / Bloco 3 (não é código, mas o Frontend/validação deve saber):** o PUT direto do browser depende
> do **CORS do bucket MinIO** liberar a origem da app (provisionado no Bloco 1) e do TLS do proxy estar
> ok. Se o CORS estiver errado, o `PUT` falha e `uploadImageToBlob` devolve `{ ok:false }` genérico (a UI
> já trata) — mas isso é smoke do Bloco 3, não regressão desta entrega.
