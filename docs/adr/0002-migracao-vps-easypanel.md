# ADR 0002 — Migração de infra: Neon + Vercel Blob → VPS Hostinger (EasyPanel)

- **Data:** 2026-07-02
- **Status:** **Implementada** (2026-07-03) — Blocos 1, 2 e 3 concluídos. Banco e storage
  self-hosted na VPS em produção, app na Vercel apontando pra eles, smoke test completo PASS.
- **Decisor:** CTO (Claude), delegado pelo CEO (Octavio)
- **Substitui parcialmente:** ADR 0001 (camadas Banco e Storage)

---

## 1. Contexto

O CEO já paga uma **VPS na Hostinger** subutilizada, com **EasyPanel** (PaaS Docker, com templates
one-click de Postgres, MinIO, Redis, etc. e deploy por Git/Compose) já disponível. A ideia é sair de
serviços gerenciados que cedo ou tarde cobram — **Neon** (Postgres) e **Vercel Blob** (storage) — e
rodar **banco e storage self-hosted na VPS via EasyPanel**.

**Janela livre:** o produto (S1–S6) está pronto e testado (250 testes verdes, build limpo), mas **o
deploy de produção nunca foi feito**. Sem clientes reais, sem dados de produção — então o corte pode
ter downtime de minutos e o rollback é barato.

**Escopo confirmado com o CEO:** migram **apenas banco e storage**. O app Next.js **continua na
Vercel** (deploy via repo no GitHub) e se conecta à VPS de fora.

### Domínio (decisão do CEO)
- **Domínio base:** `evoiatecnologia` — *TLD a confirmar na execução (assumir `.com.br` salvo aviso).*
- **App (Vercel):** subdomínio **`carrosselstudio.evoiatecnologia`**. O deploy sai do repo GitHub
  para a Vercel; o domínio `evoiatecnologia` aponta o subdomínio pra Vercel (CNAME).
- **Infra (VPS Hostinger):** subdomínios `db.evoiatecnologia` (Postgres/PgBouncer) e
  `storage.evoiatecnologia` (MinIO), apontando (A record) pro IP da VPS.
- Usar essa montagem **até validar completamente**; só então pensar em domínio definitivo.

### Estado técnico a migrar (verificado no código)
- **Banco:** Neon Postgres 18. Driver atual `@neondatabase/serverless` 1.1.0 (Pool + WebSocket via
  `ws`) em [src/db/index.ts](../../src/db/index.ts) — protocolo proprietário da Neon, **não fala com
  Postgres puro**. `db.transaction()` é usado no `saveCarousel` (replace-all de slides).
- **Duas connection strings:** `DATABASE_URL` (pooled, runtime) e `DATABASE_URL_UNPOOLED` (direta, só
  migrations via [drizzle.config.ts](../../drizzle.config.ts)).
- **Storage:** Vercel Blob, **client upload direto do browser** ([src/lib/blob-upload.ts](../../src/lib/blob-upload.ts))
  com token gerado no handler [src/app/api/blob/upload/route.ts](../../src/app/api/blob/upload/route.ts)
  (exige sessão). Usado para avatar de cliente e imagem de slide.
