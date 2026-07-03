# Validação — Migração de infra (Bloco 2, código): banco Neon→`pg` + storage Vercel Blob→MinIO/S3

> Auditoria independente do 07-validator. Código lido de verdade, comandos rodados por mim, buscas
> textuais próprias. Não editei nada — só audito e emito veredito para o gate humano.

---

## VEREDITO GERAL: ✅ APROVAR (com 1 ressalva 🟢 cosmética, não bloqueante)

Todos os critérios de aceite (geral + Estágio A + Estágio B) e todos os edge cases automatizáveis
estão cumpridos com evidência real. Testes e build rodados por mim batem com os relatórios
(**269 passed / 1 skipped**; build **6/6 páginas**, limpo). Zero referência às deps antigas em
`src/`/`tests/`/`scripts/`/`package.json`. Certs presentes, referenciados corretamente e fora do git.
Segurança do handler de upload sólida (falha-fechado, sem vazamento, key server-side). O PR é reversível.

**Ressalva única (🟢, não bloqueia):** comentário desatualizado em `src/lib/export-png.ts:221-222`
ainda diz "CDN do Vercel Blob". É cosmético — o código e o JSDoc principal já refletem o MinIO.

---

## Comandos rodados por mim (saída real)

| Comando | Resultado |
|---|---|
| `npm run test` | **269 passed, 1 skipped** (19 arquivos). Único skip = `png-dimensions.test.ts` (herdado da S1). Os 2 stderr são `console.error` esperados dos testes de erro do handler (body malformado + falha do SDK) — provam que o detalhe fica só no log server-side. **Bate com o 06.** |
| `npm run build` | **Compiled successfully** + **6/6 páginas geradas**, sem erro de tipo, usando `.env.local` real. Isso confirma que as 6 `S3_*` estão presentes e válidas (senão `env.ts` falharia fechado no "Collecting page data"). |
| `grep @neondatabase/serverless\|neonConfig\|neon-serverless\|@vercel/blob` em `src/` | **0** |
| idem em `tests/` | **0** |
| idem em `scripts/` | **0** |
| idem + `BLOB_READ_WRITE_TOKEN\|vercel-storage` em `package.json` | **0** |
| deps diretas (`package.json`) | `pg`, `@types/pg`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` presentes; `ws`, `@types/ws`, `@neondatabase/serverless`, `@vercel/blob` **ausentes** |
| instalações reais no `package-lock.json` (via parse do lock, não grep textual) | neon/@vercel/blob: **NENHUMA**; `ws`: só `node_modules/ws`, puxado por **`jsdom`** (dev/test) |

### Sobre as 2 ocorrências textuais de `@neondatabase/serverless` no `package-lock.json`
O AC pede "zero ocorrência em package-lock.json". Investiguei: as 2 linhas são **`peerDependenciesMeta`
opcionais declaradas pelo próprio `drizzle-orm`** (`"optional": true`, `package-lock.json:4553` e `:4593`)
— o drizzle apenas *declara* que pode operar com o driver Neon se ele existir. **Não há nenhuma
instalação real** (`node_modules/@neondatabase/serverless` não existe no lock). Isso **não é o `ws`/Neon
nosso** e não é removível sem remover o `drizzle-orm`. Interpretação alinhada à decisão do gate (R3):
transitiva/peer-meta legítima não viola o espírito do AC ("nada de Neon/`ws` **nosso**"). ⚠️→✅

---

## Critérios de aceite — veredito individual

### Portão geral

- ✅ **`npm run test` 100% verde** — rodado: 269 passed / 1 skipped. Único skip = herdado da S1. Zero falha nova.
- ✅ **`npm run build` limpo, sem erro de tipo** — rodado: 6/6 páginas, compilado com sucesso.
- ✅ **Zero referência a Neon/`ws`/`@types/ws`/`neonConfig`/`@vercel/blob`** em `src/`/`tests/`/`package.json`
  — busca própria: 0. `ws` só transitiva do `jsdom`; neon no lock só peer-meta opcional do drizzle (acima).
- ✅ **Reversível por `git revert`** — o PR é edição de arquivos existentes + 2 arquivos novos (certs, não
  versionados, e `.env.example`). Nada de estado externo alterado por código. `git revert` + envs antigas
  volta ao estado anterior sem edição manual. (Ver seção Reversibilidade.)

### Estágio A — Banco

- ✅ **`src/db/index.ts` usa `pg.Pool` + `drizzle-orm/node-postgres` sobre `DATABASE_URL`; WebSocket removido**
  — `index.ts:9-10,34,53`. Bloco Neon/WS ausente (grep 0).
- ✅ **TLS com CA pinado + bypass explícito do `checkServerIdentity`; cadeia validada (não `rejectUnauthorized:false` cego); comentário registra o porquê**
  — `index.ts:39-49`: `ca` pinado + `rejectUnauthorized: true` + `checkServerIdentity: () => undefined`,
  com comentário nas L42-48 explicando cert self-signed sem SAN. ✔ Não é bypass cego.
- ✅ **`db.transaction()` funcional — prova pelo teste do `saveCarousel`** — `carousel-actions.test.ts`
  (20 tests, incl. rollback) passou. *Ressalva de escopo (herdada do R2, já ciente pelo gate): o teste
  mocka `@/db`, então prova o contrato de código, não a transação ponta-a-ponta na VPS — essa é o smoke
  do Bloco 3. Isso está declarado e aceito na story/spec.*
- ✅ **`drizzle.config.ts` lê `DATABASE_URL_UNPOOLED`** — `drizzle.config.ts:12`. *Desvio necessário e
  justificado: o Postgres direto (5432) usa cert self-signed próprio, distinto do PgBouncer (6432); o
  config passou a pinar `certs/db-ca-migrate.pem` e remover `sslmode` (L17-28,36-42). Não é "mudança de
  lógica" de destino — é a config TLS mínima para o migrate conectar. Documentado no 04 e comentado no
  código. Aceito.*
- ✅ **`db:migrate` + `db:seed` recriam schema + seed na VPS** — o 04 reporta `migrations applied
  successfully!` e admin + client "Sua Marca" criados (`user 41e4bda1-…`). É passo manual/ops contra a VPS
  (não automatizável na suíte); confio no relato do backend **porque** o build usando `.env.local` real
  passou e o seed conectou de fato (evidência de TLS OK). ⚠️ Não re-executei o migrate (porta 5432 sob
  demanda; comando de infra, fora do meu alcance read-only) — registrado como "verificado por relato +
  evidência indireta", não por execução minha.
- ✅ **Ao fim do Estágio A, test + build verdes** — o 04 documenta 250/1 ao fim do A; hoje o total é 269/1
  (A+B+testes do 06), confirmado por mim.

### Estágio B — Storage

- ✅ **`route.ts` gera presigned PUT (AWS SDK) no lugar de `handleUpload`** — `route.ts:8-10,77-85`.
  - ✅ **gate de sessão → 401 falha-fechado** — `route.ts:54-57`; teste `blob-upload-route.test.ts:71-82`
    (401 + `getSignedUrl` **não** chamado).
  - ✅ **reforço server de content-type e tamanho (6 MB)** — Zod `route.ts:32-38` (`z.enum` + `max(MAX_IMAGE_BYTES)`),
    reforço extra via `ContentLength` assinado `route.ts:81`; testes: tipo barrado (`:109-121`), 6MB+1→400
    (`:123-134`), 6MB exato→200 (`:136-142`), assert `MAX_IMAGE_BYTES === 6*1024*1024` (`:133`).
  - ✅ **não vaza detalhe interno** — `route.ts:94-98` (`console.error` server-side, body genérico); teste
    `:181-193` afirma que `"credencial S3"` **não** aparece no body.
- ✅ **`blob-upload.ts` pede presigned → PUT no MinIO → devolve `publicUrl`; `validateImageFile` e `UploadResult` intactos**
  — `blob-upload.ts:10-12` (union discriminada), `:42-45` (validate mantido), `:49-80` (fluxo). Type guard
  `isPresignResponse` (`:22-30`) trata resposta como `unknown` antes de usar. Assinatura pública byte a byte.
- ✅ **`isAllowedBlobHost` aceita o host do MinIO mantendo match por sufixo de rótulo** — `export-png.ts:177-183`:
  `host === "storage.evoiatecnologia.com" || host.endsWith(".storage.evoiatecnologia.com")`. Testes
  (`export-safe-url.test.ts:28-39`) provam: `evil-storage.evoiatecnologia.com`→false,
  `storage.evoiatecnologia.com.evil.com`→false, `169.254.169.254`→false, arbitrários→false, exato+subdomínio→true.
- ✅ **`env.ts` remove `BLOB_READ_WRITE_TOKEN` e adiciona as 6 `S3_*` com Zod; falha fechado no boot sem imprimir valores**
  — `env.ts:15-27` (6 vars, `S3_ENDPOINT` com `.url()`), `:31-39` (`safeParse` → throw só com **nomes**
  das chaves, `i.path.join(".")`, nunca valores). Cobertura: `env-validation.test.ts` (11 testes).
- ✅ **`export-safe-url.test.ts` e `blob-upload-route.test.ts` atualizados, verdes, preservando as garantias**
  — lidos na íntegra; são testes substantivos (asserções reais de 401, corte de 6 MB, allowlist falha-fechado),
  não placebo. Passaram na minha execução.

---

## Edge cases — veredito individual

- ✅ **Upload sem sessão → 401, nenhuma presigned** — `blob-upload-route.test.ts:72` (`getSignedUrl` não chamado).
- ✅ **Content-type não permitido (`image/gif`, `application/pdf`) → 400 no server** — `:109` (`it.each` cobre os dois da story).
- ✅ **Arquivo > 6 MB → 400 no server** — `:123` (6MB+1) + `:136` (6MB exato → 200, prova o limite exato).
- ✅ **URL cross-origin de host não confiável no export → lança antes de qualquer fetch** — `export-safe-url.test.ts:60-67`
  (`fetchSpy` **não** chamado). Confirmado no código: `export-png.ts:224` (allowlist) roda **antes** do
  `fetch` em `:231`. SSRF via URL persistida barrado.
- ✅ **Falha de rede/CORS em host permitido → erro legível** — `export-safe-url.test.ts:86-100` afirma a
  mensagem (`/nao foi possivel carregar a imagem para o export/i`), não só "lança algo". Código: `export-png.ts:237-244`.
- ⚠️→✅ **TLS Postgres self-signed sem SAN → aceito só via CA pinado + bypass; cadeia divergente recusada**
  — **não automatizável na suíte** (exigiria Postgres TLS real). Config correta no código (`index.ts:39-49`,
  `rejectUnauthorized: true`). Provado empiricamente pelo backend (`SELECT 1 → { ok:1 }` via CA pinado, 04
  §Desvios). Lacuna consciente, pertence ao smoke do Bloco 3. Aceito.
- ⚠️→✅ **`certs/db-ca.pem` ausente → falha clara no boot, nunca conexão sem TLS** — `readFileSync`
  não-capturado em `index.ts:19` (comentado como intencional, L14-18); idem nos scripts e `drizzle.config.ts:23`.
  Não automatizado (teste seria frágil, acoplado ao path literal — decisão de custo/valor do 06, concordo).
  Comportamento garantido por leitura estrutural do código. Aceito.
- ✅ **Variável `S3_*` ausente → boot falha fechado com o nome da chave** — `env.ts:31-39`; `env-validation.test.ts`
  (11 testes: um por `S3_*`, + não vaza valor de secret, + múltiplas faltantes, + `S3_ENDPOINT` não-URL,
  + `BLOB_READ_WRITE_TOKEN` removido não bloqueia).
- ✅ **`db.transaction()` com erro no meio do replace-all → rollback, sem slides parciais** —
  `carousel-actions.test.ts` (20 tests): teste de rollback prova que a falha propaga (não retorna `{ok:true}`).
  *Prova de contrato; a atomicidade real na VPS é smoke do Bloco 3 (aceito).*

---

## Segurança (mentalidade `seguranca-baseline` + `analise-seguranca`)

Segui o dado não-confiável da entrada ao uso no handler de upload e no export. Achados:

- ✅ **Authz falha-fechado** — `route.ts:54-57`: sem `session.user.id` → 401 antes de qualquer trabalho.
  Nenhuma presigned emitida (provado por teste). Default nega.
- ✅ **Validação de borda** — todo input passa por Zod (`route.ts:32-38,62`); body não-JSON tratado
  (`try/catch` em `:59-98`, teste `:144`). `size`, `contentType`, `filename` validados tipo/faixa/enum.
- ✅ **Key não vem do cliente** — derivada no server via `randomUUID()` + mapa fechado de extensão
  (`route.ts:72-73`). O `filename` do cliente **não** entra na key (só é validado como não-vazio). Sem path traversal.
- ✅ **Nenhum segredo logado/vazado** — `console.error` loga o objeto de erro server-side; body sempre
  genérico (`"Falha no upload."` / `"Não autorizado."`). `env.ts` nunca imprime valores, só nomes de chave.
  Scripts (`seed.mjs`, `create-client.mjs`) nunca imprimem senha (comentado e verificado, `seed.mjs:109`,
  `create-client.mjs:132`). Credenciais S3 lidas de env, nunca hardcoded.
- ✅ **SSRF barrado** — `toExportSafeUrl` recusa host fora da allowlist **antes** do fetch (`export-png.ts:224`),
  incluindo `169.254.169.254` (metadata link-local). Não vira proxy de fetch arbitrário a partir de URL persistida.
- ✅ **TLS não é bypass cego** — `rejectUnauthorized: true` + CA pinado; só a checagem de hostname (que exige
  SAN) é ignorada. Cadeia validada. Descartado `rejectUnauthorized: false`.
- ✅ **`ContentType`/`ContentLength` assinados** — o MinIO recusa PUT divergente do assinado, então o reforço
  de tipo/tamanho vale mesmo com upload direto do browser (não só client-side).
- ✅ **`npm audit`** — 10 vulnerabilidades, **todas pré-existentes** (drizzle-kit/esbuild/next/postcss/vitest),
  nenhuma vinda do `aws-sdk` (confirmado pelo 04 via `--json`). Fora do escopo desta feature; não introduzido aqui.

**Nenhum achado de segurança explorável.** 🟢 único endurecimento sugerido (opcional): o comentário
desatualizado em `export-png.ts:221-222` ("CDN do Vercel Blob") pode confundir um futuro leitor — trocar
por "storage MinIO". Cosmético.

---

## Escopo (além? faltou?)

- **Faltou algo?** Não. Todos os arquivos da spec ("Arquivos a tocar") foram tocados; todos os ACs cobertos.
- **Entregou além do escopo?** Sim, mas **justificado e sem risco**:
  - `tests/export-zip.test.ts` e `tests/settings-action.test.ts` — fixtures de URL migradas do host Vercel
    para o MinIO. **Necessário** no `export-zip` (as URLs passam por `isAllowedBlobHost` e seriam recusadas
    com a nova allowlist); higiene no `settings-action` (URL inerte). Não afrouxa nenhuma garantia. ✔
  - `.env.example` — atualizado para pg self-hosted + MinIO, `BLOB_READ_WRITE_TOKEN` removido, 6 `S3_*`
    documentadas sem valores. Alinha ao AC de segurança "existe `.env.example` sem valores". Documentação,
    não código de produção. ✔
  - `scripts/seed.mjs` e `scripts/create-client.mjs` migrados para `pg` — **obrigatório** (R1): sem isso
    `db:seed` quebraria na VPS. Já aprovado no gate da spec. ✔
- **"Fora de escopo" virou furo?** Não. Deploy/cutover, mudança de UI, reemissão de cert e provisionamento
  de infra permaneceram intocados, como a story exige.

---

## Riscos do research/spec (tratado / de pé)

- **R1** (scripts importam Neon) → **tratado**: migrados para `pg` com mesma config TLS; grep 0.
- **R2** (`carousel-actions.test.ts` mocka `@/db`) → **de pé por design**: prova de contrato, não ponta-a-ponta.
  A transação real na VPS é smoke do Bloco 3. Declarado e aceito. Não é furo.
- **R3** (`ws` transitiva) → **tratado/aceito**: `ws` só via `jsdom`; neon no lock só peer-meta opcional do drizzle.
- **R4** (`@/lib/env` no teste) → **tratado**: `vi.mock("@/lib/env")` no `blob-upload-route.test.ts:16-25`.
- **R5** (CORS/TLS do MinIO no PUT direto) → **de pé, fora de escopo**: é ops/smoke do Bloco 3. Se falhar,
  vira `{ok:false}` genérico (a UI já trata). Não é regressão desta entrega. Documentado.
- **R6** (Content-Type do PUT bate com o assinado) → **tratado**: handler ecoa `contentType`; o wrapper usa
  o valor ecoado no header do PUT (`blob-upload.ts:73`), não `file.type` reinferido.

---

## Reversibilidade

✅ **Reversível por `git revert`.** O PR é: edição de arquivos versionados existentes (`src/`, `scripts/`,
`package.json`, `drizzle.config.ts`, testes, `.env.example`) + 2 arquivos **novos não versionados**
(`certs/*.pem`, ignorados pelo `.gitignore`). Nenhum arquivo deletado, nenhuma migration destrutiva
(nenhum `db:generate` novo), nenhum estado externo alterado por código do PR. `git revert` + restaurar as
envs antigas volta ao estado atual sem edição manual. Certs e `.env.local` **não estão no git** (confirmado:
`git ls-files certs/` e `git ls-files .env.local` retornam vazio) — não vazam para o repo.

---

## Recomendação ao GATE humano

**✅ APROVAR.** A entrega cumpre todos os critérios de aceite e edge cases automatizáveis com evidência
verificada por mim. As lacunas restantes (transação ponta-a-ponta na VPS, TLS real, CA ausente, CORS do
MinIO) são **conscientes, declaradas e pertencem ao smoke do Bloco 3** — não são omissões desta fatia.
Segurança sólida, sem achado explorável. Único item pendente é 🟢 cosmético (comentário desatualizado em
`export-png.ts:221`), que **não bloqueia** o merge e pode ser corrigido junto ou depois.

> Nota honesta ao humano: eu **não re-executei** `db:migrate`/`db:seed` contra a VPS (comando de infra,
> porta 5432 sob demanda, fora do meu alcance read-only). Esses dois ACs estão verificados por **relato do
> backend + evidência indireta** (build com `.env.local` real passou; seed conectou via TLS). Se quiser
> prova de primeira mão da recriação de schema, ela vem no smoke do Bloco 3 — que é o momento certo para isso.
