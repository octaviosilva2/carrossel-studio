# Sessão 2026-07-02 — ADR 0002 Bloco 2: Código (banco Neon→pg + storage Blob→MinIO)

## Objetivo
Trocar o driver de banco (Neon serverless → `pg` sobre o Postgres self-hosted da VPS) e o
storage (Vercel Blob → MinIO/S3 via presigned PUT), conforme `docs/adr/0002-migracao-vps-easypanel.md`
(Fases 2, 3, 4b). Pré-requisito (Bloco 1) confirmado no início: `.env.local` com `DATABASE_URL`,
`DATABASE_URL_UNPOOLED` e as 6 `S3_*` já preenchidas com valores reais.

Conduzido pela esteira `dev-agents:feature` (slug `adr0002-bloco2-codigo`, artefatos em `.work/`),
research pulado (ADR já mapeava tudo), gates de story e spec aprovados pelo CEO, validação final
independente com veredito ✅ APROVAR.

## Pré-requisito verificado — certificado TLS
O certificado do Postgres é self-signed **sem SAN** (só `CN=db.evoiatecnologia.com`). Decisão
tomada com o CEO: **pinning** do certificado exato em vez de reemitir. Descoberta importante durante
a implementação: **as portas 6432 (PgBouncer) e 5432 (Postgres direto) usam certificados self-signed
DIFERENTES** (fingerprints SHA-256 distintos) — precisou de dois arquivos de CA pinados:
- `certs/db-ca.pem` — runtime da app (via PgBouncer, `src/db/index.ts` e os scripts).
- `certs/db-ca-migrate.pem` — só migrations (`drizzle.config.ts`, Postgres direto).

Ambos fora do git (`.gitignore` cobre `certs/`). Em ambos, a cadeia é validada contra o CA pinado
(`rejectUnauthorized: true`); só a checagem de hostname é ignorada (`checkServerIdentity: () =>
undefined`), porque o certificado não tem SAN para checar.

## Estágio A — Banco
- `src/db/index.ts` reescrito: `pg.Pool` + `drizzle-orm/node-postgres` sobre `DATABASE_URL`
  (PgBouncer, transaction mode), TLS com CA pinado. Bloco de WebSocket/Neon removido por completo.
  `db.transaction()` preservado (prova: suíte do `saveCarousel`, sem edição).
- `scripts/seed.mjs` e `scripts/create-client.mjs` migrados de `@neondatabase/serverless`+`ws` para
  `pg` (mesma config TLS) — necessário: sem isso `db:seed` quebraria na VPS.
- `drizzle.config.ts` ajustado (achado na implementação, ver acima): remove `sslmode` da URL e pina
  `certs/db-ca-migrate.pem` — sem isso o `drizzle-kit migrate` ficava pendurado indefinidamente
  (hang silencioso, sem erro de TLS visível) tentando validar contra um CA desconhecido.
- **`npm run db:migrate` + `npm run db:seed` rodados de verdade contra a VPS** (porta 5432 aberta
  sob demanda pelo CEO e fechada de novo ao final): schema recriado, admin + client "Sua Marca"
  semeados com sucesso.

## Estágio B — Storage
- `src/app/api/blob/upload/route.ts`: `handleUpload` do Vercel Blob trocado por **presigned PUT**
  (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`). Gate de sessão (401 falha-fechado), Zod
  na borda, `key` derivada no server (`randomUUID`, nunca do cliente), `ContentLength` assinado
  (reforço server do tamanho mesmo com upload direto do browser), erro genérico sem vazar detalhe.
- `src/lib/blob-upload.ts`: pede a presigned → `PUT` direto no MinIO → devolve a URL pública.
  Contrato `UploadResult`/`uploadImageToBlob` preservado byte a byte (3 consumidores não editados).
- `isAllowedBlobHost` (`src/lib/export-png.ts`): allowlist trocada pro host do MinIO
  (`storage.evoiatecnologia.com`, exato + subdomínio), mantendo o match por sufixo de rótulo.
- `src/lib/env.ts`: `BLOB_READ_WRITE_TOKEN` removida; 6 `S3_*` adicionadas com Zod, falha fechada
  no boot preservada.
- URL pública **path-style** (`https://storage.evoiatecnologia.com/carrossel-studio/<key>`) —
  confirmado contra o `.env.local` real (S3_ENDPOINT e S3_PUBLIC_HOST são o mesmo host).

## Testes
- **269 passed / 1 skipped** (skip herdado da S1). Cobertura nova: `tests/env-validation.test.ts`
  (11 testes, novo), reforço de rollback em `carousel-actions.test.ts`, mensagem de erro de rede em
  `export-safe-url.test.ts`, reescrita de `blob-upload-route.test.ts` (8 testes) e
  `export-safe-url.test.ts` pro novo contrato. `npm run build` limpo, 6/6 páginas.
- Validação independente (07-validator) rodou os comandos e leu o código de verdade (não só os
  relatórios): confirmou zero resquício de `@neondatabase/serverless`/`ws` nosso/`neonConfig`/
  `@vercel/blob`, segurança sólida no handler de upload (authz falha-fechado, sem SSRF, sem
  vazamento), certs fora do git, PR reversível por `git revert`. Único achado: comentário
  desatualizado em `export-png.ts` — corrigido.

## Fora de escopo (permanece pro Bloco 3)
- Deploy e troca de envs na Vercel.
- Smoke real no navegador: login → criar carrossel → upload de avatar/imagem → export PNG
  (confirma MinIO + CORS + allowlist ponta a ponta).
- Verificar se o MinIO responde path-style ou exige virtual-hosted (a allowlist já cobre os dois).

## Próximo passo
Bloco 3 do ADR 0002 (cutover): envs na Vercel, deploy, smoke test manual, rollback se necessário.