- **Allowlist de host** em `isAllowedBlobHost` ([src/lib/export-png.ts:168](../../src/lib/export-png.ts#L168)):
  hoje só `*.public.blob.vercel-storage.com`. Precisa generalizar pro novo host.
- **Env validada** em [src/lib/env.ts](../../src/lib/env.ts): `DATABASE_URL`, `AUTH_SECRET`,
  `BLOB_READ_WRITE_TOKEN`.

---

## 2. Ponto de arquitetura em aberto (registrado, não bloqueia)

Manter o app na Vercel com o banco na VPS significa que **toda query cruza a internet pública**. Isso
é a origem de metade da complexidade deste plano: obriga expor o Postgres publicamente com TLS +
PgBouncer, sem allowlist de IP (Vercel é serverless, IP dinâmico), com latência de rede por query, e
expõe o MinIO ao CORS do browser.

**Alternativa (usar a VPS ao máximo):** mover o app inteiro pra VPS via EasyPanel (deploy do mesmo
repo GitHub, Nixpacks/Dockerfile). Elimina a exposição pública do Postgres (rede interna do EasyPanel),
o problema de pooling serverless e boa parte do ambiente de staging. Custo: perde CDN/edge da Vercel e
passa a gerir o runtime do app.

**Decisão atual:** seguir o escopo do CEO (app na Vercel). Fica registrada por ser a de maior
alavancagem — se um dia o custo/latência de query pública incomodar, é o caminho.

---

## 3. Decisão

Migrar **banco** e **storage** para a VPS via EasyPanel, fixando estas escolhas técnicas:

| Item | Escolha | Por quê |
|---|---|---|
| Driver Drizzle | **`pg` (node-postgres)** + `drizzle-orm/node-postgres` | Fala Postgres puro; mantém `db.transaction()`. **Escolhido sobre `postgres.js` de propósito:** postgres.js usa prepared statements por padrão, que quebram com PgBouncer em transaction mode; `pg` não tem esse atrito. |
| Pooler | **PgBouncer, transaction mode** | Vercel serverless abre muitas conexões curtas; o pooler multiplexa. Migrations vão direto no 5432 (session mode). |
| Storage | **MinIO** (S3-compatible), template do EasyPanel | Substitui o Vercel Blob mantendo o client-upload direto. |
| SDK de upload | **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`** | Gera **presigned PUT** no server (com gate de sessão); o browser sobe direto no MinIO. |
| Backup | **Backup agendado do EasyPanel** (Postgres → destino S3/MinIO) + restore testado | Substitui o backup gerenciado da Neon. Inegociável. |
| Staging | **Segundo Postgres no EasyPanel** (`carrossel_staging`) | Não há "branch de banco" self-hosted; um DB isolado é o substituto barato. |

> **Nota EasyPanel:** o proxy embutido (Traefik) faz TLS automático (Let's Encrypt) para serviços
> **HTTP** — cobre o MinIO (`storage.evoiatecnologia`) de forma trivial. O **Postgres é TCP**, não
> HTTP: o TLS dele é configurado **no próprio serviço Postgres** (certs no container), não pelo proxy.
> O Bloco 1 trata isso explicitamente.

---

## 4. Plano de execução (por fases)

> **Legenda:** 🔧 = **ops** (você no painel do EasyPanel / terminal da VPS) · 💻 = **código** (esteira
> dev-agents). O código só é tocado depois que a infra da fase correspondente existe.

### Fase 0 — Pré-requisitos (BLOQUEIAM tudo)
- [ ] 🔧 **Specs da VPS** (RAM/CPU/disco) confirmadas. Mínimo prático: ~2 GB RAM livres
      (Postgres + PgBouncer + MinIO + backup) e disco folgado pro storage de imagens.
- [ ] 🔧 **EasyPanel acessível** e projeto criado pro Carrossel Studio.
- [ ] 🔧 DNS: `db.evoiatecnologia` e `storage.evoiatecnologia` (A → IP da VPS);
      `carrosselstudio.evoiatecnologia` (CNAME → Vercel).
- [ ] 🔧 Guardar as credenciais atuais (Neon `DATABASE_URL` / `DATABASE_URL_UNPOOLED` e
      `BLOB_READ_WRITE_TOKEN`) — são o rollback.

### Fase 1 — Postgres no EasyPanel 🔧
1. Criar serviço **PostgreSQL 18** (mesma major da Neon — evita surpresa no dump/restore) com
   **volume persistente**.
2. Habilitar **TLS no Postgres** (certs no serviço — ver nota do EasyPanel na seção 3).
3. Subir **PgBouncer** (serviço Compose no EasyPanel), transaction mode, apontando pro Postgres interno.
4. Configurar **backup agendado** (EasyPanel → backup do Postgres pra S3/MinIO + retenção) e
   **validar um restore de teste** antes de confiar.
5. Criar usuário do app **sem superuser** (least privilege).

### Fase 2 — Troca de driver + pooling 💻
Arquivos: [src/db/index.ts](../../src/db/index.ts), [drizzle.config.ts](../../drizzle.config.ts),
[package.json](../../package.json).
1. `npm rm @neondatabase/serverless ws @types/ws` · `npm i pg` · `npm i -D @types/pg`.
2. Reescrever `src/db/index.ts`: `pg.Pool` sobre `DATABASE_URL` (PgBouncer) + `drizzle-orm/node-postgres`,
   `ssl: { rejectUnauthorized: true, ca }`, `max` conservador. Remover a config de WebSocket
   (linhas 6–16). `db.transaction()` continua funcionando.
3. `DATABASE_URL` → PgBouncer (porta transaction); `DATABASE_URL_UNPOOLED` → 5432 direto (migrations em
   session mode). `drizzle.config.ts` já lê a unpooled — só muda o valor no `.env`.
4. `npm run test` + `npm run build` verdes — os 250 testes são a rede de segurança da troca.

### Fase 3 — Dump / restore 💻🔧
Como não há dado real, é praticamente schema + seed:
1. **Caminho limpo (recomendado):** `npm run db:migrate` contra a VPS → recria schema; depois `npm run db:seed`.
2. **Paridade exata (opcional):** `pg_dump` da Neon (unpooled) → `pg_restore` na VPS; guardar o dump
   como snapshot de rollback.

### Fase 4 — MinIO no EasyPanel 🔧
1. Subir **MinIO** (template do EasyPanel) com **volume** e domínio `storage.evoiatecnologia`
   (TLS automático via Traefik).
2. Criar **bucket** com leitura pública dos objetos (avatares/slides são públicos por design).
3. Criar **access key / secret** dedicados ao app.
4. Configurar **CORS do bucket**: permitir `PUT` a partir da origem `https://carrosselstudio.evoiatecnologia`.

### Fase 4b — SDK de storage + allowlist 💻
Arquivos: [src/lib/blob-upload.ts](../../src/lib/blob-upload.ts),
[src/app/api/blob/upload/route.ts](../../src/app/api/blob/upload/route.ts),
[src/lib/env.ts](../../src/lib/env.ts),
[src/lib/export-png.ts:168](../../src/lib/export-png.ts#L168),
[tests/export-safe-url.test.ts](../../tests/export-safe-url.test.ts),
[tests/blob-upload-route.test.ts](../../tests/blob-upload-route.test.ts).
1. `npm rm @vercel/blob` · `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`.
2. **Route handler:** trocar `handleUpload` do Blob por **presigned PUT**, **mantendo o gate de sessão**
   (hoje linhas 22–27) e o reforço de content-type/tamanho (`ALLOWED_CONTENT_TYPES`, `MAX_IMAGE_BYTES`)
   nas condições da presigned.
3. `src/lib/blob-upload.ts`: pedir a presigned URL ao handler → `fetch(url, { method: 'PUT' })` direto
   no MinIO → devolver a **URL pública final**. Manter `validateImageFile` e o contrato `UploadResult`.
4. `isAllowedBlobHost` ([export-png.ts:168](../../src/lib/export-png.ts#L168)): trocar o sufixo do
   Vercel Blob pelo host do MinIO (`storage.evoiatecnologia`). **Manter o match por sufixo de rótulo**
   (defesa das linhas 166–169 contra `evil-storage.evoiatecnologia`).
5. `src/lib/env.ts`: remover `BLOB_READ_WRITE_TOKEN`; adicionar `S3_ENDPOINT`, `S3_ACCESS_KEY`,
   `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_HOST` (com validação Zod).
6. Atualizar os testes de allowlist e do route handler pro novo contrato.
7. `npm run test` + `npm run build` verdes.

### Fase 5 — Rede / segurança 🔧
Sem allowlist de IP possível, defesa em camadas:
- **TLS obrigatório** no Postgres e no MinIO (cert válido; `rejectUnauthorized: true` no client `pg`).
- **Senha forte** (gerada) + usuário do app **sem superuser**.
- **Porta não-default** pro Postgres exposto + **firewall** liberando só o necessário.
- **fail2ban** na VPS contra brute-force.
- Expor **só o PgBouncer**, não o 5432 direto. Migrations você roda de um IP conhecido, abrindo o 5432
  sob demanda.

### Fase 6 — Dev / staging 🔧
- **Segundo Postgres no EasyPanel** (`carrossel_staging`), isolado, mesma VPS.
- Dev local: Postgres em Docker na sua máquina (schema reproduzível via `db:migrate`).
- Sem substituto 1:1 pra "branch por PR" da Neon; custo baixo dado o schema pequeno.

### Fase 7 — Cutover 💻🔧
1. Setar as novas envs na Vercel (Postgres + MinIO da VPS).
2. `db:migrate` + `db:seed` na VPS.
3. **Smoke test:** login → criar carrossel → upload de imagem → export PNG (avatar e imagem precisam
   renderizar no PNG, validando a nova allowlist).
4. Downtime de minutos aceitável (sem produção).

---

## 5. Rollback
Baixo risco (sem produção). Reverter = restaurar as envs antigas (Neon + Blob) na Vercel e redeploy da
branch anterior à troca de driver. **Manter a conta Neon/Blob viva** (free tier) por alguns dias após o
corte. As Fases 2 e 4b são um **PR único reversível**: `git revert` + envs antigas volta ao estado atual.

---

## 6. Custo
- **Hoje:** Neon + Vercel Blob no free tier = R$0, com teto que escala pra cobrança conforme
  clientes/imagens crescem.
- **Pós-migração:** custo marginal **zero** (a VPS é gasto afundado já pago). O trade é **operacional**:
  você assume backup, patching e uptime que antes eram gerenciados.

---

## 7. Consequências
- Backend e storage 100% self-hosted, sem teto de cobrança gerenciada.
- Postgres exposto à internet pública → superfície de ataque nova, mitigada pela Fase 5.
- Latência de query maior que Neon (query cruza a internet) — aceitável pro volume atual.
- Perde-se "branch de banco" da Neon; staging vira um DB separado.
- O ADR 0001 continua válido; só as linhas **Banco** e **Storage** passam a apontar pra VPS.

---

## 8. Prompts de execução (para o Sonnet)

> **Como usar:** três blocos cobrem as 7 fases, na ordem de execução real. Cada bloco é uma conversa
> NOVA do Claude Code (Sonnet) com o projeto aberto. Rode **na ordem** e só abra o próximo com o
> anterior concluído.
>
> - **Bloco 1 — Infra na VPS** (Fases 0, 1, 4, 5, 6): 100% ops. **Você não tem SSH configurado pro
>   agente**, então o Sonnet **conduz** — te dá um passo por vez, você executa no painel do EasyPanel /
>   terminal da VPS e cola o resultado, ele valida e segue. Entrega o `.env` completo.
> - **Bloco 2 — Código** (Fases 2, 3, 4b): o Sonnet edita o código pela esteira dev-agents. Só rode
>   depois que o Bloco 1 entregou o `.env`.
> - **Bloco 3 — Cutover** (Fase 7): conduzido, mistura painel da Vercel + smoke test.
>
> Regra de ouro dos três: se uma credencial, host ou spec faltar, o agente **para e pergunta** — nunca
> inventa valor nem assume clique que não confirmou na sua tela.

### Bloco 1 — Provisionar a infra na VPS (Fases 0, 1, 4, 5, 6) · conduzido, sem código

```text
Migração de infra do Carrossel Studio — Bloco 1 (infra na VPS via EasyPanel). Leia
docs/adr/0002-migracao-vps-easypanel.md INTEIRO antes de agir. Você vai me CONDUZIR nas Fases 0, 1, 4,
5 e 6 (provisionamento). Eu NÃO te dei acesso SSH: você não executa nada no servidor — eu executo. Seu
papel é guiar e validar.

Como conduzir (siga à risca):
- Trabalhe UM PASSO POR VEZ. Dê a instrução exata (onde clicar no painel do EasyPanel OU o comando
  literal pra eu colar no terminal da VPS), depois PARE e espere eu colar o resultado/print.
- Só avance quando o passo anterior estiver confirmado. Se algo na minha tela não bater com o que você
  esperava, me peça um print em vez de adivinhar.
- Não invente nomes de botão/menu/template do EasyPanel que você não tem certeza que existem — na
  dúvida, pergunte o que aparece na minha tela.

Antes de começar, colete de mim e CONFIRME (Fase 0):
- Specs da VPS: RAM, CPU, disco livre, SO/distro.
- EasyPanel acessível e projeto do Carrossel Studio criado.
- DNS: confirmar o TLD real de "evoiatecnologia" e que db.evoiatecnologia / storage.evoiatecnologia
  apontam (A) pro IP da VPS.

Depois conduza, em ordem, validando cada um antes do próximo:

FASE 1 — Postgres:
1. Criar serviço PostgreSQL 18 no EasyPanel, com volume persistente.
2. Habilitar TLS no Postgres (é TCP, não passa pelo proxy HTTP — cert no próprio serviço; me guie).
3. Subir PgBouncer (serviço Compose no EasyPanel), transaction mode, apontando pro Postgres interno.
4. Configurar backup agendado do Postgres (destino MinIO ou local + retenção) e me guiar a TESTAR um
   restore antes de confiar.
5. Criar usuário do app SEM superuser (least privilege).

FASE 4 — MinIO:
6. Subir MinIO (template do EasyPanel) com volume e domínio storage.evoiatecnologia (TLS via Traefik).
7. Criar bucket com leitura pública dos objetos.
8. Criar access key/secret dedicados ao app.
9. Configurar CORS do bucket liberando PUT da origem https://carrosselstudio.evoiatecnologia.

FASE 5 — Segurança (me dê os comandos exatos pra colar):
10. Confirmar TLS ativo em Postgres e MinIO (cert válido).
11. Firewall: liberar só o necessário; expor o PgBouncer, NÃO o 5432 direto.
12. fail2ban instalado e ativo.
13. Conferir que o usuário do app não é superuser e a senha é forte.

FASE 6 — Staging:
14. Criar um segundo Postgres (carrossel_staging) isolado no mesmo EasyPanel.

ENTREGA FINAL (obrigatória): monte pra mim o conteúdo COMPLETO do .env.local com os valores reais
coletados, exatamente com estas chaves (o Bloco 2 depende delas):
  DATABASE_URL          -> string do PgBouncer (transaction), com sslmode
  DATABASE_URL_UNPOOLED -> string do Postgres 5432 direto (migrations)
  S3_ENDPOINT           -> URL da API do MinIO
  S3_PUBLIC_HOST        -> host público dos objetos (storage.evoiatecnologia)
  S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY
  AUTH_SECRET           -> manter o atual
E um checklist final (backup testado? 5432 fechado? fail2ban ativo? CORS ok? TLS ok?).

NÃO edite nenhum arquivo de código neste bloco — é só infra. Ao fim, registre a sessão em docs/sessoes/
com o que foi provisionado (SEM colar segredos no doc — só os nomes das chaves).
```

### Bloco 2 — Trocar driver e storage no código (Fases 2, 3, 4b) · esteira dev-agents

```text
Migração de infra do Carrossel Studio — Bloco 2 (código). Leia docs/adr/0002-migracao-vps-easypanel.md
INTEIRO antes de agir, e docs/STATUS.md. Pré-requisito: Bloco 1 concluído — a infra na VPS está no ar e
o .env.local tem as chaves DATABASE_URL, DATABASE_URL_UNPOOLED e S3_* preenchidas.

PRÉ-REQUISITO (confirme antes; se faltar QUALQUER uma, PARE e avise):
- .env.local com DATABASE_URL (PgBouncer, transaction) e DATABASE_URL_UNPOOLED (5432 direto).
- .env.local com S3_ENDPOINT, S3_PUBLIC_HOST, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY.
- CA/cert do TLS do Postgres disponível para o client pg (se não for de CA pública).

Conduza pela esteira dev-agents (skill dev-agents:feature), parando nos gates (spec → validação).
Trate como refactor de infra num único PR. Aplique dev-agents:seguranca-baseline no upload. Faça em
DOIS ESTÁGIOS, rodando os testes ao fim de cada um antes de seguir.

ESTÁGIO A — Banco (Fases 2 e 3):
1. npm rm @neondatabase/serverless ws @types/ws ; npm i pg ; npm i -D @types/pg
2. Reescrever src/db/index.ts: pg.Pool sobre DATABASE_URL + drizzle-orm/node-postgres, com
   ssl { rejectUnauthorized: true, ca } e max conservador. Remover a config de WebSocket (ws/neonConfig).
   PRESERVAR db.transaction() (usado no saveCarousel) — critério de aceite.
3. drizzle.config.ts segue usando DATABASE_URL_UNPOOLED (só o valor muda no .env).
4. Recriar o schema na VPS: npm run db:migrate ; depois npm run db:seed.
5. Rodar npm run test + npm run build. Só siga pro Estágio B com tudo verde.

ESTÁGIO B — Storage (Fase 4b):
6. npm rm @vercel/blob ; npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
7. src/app/api/blob/upload/route.ts: trocar handleUpload do Blob por geração de presigned PUT.
   MANTER: exigência de sessão (401 sem login) e o reforço server de content-type/tamanho
   (ALLOWED_CONTENT_TYPES, MAX_IMAGE_BYTES) nas condições da presigned.
8. src/lib/blob-upload.ts: pedir a presigned URL ao handler, PUT direto no MinIO, devolver a URL pública
   final. PRESERVAR validateImageFile e o contrato UploadResult (union discriminada).
9. src/lib/export-png.ts (isAllowedBlobHost, ~linha 168): trocar o sufixo do Vercel Blob pelo host do
   MinIO (S3_PUBLIC_HOST = storage.evoiatecnologia). MANTER o match por sufixo de rótulo.
10. src/lib/env.ts: remover BLOB_READ_WRITE_TOKEN; adicionar as 6 vars S3_* com validação Zod.
11. Atualizar tests/export-safe-url.test.ts e tests/blob-upload-route.test.ts pro novo contrato.

Critérios de aceite (todos):
- npm run test (os ~250) e npm run build passam verdes.
- Nenhuma referência a @neondatabase/serverless, ws, neonConfig ou @vercel/blob sobra no código.
- db.transaction() continua funcional (o teste do saveCarousel prova).
- Upload sem sessão continua barrado (401); tipo/tamanho inválido continua rejeitado no server.

Ao fim: rode os testes, atualize docs/STATUS.md e docs/ROADMAP.md, registre a sessão em docs/sessoes/.
NÃO faça o deploy nem mexa nas envs da Vercel — isso é o Bloco 3.
```

### Bloco 3 — Cutover e smoke test (Fase 7) · conduzido

```text
Migração de infra do Carrossel Studio — Bloco 3 (cutover). Leia docs/adr/0002-migracao-vps-easypanel.md
INTEIRO antes de agir. Pré-requisito: Blocos 1 e 2 concluídos (infra no ar + código já usando pg/MinIO,
testes e build verdes). Você vai me CONDUZIR no corte — um passo por vez, eu executo, você valida.

PRÉ-REQUISITO (confirme comigo antes; se faltar, PARE):
- O PR do Bloco 2 está mergeado (ou pronto pra deploy) e o build passou.
- Eu tenho as credenciais atuais da Neon e do Vercel Blob guardadas (são o rollback).
- O subdomínio carrosselstudio.evoiatecnologia está configurado na Vercel (CNAME) ou pronto pra ser.

Conduza, um passo por vez:
1. Me guie a setar na Vercel (painel do projeto) as novas envs: DATABASE_URL, DATABASE_URL_UNPOOLED,
   S3_ENDPOINT, S3_PUBLIC_HOST, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, AUTH_SECRET.
   Confirmar que BLOB_READ_WRITE_TOKEN foi REMOVIDA. Configurar o domínio carrosselstudio.evoiatecnologia.
2. Garantir schema na VPS: db:migrate + db:seed já rodados (Bloco 2) — validar que as tabelas existem.
3. Disparar o deploy de produção na Vercel (a partir do repo GitHub).
4. SMOKE TEST manual (me diga exatamente o que fazer e o que observar):
   a) login funciona;
   b) criar um carrossel e salvar (prova o banco na VPS + db.transaction);
   c) upload de avatar e de imagem de slide (prova o MinIO + presigned PUT);
   d) exportar o PNG e confirmar que avatar e imagem RENDERIZAM na imagem (prova a nova allowlist).
5. Se algum passo falhar: me conduza no ROLLBACK — restaurar as envs antigas (Neon + Blob) na Vercel,
   redeploy da versão anterior ao Bloco 2, e me diga como confirmar que voltou ao ar.

Após o smoke test passar: me lembre de manter a conta Neon/Blob viva (free tier) por alguns dias antes
de desligar. Atualize docs/STATUS.md, docs/ROADMAP.md e o Status do ADR 0002 (Proposta -> Implementada),
e registre a sessão em docs/sessoes/.
```
