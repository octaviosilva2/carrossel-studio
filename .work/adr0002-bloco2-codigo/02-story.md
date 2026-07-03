# Story — Migração de infra (Bloco 2, código): banco Neon→pg self-hosted + storage Vercel Blob→MinIO/S3

> Refactor de infra puramente backend, entregue em **um PR** feito em **dois estágios internos**
> (Estágio A — banco; Estágio B — storage), rodando a suíte verde ao fim de cada um. Sem mudança
> de UI. Contexto/research: `docs/adr/0002-migracao-vps-easypanel.md` (Fases 2, 3, 4b) +
> `.work/adr0002-bloco2-codigo/STATUS.md`.

## User Story

**Como** CTO operando o Carrossel Studio, **quero** trocar o driver de banco (Neon serverless →
`pg` sobre o Postgres self-hosted da VPS) e o storage de imagens (Vercel Blob → MinIO/S3 via
presigned PUT) sem alterar comportamento observável do produto, **para que** o backend e o storage
rodem 100% na VPS já paga, eliminando o teto de cobrança dos serviços gerenciados, com a suíte de
testes existente provando que nada regrediu.

## Critérios de aceite

### Portão geral (vale para o PR inteiro)
- [ ] `npm run test` passa 100% verde: os ~250 testes existentes **mais** os testes ajustados de
      `tests/export-safe-url.test.ts` e `tests/blob-upload-route.test.ts` (o skip herdado da S1
      continua sendo o único skip; nenhuma falha nova).
- [ ] `npm run build` (build de produção Next.js) conclui limpo, sem erro de tipo.
- [ ] Nenhuma referência a `@neondatabase/serverless`, `ws`, `@types/ws`, `neonConfig` ou
      `@vercel/blob` sobra em `src/`, em `tests/`, nem em `package.json` (dependências e
      `package-lock.json`). Verificável por busca textual retornando zero ocorrência.
- [ ] O PR é reversível por `git revert` + envs antigas (não deixa o banco/storage antigo
      inalcançável por código; a reversão volta ao estado atual sem edição manual de código).

### Estágio A — Banco (Fases 2 e 3)
- [ ] `src/db/index.ts` usa `pg.Pool` + `drizzle-orm/node-postgres` sobre `DATABASE_URL` (PgBouncer,
      transaction mode). A config de WebSocket (`neonConfig.webSocketConstructor`, `ws`) foi removida.
- [ ] O client `pg` usa TLS com o **CA pinado** de `certs/db-ca.pem` e faz **bypass explícito do
      `checkServerIdentity`** (o cert é self-signed sem SAN — decisão do CEO já tomada; não reemitir).
      O `pool` continua validando a cadeia contra o CA pinado (não é `rejectUnauthorized: false`
      cego). Um comentário no código registra por que o `checkServerIdentity` é ignorado.
- [ ] `db.transaction()` continua funcional — **prova:** o teste do `saveCarousel` (replace-all de
      slides em transação) passa verde com o novo driver.
- [ ] `drizzle.config.ts` segue lendo `DATABASE_URL_UNPOOLED` (:5432 direto) para migrations; nenhuma
      mudança de lógica ali (só o valor no `.env`, que já está preenchido, muda o destino).
- [ ] `npm run db:migrate` seguido de `npm run db:seed` recriam schema + seed na VPS com sucesso
      (schema `users/clients/carousels/slides` presente; admin + client "Sua Marca" semeados).
- [ ] Ao fim do Estágio A, `npm run test` + `npm run build` estão verdes **antes** de iniciar o
      Estágio B.

### Estágio B — Storage (Fase 4b)
- [ ] `src/app/api/blob/upload/route.ts` gera **presigned PUT** (via `@aws-sdk/client-s3` +
      `@aws-sdk/s3-request-presigner`) em vez do `handleUpload` do Vercel Blob, e:
  - [ ] mantém o **gate de sessão** — requisição sem usuário logado responde **401** (falha fechado);
  - [ ] mantém o **reforço server** de content-type (`ALLOWED_CONTENT_TYPES`) e de tamanho
        (`MAX_IMAGE_BYTES` = 6 MB) — tipo/tamanho inválido é **rejeitado no servidor**, não só no
        client (mentalidade `dev-agents:seguranca-baseline`);
  - [ ] não vaza detalhe interno em erro (mensagem genérica ao cliente, como hoje).
- [ ] `src/lib/blob-upload.ts` pede a presigned URL ao handler, faz `PUT` direto no MinIO e devolve a
      **URL pública final**, **mantendo** `validateImageFile` e o contrato `UploadResult` (union
      discriminada `{ ok:true; url } | { ok:false; error }`) intactos.
- [ ] `isAllowedBlobHost` (`src/lib/export-png.ts`, ~linha 168) aceita o host do MinIO
      (`S3_PUBLIC_HOST` = `storage.evoiatecnologia.com`) em vez do sufixo do Vercel Blob, **mantendo
      o match por sufixo de rótulo** (host tipo `evil-storage.evoiatecnologia.com` continua recusado;
      hosts arbitrários e `169.254.169.254` continuam recusados).
