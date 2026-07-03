# Spec — Migração de infra (Bloco 2, código): banco Neon→`pg` + storage Vercel Blob→MinIO/S3

> Desenho técnico do refactor de infra. **Um PR, dois estágios internos** (A — banco; B — storage),
> suíte verde ao fim de cada um. Sem mudança de UI. Contrato de `uploadImageToBlob`/`UploadResult` e
> `isAllowedBlobHost` preservados. Baseado na story `02-story.md` (aprovada), no ADR 0002 (Fases 2, 3,
> 4b) e no **código real lido nesta sessão** (divergências marcadas em "Riscos" / "Decisões").

---

## Resumo da abordagem

Trocar duas fronteiras de infra sem alterar comportamento observável, apoiado na suíte existente como
rede de segurança. **Estágio A**: substituir o driver Neon serverless (`Pool` + WebSocket via `ws`) por
`pg.Pool` + `drizzle-orm/node-postgres`, com TLS validando a cadeia contra o CA pinado (`certs/db-ca.pem`)
e bypass explícito só do `checkServerIdentity` (cert self-signed sem SAN). **Estágio B**: substituir o
client-upload do Vercel Blob por **presigned PUT** do MinIO (`@aws-sdk/client-s3` +
`s3-request-presigner`), gerado no server com o mesmo gate de sessão + reforço de tipo/tamanho, mantendo
`UploadResult` e a allowlist de host (agora `storage.evoiatecnologia.com`, path-style).

Por quê assim: é a solução mais simples que cumpre a story — reusa todos os contratos de camada
existentes (server actions, reducer, `<Slide>`, `validateImageFile`, `UploadResult`) e só reescreve o
"como" de duas fronteiras. Nada de retry/backoff, pooling avançado ou métricas (YAGNI, fora de escopo).

---

## Contrato de API/backend

### A. Client Drizzle — `src/db/index.ts` (reescrita completa)

Assinatura pública **inalterada**: o módulo continua exportando `export const db` (instância Drizzle
tipada com `schema`). Todos os consumidores (`src/auth.ts`, `src/lib/client-repo.ts`,
`src/lib/actions/*.ts`) importam `{ db } from "@/db"` e **não mudam**. `db.transaction()` continua
disponível (garantido pelo `drizzle-orm/node-postgres`).

Comportamento interno novo:
- Importa `Pool` de `pg` e `drizzle` de `drizzle-orm/node-postgres`.
- Lê o CA de `certs/db-ca.pem` via `node:fs` (`readFileSync`) na carga do módulo (server-only, roda em
  Node — nunca no browser/edge).
- Config TLS do `pg.Pool`:
  ```
  ssl: {
    ca,                          // CA pinado — cadeia É validada contra ele
    rejectUnauthorized: true,    // NÃO é bypass cego
    checkServerIdentity: () => undefined,  // único bypass: cert sem SAN, decisão do CEO
  }
  ```
  Comentário obrigatório no código explicando **por que** `checkServerIdentity` é ignorado (cert
  self-signed sem SAN; a cadeia ainda é validada pelo `ca` pinado).
- `max` conservador (proposta: `max: 10`) — valor pequeno, não é tuning. Comentário justificando.
- `connectionString: env.DATABASE_URL` (PgBouncer :6432, transaction mode).
- Remove todo o bloco de WebSocket (`neonConfig.webSocketConstructor = ws`, `import ws`,
  `import { neonConfig, Pool } from "@neondatabase/serverless"`, `import { drizzle } from
  "drizzle-orm/neon-serverless"`).