- [ ] `src/lib/env.ts` **remove** `BLOB_READ_WRITE_TOKEN` e **adiciona** as 6 vars com validação Zod:
      `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_HOST`.
      O app continua falhando fechado no boot se alguma faltar, sem imprimir valores (só nomes).
- [ ] `tests/export-safe-url.test.ts` e `tests/blob-upload-route.test.ts` foram atualizados para o
      novo contrato (host do MinIO na allowlist; presigned PUT no lugar de `handleUpload`) e passam
      verdes, preservando as mesmas garantias de segurança que testam hoje (allowlist falha-fechado;
      401 sem sessão; limite server de 6 MB).

## Edge cases

- **Upload sem sessão** → handler responde **401**, nenhuma presigned URL é emitida.
- **Content-type não permitido** (ex.: `image/gif`, `application/pdf`) → rejeitado no **server**
  (condição da presigned não o inclui); client também barra via `validateImageFile`.
- **Arquivo acima de 6 MB** → rejeitado no server (limite `MAX_IMAGE_BYTES` na presigned) e no client.
- **URL de imagem cross-origin de host não confiável** no export (ex.: `https://evil.com/x.png`) →
  `toExportSafeUrl` **lança antes de qualquer fetch** (allowlist falha-fechado); export inteiro falha
  com mensagem legível e o editor segue vivo.
- **Falha de rede/CORS ao buscar bytes de host permitido** no export → `toExportSafeUrl` lança erro
  legível; comportamento idêntico ao atual (não é objetivo desta feature consertar CORS — é ops).
- **TLS do Postgres com cert self-signed sem SAN** → aceito **apenas** via CA pinado + bypass do
  `checkServerIdentity`; qualquer cert cuja cadeia não bata com o CA pinado é **recusado** (não é
  bypass cego de verificação).
- **`certs/db-ca.pem` ausente** no ambiente onde o app roda → o client `pg` deve falhar com erro
  claro no boot/conexão (não silenciar nem cair pra conexão sem TLS). `certs/` está no `.gitignore`,
  então CI/deploy precisam provê-lo — comportamento esperado: erro explícito, não conexão insegura.
- **Variável `S3_*` ausente** → boot falha fechado em `env.ts` com o nome da chave faltante.
- **`db.transaction()` com erro no meio do replace-all de slides** → rollback atômico (garantia do
  `pg`); o carrossel não fica com slides parciais. Coberto pelo teste do `saveCarousel`.

## Fora de escopo

- **Deploy e troca de envs na Vercel** — é o **Bloco 3** (Fase 7 / Cutover), sessão separada. Nada de
  mexer no painel da Vercel nem disparar deploy de produção aqui.
- **Qualquer mudança de UI/frontend** — nenhum componente React, rota de página ou fluxo de tela é
  tocado. O contrato `SlideData`/reducer da S2 e o `<Slide>` permanecem intactos.
- **Reemissão do certificado TLS do Postgres** — decisão já tomada: **pinning** do cert atual. Não
  gerar cert novo, não configurar SAN, não trocar o CA nesta feature.
- **Provisionamento da infra na VPS** (Postgres, PgBouncer, MinIO, bucket, CORS, backup, firewall) —
  é o **Bloco 1**, já concluído. Esta feature assume a infra no ar e o `.env.local` preenchido.
- **Migração de dados reais / `pg_dump`→`pg_restore` de paridade** — não há dado de produção; o
  caminho é schema + seed limpos (`db:migrate` + `db:seed`). O dump de paridade é opcional e não
  entra como AC.
- **Otimização de pooling avançado, retry/backoff de conexão, métricas** — `max` conservador basta;
  tuning fica para quando houver carga real (YAGNI).
- **Cota de upload por usuário, proxy same-origin de imagem, backup do app** — fatias futuras já
  registradas no STATUS/ADR; não embarcar.

## Perguntas abertas

Nenhuma bloqueante. Os dois pontos historicamente ambíguos já foram decididos com o CEO nesta sessão
e estão fixados como critérios de aceite, não como perguntas:

- **TLS self-signed sem SAN** → resolvido: CA pinado (`certs/db-ca.pem`) + bypass do
  `checkServerIdentity`, sem reemitir cert.
- **Recriação de schema na VPS** → resolvido: caminho limpo `db:migrate` + `db:seed` (sem dado real).

Item para o Spec (03) decidir, **não** bloqueante para aprovar a story:

- `[PRECISA CLARIFICAR (no spec, não no gate): formato exato da URL pública final devolvida por
  blob-upload.ts]` — se é `${S3_PUBLIC_HOST}/${bucket}/${key}` ou `${S3_PUBLIC_HOST}/${key}` (bucket
  no host vs no path) depende de como o MinIO/bucket foi exposto no Bloco 1. É detalhe de
  implementação a confirmar contra o `.env` real na spec; a story só exige que a URL retornada seja
  **acessível publicamente e passe na allowlist `isAllowedBlobHost`**.