**Leitura do CA (decisão de robustez):** ler o arquivo com caminho resolvido a partir de `process.cwd()`
(ex.: `path.join(process.cwd(), "certs", "db-ca.pem")`). Se o arquivo faltar, `readFileSync` lança
`ENOENT` na carga do módulo — que é o comportamento **desejado** pela story (edge case "`certs/db-ca.pem`
ausente → falha clara no boot, nunca conexão sem TLS"). Não capturar/silenciar esse erro. Adicionar um
comentário deixando explícito que a falha é intencional.

> **Nota de simplicidade:** não parametrizar o caminho do CA por env nesta feature — caminho fixo
> `certs/db-ca.pem` é o que a story e o `.gitignore` assumem. Parametrizar é YAGNI.

### drizzle.config.ts — sem mudança de código

Confirmado no código real: já lê `DATABASE_URL_UNPOOLED` e lança se ausente. **Nenhuma edição.** Só o
valor no `.env.local` mudou (já preenchido: `72.60.6.238:5432`). Migrations rodam em session mode direto
no 5432. A story exige que `db:migrate` funcione — isso depende só do `.env` e da porta 5432 estar
aberta sob demanda (documentado no próprio `.env.local`, linhas 8-13). Sem TLS pinado aqui: a string usa
`sslmode=require` (o drizzle-kit/`pg` do drizzle-kit valida via `sslmode`, não via CA pinado —
migrations são operação pontual de um IP conhecido, não runtime da app).

> **[VERIFICAR NA IMPLEMENTAÇÃO — não bloqueia o gate]** `drizzle-kit migrate` com `sslmode=require`
> contra cert **self-signed** pode recusar a conexão (`self-signed certificate`). Se recusar, a saída
> mais simples e alinhada à decisão do CEO é passar o CA pinado ao drizzle-kit via `dbCredentials.ssl`
> em `drizzle.config.ts` (mesma config de `ca` + `checkServerIdentity` bypass do runtime). Isso é
> edição pontual de config, não mudança de lógica. O backend decide ao rodar `db:migrate`; se `require`
> bastar, não mexe. Marcado aqui para o implementador não travar.

### B. Route handler de upload — `src/app/api/blob/upload/route.ts` (reescrita da lógica)

**Novo contrato HTTP** (o `blob-upload.ts` é o único cliente deste endpoint; contrato é interno ao app,
não público):

- **Método/rota:** `POST /api/blob/upload` (mantido).
- **Runtime:** `nodejs` (mantido — SDK AWS precisa de Node).
- **Auth:** sessão obrigatória via `auth()`. Sem `session.user.id` → **401** com body genérico. Falha
  fechado: nenhuma presigned URL emitida.

**Request body** (JSON):
```jsonc
{
  "filename": "foto.png",        // nome original; usado só para derivar extensão
  "contentType": "image/png",    // um de ALLOWED_CONTENT_TYPES
  "size": 812345                 // bytes; validado contra MAX_IMAGE_BYTES
}
```

**Validação na borda (Zod, dentro do handler):** `filename` string não vazia; `contentType` ∈
`["image/png","image/jpeg","image/webp"]`; `size` inteiro `> 0` e `<= MAX_IMAGE_BYTES` (6 MB). Qualquer
falha → **400** genérico (`{ "error": "Falha no upload." }`). Body malformado (não-JSON) → **400**.

**Geração da presigned PUT (sucesso):**
- Deriva a `key` do objeto no server (nunca confia em path do cliente):
  `slides/${randomUUID()}.${ext}`, onde `ext` vem de um mapa `contentType → extensão`
  (`image/png`→`png`, `image/jpeg`→`jpg`, `image/webp`→`webp`). Prefixo `slides/` mantido por paridade
  com o pathname atual (`slides/${file.name}`); a unicidade antes vinha do `addRandomSuffix` do Blob,
  agora vem do `randomUUID()`.
- `PutObjectCommand` com `Bucket: env.S3_BUCKET`, `Key: key`, `ContentType: contentType`,
  `ContentLength: size` — o `ContentLength` **assinado** é o reforço server do tamanho: o MinIO recusa
  um PUT cujo `Content-Length` divirja do assinado. (Ver Riscos: MinIO valida `Content-Length` assinado;
  o reforço de tamanho continua efetivo mesmo com upload direto do browser.)
- `getSignedUrl(...)` com `expiresIn: 300` (5 min — janela curta, suficiente pro upload imediato).
- Monta a **URL pública final** path-style: `https://storage.evoiatecnologia.com/${S3_BUCKET}/${key}`
  (ver "Decisões" para a justificativa path-style vs virtual-hosted).

**Response 200:**
```jsonc
{
  "uploadUrl": "https://storage.evoiatecnologia.com/...&X-Amz-Signature=...", // presigned PUT
  "publicUrl": "https://storage.evoiatecnologia.com/carrossel-studio/slides/<uuid>.png",
  "contentType": "image/png"   // eco: o client usa como header do PUT (o browser precisa bater com o assinado)
}
```

**Erros (envelope consistente com o atual — mensagem genérica, sem vazar detalhe):**

| Situação | Status | Body |
|---|---|---|
| Sem sessão | 401 | `{ "error": "Não autorizado." }` |
| Body inválido / tipo / tamanho | 400 | `{ "error": "Falha no upload." }` |
| Erro interno (SDK, assinatura) | 400 | `{ "error": "Falha no upload." }` |

> Mantém-se o padrão atual: 401 só para sessão ausente; qualquer outra falha → 400 genérico. O detalhe
> técnico nunca vai no body (só `console.error` server-side, sem PII/segredo).

### C. Wrapper de upload — `src/lib/blob-upload.ts` (reescrita interna, contrato preservado)

**Assinatura pública inalterada** (contrato consumido por `settings-form.tsx`, `identity-panel.tsx`,
`slide-editor.tsx` e mockado em `editor-page.test.tsx`):

```ts
export type UploadResult = { ok: true; url: string } | { ok: false; error: string };
export async function uploadImageToBlob(file: File): Promise<UploadResult>;
```

Fluxo interno novo (roda no browser):
1. `validateImageFile(file)` — **mantido** (6 MB / tipo). Inválido → `{ ok:false, error }` (mensagens
   atuais preservadas).
2. `POST /api/blob/upload` com `{ filename: file.name, contentType: file.type, size: file.size }`.
   Não-2xx → `{ ok:false, error:"Falha ao enviar a imagem. Tente de novo." }` (mensagem atual mantida).
3. `PUT uploadUrl` direto no MinIO com o corpo = `file` e header `Content-Type` = `contentType` retornado
   (deve bater com o assinado). Não-2xx → mesma mensagem genérica de falha.
4. Sucesso → `{ ok:true, url: publicUrl }`.
5. Qualquer `throw` (rede/CORS) → `catch` devolve `{ ok:false, error:"Falha ao enviar a imagem. Tente
   de novo." }`. Nunca muta estado; mensagem genérica ao usuário.

> **Simplicidade:** dois passos de rede (pedir presigned → PUT) substituem o `upload()` do Blob que
> fazia isso internamente. Sem retry (YAGNI — falha vira `{ok:false}` e a UI já trata isso hoje).

### D. Allowlist de host do export — `src/lib/export-png.ts` (`isAllowedBlobHost`, ~L168)

**Assinatura inalterada:** `export function isAllowedBlobHost(hostname: string): boolean`. Continua
exportada para teste e chamada por `toExportSafeUrl` (nenhuma mudança em `toExportSafeUrl`).

Mudança: trocar o sufixo do Vercel Blob pelo host do MinIO, **mantendo o match por sufixo de rótulo**
(o ponto na frente é a defesa contra `evil-storage.evoiatecnologia.com`). Aceitar **o host exato** E
subdomínios legítimos:

```
const host = hostname.toLowerCase();
return host === "storage.evoiatecnologia.com"
    || host.endsWith(".storage.evoiatecnologia.com");
```

> **Divergência com o código atual — decisão:** hoje a allowlist é **só** `endsWith(".public.blob.
> vercel-storage.com")` — nunca o apex, porque o Blob sempre serve de `<store>.public.blob...`. O MinIO
> path-style serve os objetos **do próprio host** `storage.evoiatecnologia.com` (sem subdomínio de
> store). Então o match precisa aceitar o **host exato** — senão a URL pública real seria recusada pelo
> próprio export. Mantém-se `|| endsWith(".storage.evoiatecnologia.com")` por segurança futura (se um
> dia virar virtual-hosted), sem custo. O comentário JSDoc da função é reescrito para refletir MinIO.
>
> Isso **preserva** as garantias que a story exige: `evil-storage.evoiatecnologia.com` → recusado (não
> é o host exato nem termina em `.storage.evoiatecnologia.com`); `storage.evoiatecnologia.com.evil.com`
> → recusado; hosts arbitrários e `169.254.169.254` → recusados.

**[VERIFICAR — não bloqueia o gate]** Se o backend, ao rodar o smoke, descobrir que o MinIO só responde
a URLs **virtual-hosted** (`carrossel-studio.storage.evoiatecnologia.com/...`), a `publicUrl` do handler
muda para esse formato e a allowlist já cobre (`endsWith(".storage.evoiatecnologia.com")`). A decisão
atual (path-style) é a mais provável para MinIO atrás de proxy único — ver "Decisões".

### E. Validação de env — `src/lib/env.ts`

Remover `BLOB_READ_WRITE_TOKEN`. Adicionar as 6 vars ao `envSchema` (todas `z.string().min(1, "...")`):

| Var | Regra Zod | Origem (`.env.local` real) |
|---|---|---|
| `S3_ENDPOINT` | `.url()` (é URL da API) | `https://storage.evoiatecnologia.com` |
| `S3_PUBLIC_HOST` | `.min(1)` (hostname, sem esquema) | `storage.evoiatecnologia.com` |
| `S3_BUCKET` | `.min(1)` | `carrossel-studio` |
| `S3_REGION` | `.min(1)` | `us-east-1` |
| `S3_ACCESS_KEY` | `.min(1)` | `carrossel-app` |
| `S3_SECRET_KEY` | `.min(1)` | `<secret>` |

Comportamento preservado: `safeParse` no boot; se faltar qualquer chave → `throw` com **os nomes** das
chaves faltantes (nunca os valores). Atualizar o comentário do `DATABASE_URL` (não é mais "driver Neon").

---

## Mudanças de dados

**Nenhuma mudança de schema, migration ou RLS nesta feature.** O schema `users/clients/carousels/slides`
é inalterado; a story troca **onde** o Postgres roda, não sua estrutura.

- **Migration destrutiva?** Não. Nenhum `db:generate` novo. `db:migrate` apenas **aplica o schema
  existente** (as migrations já versionadas em `drizzle/`) num Postgres vazio na VPS. `db:seed` insere
  admin + client "Sua Marca" (idempotente por e-mail).
- **RLS / authz:** o projeto **não usa RLS do Postgres** — a autorização vive nas server actions
  (`requireUser` + filtro por `ownerId` da sessão, provado em `carousel-actions.test.ts`). Essa camada
  **não é tocada** por esta feature. O usuário do app na VPS é **sem superuser** (least privilege,
  provisionado no Bloco 1) — reforço em camada de banco, fora do escopo de código deste PR.
- **Integridade transacional:** `db.transaction()` (replace-all de slides em `carousels.ts:245` e o
  create em `:102`) passa a ser garantido pelo `pg` em vez do WebSocket da Neon. O teste do
  `saveCarousel` (`transactionCalled === true`, rollback em erro) é a prova. Ver "Plano de teste".

---

## UI/frontend

**Nada muda.** Nenhum componente React, rota de página, estado ou fluxo de tela é tocado. Os três
consumidores de `uploadImageToBlob` (`settings-form.tsx`, `identity-panel.tsx`, `slide-editor.tsx`) já
consomem o contrato `UploadResult` com narrowing (`if (result.ok) ...`) e continuam idênticos, pois o
contrato é preservado byte a byte. Os estados de UI (carregando / erro / sucesso do upload) são os
mesmos: a UI só olha `{ ok, url } | { ok, error }`, indiferente a Blob vs MinIO por baixo.

> Confirmado no código: `settings-form.tsx:69`, `identity-panel.tsx:61`, `slide-editor.tsx:54` fazem
> `const result = await uploadImageToBlob(file)` e ramificam por `result.ok`. Zero edição.

---

## Arquivos a tocar

### Estágio A — Banco

| Ação | Caminho | Propósito |
|---|---|---|
| EDITAR (reescrita) | `src/db/index.ts` | `pg.Pool` + `drizzle-orm/node-postgres`; TLS com CA pinado + bypass `checkServerIdentity`; remover WebSocket/Neon |
| EDITAR | `package.json` | `rm @neondatabase/serverless ws @types/ws`; `add pg` (dep) + `@types/pg` (dev). `package-lock.json` regenera |
| EDITAR (ver Riscos R1) | `scripts/seed.mjs` | Trocar `@neondatabase/serverless`+`ws` por `pg` — senão `db:seed` quebra na VPS (import morto após remover a dep) |
| EDITAR (ver Riscos R1) | `scripts/create-client.mjs` | Mesmo motivo do seed |
| VERIFICAR | `drizzle.config.ts` | Provável sem edição; só se `sslmode=require` recusar o cert self-signed (ver seção Contrato) |

### Estágio B — Storage

| Ação | Caminho | Propósito |
|---|---|---|
| EDITAR (reescrita da lógica) | `src/app/api/blob/upload/route.ts` | Presigned PUT no lugar de `handleUpload`; gate de sessão (401); reforço tipo/tamanho na borda + no comando assinado |
| EDITAR (reescrita interna) | `src/lib/blob-upload.ts` | Pedir presigned → PUT no MinIO → devolver `publicUrl`; manter `validateImageFile` e `UploadResult` |
| EDITAR | `src/lib/export-png.ts` | `isAllowedBlobHost`: host do MinIO (exato + `.storage...`), mantendo match por rótulo; atualizar JSDoc |
| EDITAR | `src/lib/env.ts` | Remover `BLOB_READ_WRITE_TOKEN`; adicionar 6 `S3_*` com Zod |
| EDITAR | `package.json` | `rm @vercel/blob`; `add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| EDITAR (testes) | `tests/blob-upload-route.test.ts` | Novo contrato: presigned PUT, mock do S3 SDK + `@/lib/env`; preservar 401 e limite 6 MB |
| EDITAR (testes) | `tests/export-safe-url.test.ts` | Host do MinIO na allowlist; casos de recusa adaptados |

> Nenhum arquivo **novo** de produção. Nenhum arquivo deletado. Tudo é edição de arquivo já existente
> (reuse antes de inventar).

---

## Plano de teste

Nível: **unitário/integração leve com Vitest** (a suíte atual), mais a **verificação objetiva** de
`test` + `build`. Sem E2E novo (o smoke real com browser/VPS é o Bloco 3 — fora de escopo). Cada item
liga a um AC da story.

### Estágio A

1. **`carousel-actions.test.ts` (existente, NÃO deve mudar) — prova `db.transaction()`.**
   O teste mocka `@/db` inteiro (`vi.mock("@/db")`), então **não exercita o driver real** — mas prova
   que `saveCarousel` **chama** `db.transaction` (`transactionCalled === true`) e faz rollback lógico.
   Passar sem edição confirma que a API `db.transaction()` do novo driver é a mesma. → **AC "db.transaction
   continua funcional"**. *(Ver Riscos R2: este teste não conecta ao Postgres real; a prova de transação
   ponta-a-ponta é o smoke do Bloco 3.)*
2. **`npm run test` verde** (todos os ~250, mantendo o único skip herdado da S1) **antes** de abrir o
   Estágio B. → **AC "portão geral" + "ao fim do Estágio A test+build verdes"**.
3. **`npm run build` limpo** (sem erro de tipo — `@types/pg` cobre o `pg`). → **AC "build limpo"**.
4. **Busca textual** por `@neondatabase/serverless|neonConfig|neon-serverless` em `src/`, `tests/`,
   `package.json` → zero. → **AC "nenhuma referência sobra"**. (`ws`/`@types/ws` idem — checar que só
   sobrevive em `package-lock.json` de deps transitivas legítimas, se houver; ver Riscos R3.)
5. **Manual/ops (não automatizável na suíte):** `npm run db:migrate` + `npm run db:seed` contra a VPS
   recriam schema + seed. → **AC do Estágio A**. Depende da porta 5432 aberta sob demanda e de
   `scripts/*.mjs` já migrados pra `pg` (R1). O implementador roda e cola o resultado.

### Estágio B

6. **`tests/blob-upload-route.test.ts` (reescrito).** Manter as 4 garantias atuais, adaptadas:
   - **Sem sessão → 401**, nenhuma presigned emitida. → **AC "gate de sessão"** + edge "upload sem
     sessão".
   - **Com sessão + payload válido → 200** com `uploadUrl`/`publicUrl`; `publicUrl` começa com
     `https://storage.evoiatecnologia.com/carrossel-studio/`. → **AC "presigned PUT"**.
   - **`contentType` não permitido** (`image/gif`) → 400, nenhuma presigned. → **AC "reforço content-type
     no server"** + edge.
   - **`size > MAX_IMAGE_BYTES`** (6 MB + 1) → 400, nenhuma presigned. → **AC "reforço tamanho server"**
     + edge; assert que o valor de corte é `6 * 1024 * 1024`.
   - **Erro interno do SDK** → 400 genérico, sem vazar detalhe. → **AC "não vaza detalhe"**.
   - **Mocking:** mockar `@aws-sdk/client-s3` (`PutObjectCommand`) e `@aws-sdk/s3-request-presigner`
     (`getSignedUrl` → URL fake) — fronteira externa cara/instável, mock é o certo (mocking-estratégico).
     Mockar também `@/lib/env` (ver Riscos R4) para o handler ler `S3_*` sem exigir env real no CI.
     `@/auth` continua mockado como hoje.
7. **`tests/export-safe-url.test.ts` (reescrito).** Adaptar os casos ao host do MinIO, **preservando as
   garantias de segurança**:
   - aceita `foo.storage.evoiatecnologia.com` **e** `storage.evoiatecnologia.com` (host exato) → `true`;
   - case-insensitive → `true`;
   - recusa `evil-storage.evoiatecnologia.com`, `storage.evoiatecnologia.com.evil.com` → `false`;
   - recusa `evil.com`, `localhost`, `169.254.169.254` → `false`;
   - `toExportSafeUrl`: cross-origin fora da allowlist (`https://evil.com/x.png`) **lança antes de
     qualquer fetch** (`fetchSpy` não chamado); host do MinIO permitido **chega a chamar** `fetch`.
   → **AC "isAllowedBlobHost aceita MinIO mantendo match por sufixo"** + edges do export.
8. **`npm run test` + `npm run build` verdes** ao fim. → **AC "portão geral"**.
9. **Busca textual** por `@vercel/blob` em `src/`, `tests/`, `package.json`/`package-lock.json` → zero.
   → **AC "nenhuma referência sobra"**.
10. **Reversibilidade:** conferir (revisão, não teste automatizado) que o PR é `git revert`-ável — só
    edições, sem estado externo alterado por código. → **AC "reversível por git revert + envs antigas"**.

---

## Decisões e trade-offs

- **URL pública path-style (`https://storage.evoiatecnologia.com/carrossel-studio/<key>`)** —
  descartado virtual-hosted (`https://carrossel-studio.storage.evoiatecnologia.com/<key>`). Motivo,
  confirmado contra o `.env.local` real: `S3_ENDPOINT` e `S3_PUBLIC_HOST` são **o mesmo host**
  (`storage.evoiatecnologia.com`), o que indica MinIO atrás de um **proxy único** (Traefik/EasyPanel
  expõe um host só). Virtual-hosted exigiria wildcard DNS `*.storage.evoiatecnologia.com` + cert
  wildcard — que o `.env` não sinaliza existir. Path-style é o default do MinIO nessa montagem. **Marcado
  como VERIFICAR** no smoke (Bloco 3): se o MinIO só aceitar virtual-hosted, a `publicUrl` muda e a
  allowlist já cobre — custo baixo.
- **Reforço de tamanho via `ContentLength` assinado** — descartado validar o tamanho só na borda do
  handler (o handler não vê os bytes; o browser faz o PUT direto). Assinar `ContentLength` no
  `PutObjectCommand` faz o **MinIO** recusar um PUT divergente. Trade: exige o browser mandar o
  `Content-Length` exato (o `fetch` com corpo `File` já o faz). Simplicidade: sem stream inspection no
  server. → cumpre "rejeitado no server, não só no client".
- **`pg` sobre `postgres.js`** — decisão herdada do ADR (não redesenhada): `postgres.js` usa prepared
  statements por padrão, incompatíveis com PgBouncer transaction mode; `pg` não tem esse atrito.
- **CA pinado + bypass só do `checkServerIdentity`** — descartado `rejectUnauthorized: false` (bypass
  cego, recusado por segurança) e descartado reemitir o cert com SAN (decisão do CEO: pinning). A cadeia
  **é** validada contra o CA; só a checagem de hostname (que exige SAN) é ignorada. Trade: se o cert do
  Postgres for reemitido no futuro, atualizar `certs/db-ca.pem` — aceitável.
- **Caminho do CA fixo (`certs/db-ca.pem`), não parametrizado por env** — YAGNI. A story e o `.gitignore`
  assumem esse caminho; parametrizar seria abstração especulativa.
- **`max: 10` no pool, sem tuning** — valor conservador basta pro volume atual (sem clientes reais).
  Retry/backoff/métricas explicitamente fora de escopo (story). Ajuste fino fica pra quando houver carga.
- **Migrar `scripts/seed.mjs` e `scripts/create-client.mjs` para `pg`** (ver Riscos R1) — a story só cita
  `src/`/`tests/`/`package.json` no AC de "zero ocorrência", mas o AC do Estágio A exige `db:seed`
  funcionando na VPS. O driver Neon não fala Postgres puro e os imports morrem ao remover a dep. Migrar
  os dois scripts é obrigatório para o Estágio A fechar — **incluído no escopo desta spec**.

---

## Riscos para implementação

- **R1 — `scripts/seed.mjs` e `scripts/create-client.mjs` importam `@neondatabase/serverless` + `ws`.**
  Confirmado no código (linhas 9/11 e 15/17 respectivamente). Ao remover a dep do `package.json`, esses
  imports quebram; e mesmo mantendo a dep, o driver Neon **não conecta** ao Postgres puro da VPS, então
  `npm run db:seed` (AC do Estágio A) falharia. **Mitigação (no escopo):** reescrever os dois scripts
  para `pg` — trocar `Pool`/`neonConfig`/`ws` por `import { Pool } from "pg"` com a mesma config TLS
  (CA pinado + `checkServerIdentity` bypass), preservando a lógica idempotente e as transações
  `BEGIN/COMMIT/ROLLBACK` (o `pg` client suporta igual). Sem essa migração, o Estágio A não fecha.
  **[Confirmar no gate: incluir os scripts no PR — a spec assume que sim.]**

- **R2 — `carousel-actions.test.ts` mocka `@/db` inteiro.** O teste **não** exercita o driver `pg` real;
  prova só que `saveCarousel` chama `db.transaction`. A prova ponta-a-ponta de transação atômica contra o
  Postgres da VPS é o **smoke do Bloco 3**, não desta suíte. Isso é aceitável (a story lista o smoke como
  Bloco 3), mas o gate deve saber: "suíte verde" não prova a conexão real — prova que o contrato de
  código não regrediu.

- **R3 — `ws` como dependência transitiva.** Após `npm rm ws @types/ws`, `ws` ainda pode aparecer em
  `package-lock.json` como dep transitiva de outro pacote (comum). O AC pede "zero ocorrência em
  package-lock.json". **Verificar na implementação:** se `ws` sobreviver só como transitiva legítima
  (não como dep direta nossa nem via Neon/`ws` que removemos), isso é aceitável e deve ser anotado — o
  espírito do AC é "nada de Neon/ws **nosso**". Se aparecer puxado por algo que também sai, some junto.
  **[Ponto para o gate confirmar a interpretação: transitiva legítima não viola o AC.]**

- **R4 — `blob-upload-route.test.ts` passará a carregar `@/lib/env`.** Hoje o `route.ts` **não** importa
  `@/lib/env` (só `MAX_IMAGE_BYTES` de `@/lib/image-upload`), por isso o teste roda sem env real. O novo
  handler precisa de `S3_*` (via `@/lib/env`, que faz `safeParse(process.env)` **na carga do módulo** e
  lança se faltar). No ambiente de teste (Vitest, jsdom) essas envs não existem → o import quebraria no
  boot. **Mitigação (decidida):** o teste reescrito **mocka `@/lib/env`** (`vi.mock("@/lib/env", () =>
  ({ env: { S3_BUCKET: "...", S3_PUBLIC_HOST: "...", ... } }))`), como já se faz com `@/db` e `@/auth`
  nos outros testes. Não popular `process.env` no setup (mais frágil). Sem isso, o Estágio B não fica
  verde.

- **R5 — CORS do MinIO / TLS do proxy.** O PUT direto do browser depende do CORS do bucket liberar a
  origem (provisionado no Bloco 1). É **ops**, não código — mas se o CORS/TLS estiver errado, o smoke
  (Bloco 3) falha, não a suíte. Fora do escopo deste PR; anotado para o Bloco 3 não ser pego de surpresa.

- **R6 — Content-Type do PUT deve bater com o assinado.** O browser precisa enviar exatamente o
  `Content-Type` que o handler assinou; senão o MinIO rejeita a assinatura. Por isso o handler **ecoa**
  `contentType` na resposta e o `blob-upload.ts` usa esse valor no header do PUT — não o `file.type`
  reinferido. Detalhe de implementação já embutido no contrato acima; anotado para não passar batido.

---

## GATE humano — pare aqui

**Aprovar a abordagem antes de qualquer código.** Pontos que merecem um sim/não explícito do CEO/CTO:

1. **Incluir `scripts/seed.mjs` e `scripts/create-client.mjs` no PR** (migrar pra `pg`). É obrigatório
   pro AC "`db:seed` na VPS" fechar — a spec assume que sim. (R1)
2. **Interpretação do AC "zero ocorrência de `ws`":** dependência **transitiva legítima** em
   `package-lock.json` não viola o AC (o alvo é o `ws`/Neon **nosso**). (R3)
3. **`@/lib/env` mockado** no `blob-upload-route.test.ts` (padrão já usado no projeto). (R4)
4. **URL pública path-style** (`.../carrossel-studio/<key>`) como decisão default, com VERIFICAR no smoke
   do Bloco 3 caso o MinIO exija virtual-hosted. (Decisões)

Se algum desses for "não", a spec muda aqui — barato. Nenhum ponto é bloqueante da abordagem geral; são
confirmações para o implementador não adivinhar. Fora isso, Backend consegue implementar o Estágio A e B
sem novas perguntas.
