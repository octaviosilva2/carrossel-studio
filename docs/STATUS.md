# STATUS — Onde o projeto está

> **Ponto de entrada para uma nova sessão.** Leia este arquivo primeiro, depois o
> `CLAUDE.md` e `docs/VISAO.md`.

## Última atualização
2026-07-03 — **ADR 0003 (correções de segurança pós-auditoria) CONCLUÍDA.** CORS do MinIO
confirmado correto, headers HTTP de segurança adicionados, rate limit no login implementado
e validado. Detalhe abaixo (após ADR 0002).

## Concluído
- ✅ Visão do produto definida (`docs/VISAO.md`).
- ✅ Stack aprovada pelo CEO (`docs/adr/0001-stack-tecnica.md`).
- ✅ Fundação de governança criada (CLAUDE.md, docs, sessões).
- ✅ Restrições registradas (`docs/RESTRICOES.md` — Vercel Hobby).
- ✅ Playbook de venda/configuração de cliente (`docs/PLAYBOOK-CLIENTE.md`).
- ✅ Git + GitHub publicado em `octaviosilva2/carrossel-studio` (branch `main`).
- ✅ Roadmap de execução em 6 sessões (`docs/ROADMAP.md`).
- ✅ Prompt de abertura pronto por sessão (`docs/PROMPTS-SESSOES.md`).
- ✅ Referência visual do slide com tokens exatos (`docs/REFERENCIA-VISUAL.md`).
- ✅ Research da S1 concluído (`.work/s1-fundacao-render/`).
- ✅ **S1 — Fundação + Motor de render** (esteira dev-agents completa, validada):
  - Scaffold Next.js 15 (App Router, TS strict + `noUncheckedIndexedAccess`) + Tailwind + shadcn/ui.
  - Componente `<Slide>` (`src/components/slide/`) fiel a `REFERENCIA-VISUAL.md` — temas claro/escuro,
    selo azul `#1D9BF0` com check, imagem radius 28, header centralizado na vertical.
  - Export HTML→PNG no browser (`src/lib/export-png.ts`, `html-to-image`, `pixelRatio 1`) →
    **PNG exatamente 1080×1350**.
  - Rota de teste `/render-test` (4 cenários) + 4 PNGs reais em `tests/fixtures/`.
  - Testes: **15/15 verdes** (dimensão via `sharp` + contrato do componente). Build/type-check limpos.
- ✅ **S2 — Editor manual** (esteira dev-agents completa, validada — `.work/s2-editor-manual/`):
  - Rota `/editor` (Client Component + `useReducer` com reducer puro em `src/lib/editor-state.ts`).
  - Identidade única compartilhada + tema global + slides `{id, body, imageUrl?}`; add/remover/
    reordenar (↑/↓)/navegar; upload local (`FileReader → data-URL`, validação tipo + 6 MB).
  - Preview ao vivo reusando o `<Slide>` da S1 escalado por `transform: scale()` — contrato
    `SlideData` intocado (composição via `toSlideData`). shadcn: `input/textarea/label/switch`.
  - Testes: **70/70 verdes** (55 novos S2 + 15 da S1, sem regressão). Build/type-check limpos.
- ✅ **S3 — Persistência + Auth + Storage** (esteira dev-agents completa, validada — `.work/s3-persistencia-auth-storage/`):
  - **Auth.js v5 (Credentials + JWT)**: login por senha (`bcryptjs` cost 12), `session.user.id`,
    `requireUser()` no server (`src/auth.ts`, `src/lib/auth-guard.ts`). Sem signup público.
    **Decisão de gate:** sessão **JWT**, não database — Credentials + database session é incompatível
    no Auth.js v5. Usuário/senha no Postgres; sessão stateless assinada com `AUTH_SECRET`.
  - **Drizzle + Neon (Postgres 18)**: schema `users/clients/carousels/slides` (`src/db/schema.ts`),
    migration versionada aplicada no Neon, seed idempotente (`scripts/seed.mjs` → admin + 1 client
    "Sua Marca"). Identidade **fixa por cliente com override por carrossel** (campo nulo herda).
  - **Vercel Blob (client upload)**: `/api/blob/upload` com sessão obrigatória + reforço server de
    tipo e 6 MB; avatar e imagens de slide viram URL https. Smoke real put→GET 200→del: PASS.
  - **Persistência ligada ao editor**: server actions (`createCarousel/saveCarousel/listCarousels/
    getCarousel/deleteCarousel`), todas com Zod nas bordas e authz por dono (`AND ownerId`) em
    toda query. `/login`, `/carousels` (lista do dono), editor com Título + Salvar (salvando→salvo→
    erro), reabrir por `id`, reordenação persistida (replace-all em transação).
  - Testes: **137/137 verdes** (70 S2 + 67 novos). Type-check + build limpos. Segurança sem furos.
  - **Ressalva (verificação manual pendente):** 10 ACs de runtime (login/save/reabrir/upload
    fim-a-fim **no navegador**) — roteiro de smoke em `.work/s3-persistencia-auth-storage/validation.md`.
- ✅ **S4 — Export** (esteira dev-agents completa, validada — `.work/s4-export/`):
  - **Todos os slides → PNGs 1080×1350 → ZIP** + download individual do slide selecionado. Tudo
    client-side, gatilho só no `/editor` (carrossel aberto). Sem 2×: nó já é 1080×1350 físico,
    `pixelRatio: 1` = nitidez máxima na resolução-alvo do Instagram.
  - `src/lib/export-png.ts` (aditivo, `renderSlideToPng` intacto): `renderSlidesToPngs` (captura
    sequencial), `exportCarouselToZip` (**jszip** → Blob → download), `triggerBlobDownload`
    (objectURL), `toExportSafeUrl`/`toSlideDataForExport` (imagem cross-origin do Blob → **data-URL
    antes do canvas**, resolvendo o tainted canvas herdado da S3 SEM tocar o `<Slide>`), e helpers de
    nomeação (`slidePngName` zero-pad `slide-01.png`, `slugifyTitle`, `zipFileName` → `<titulo>.zip`
    ou `carrossel.zip`).
  - Componente `src/app/editor/export-capture.tsx`: monta os N `<Slide>` 1080×1350 reais off-screen
    sob demanda no clique. Dois botões no header do editor (Baixar ZIP / Baixar slide) com estados
    idle/working/done/error + `aria-live`; desabilitados com 0 slides ou durante export.
  - **Decisão de gate:** imagem do Blob via **fetch direto** (YAGNI); proxy same-origin
    `/api/blob/proxy` fica desenhado como plano B NÃO implementado (só se o CORS do CDN reprovar).
  - Testes: **171/171 verdes** (137 baseline + 34 novos: naming + ZIP + `toExportSafeUrl`), 1 skip
    (guardião dimensional multi-slide, aguarda fixture de browser). Type-check + build limpos.
  - **Ressalva (verificação manual pendente):** 2 provas que só o navegador dá — (a) fixture
    multi-slide 1080×1350 (`GEN_MULTI=1 EDITOR_URL=<...> npm run gen:fixtures` + re-rodar testes);
    (b) pixel da imagem do Blob renderizada + confirmação de CORS do CDN. Roteiro em
    `.work/s4-export/validation.md`.
  - **Endurecimento sugerido (🟡, não bloqueia):** allowlist de host em `toExportSafeUrl` (aceitar só
    `*.public.blob.vercel-storage.com` + same-origin).

## Como logar (primeiro acesso — done-for-you)
- Rodar `npm run dev`, abrir `/login`. Credenciais do admin estão em `.env.local`
  (`SEED_ADMIN_EMAIL` = octaviokcs@gmail.com, `SEED_ADMIN_PASSWORD`). Trocar a senha depois se quiser
  (reset por e-mail é pós-S3).

## S5 — Geração com IA (CONCLUÍDA 2026-07-02)
Esteira dev-agents completa e validada (`.work/s5-geracao-ia/`). Entrega:
- **Tela de intenção** em `/generate` (client component): textarea com validação de borda igual ao
  `GenerateInputSchema` (10..1000), estados idle/gerando/erro/sucesso com `aria-live`, botão
  desabilitado durante geração/input inválido, link em `/carousels`.
- **Server action `generateCarousel`** (`src/lib/actions/generate.ts`, padrão S3: `requireUser()` +
  Zod na borda): chama a Claude API com o modelo **`claude-sonnet-4-6`** (decisão do CEO),
  `thinking:{type:"adaptive"}`, sem streaming/temperature, `max_tokens:16000`, checando
  `stop_reason:"refusal"`. **Structured output** via `zodOutputFormat` (`@anthropic-ai/sdk` — helper
  compatível com zod v4, sem fallback). Regras visuais no **system**; intenção do usuário só na
  mensagem **user** (proteção contra prompt injection).
- **Defesa em 3 camadas** contra JSON ruim/emojis/violação visual: schema na API → Zod nosso
  (`GeneratedCarouselSchema`) → sanitização (`src/lib/generate-sanitize.ts`: remove emoji/markdown,
  normaliza parágrafos). **AC-5** = dica textual de imagem no `body` do slide, sem preencher
  `imageUrl` nem tocar o contrato `SlideData`/reducer da S2.
- **Aterrissagem:** `createGeneratedCarousel` (transação, N slides, `ownerId` da sessão) → carrossel
  **novo** → `redirect("/editor?id=…")`. Authz por dono na action e na query.
- **Chave lazy:** `env.ts` intacto; app sobe sem `ANTHROPIC_API_KEY`; ausência vira erro tratável
  `NOT_CONFIGURED` (nunca vaza o valor). Sem cota nesta fatia.
- Fronteira Anthropic isolada em `src/lib/claude.ts` (injetável, mockável).
- **Testes: 230 passed / 1 skip (herdado S1) / 0 falha** (67 novos em `tests/generate/`).
  Type-check + build limpos. Validador: 10/10 ACs, sem achados de segurança.
- **Ressalva (verificação manual pendente):** prova fim-a-fim real — chamada verdadeira à Claude API
  no navegador (intenção → slides → editor). Nenhum teste toca a API real (mocking da fronteira).
- **Endurecimento sugerido (🟢, não bloqueia):** cota por usuário (fatia futura) e faixa de emoji
  não exaustiva na sanitização.

## S6 — Multi-cliente + hardening (CONCLUÍDA 2026-07-02, deploy adiado)
Esteira conduzida com research pulado (código já mapeado). Gates: triagem de escopo
(3 decisões YAGNI) + aprovação de story/spec (`.work/s6-multicliente-deploy/`). Entrega:
- **Config de identidade padrão** — tela `/settings` (Server + Client Component) editando
  o `client` do dono (nome, handle, avatar via Blob, selo, tema padrão). Backend
  `getClientSettings`/`updateClientSettings` (`src/lib/actions/settings.ts`), padrão S3:
  `requireUser()` + Zod na borda + `UPDATE clients WHERE id AND ownerId`. `getDefaultClient`
  extraído para `src/lib/client-repo.ts` (reuso por carousels.ts e settings.ts). Carrossel
  novo herda a identidade padrão (overrides null herdam do client atualizado).
- **Isolamento de dados** — auditado: toda query filtra por `ownerId`, sem IDOR. Já era
  sólido desde a S3; a superfície nova segue o mesmo padrão.
- **Hardening + análise de segurança** — skill `analise-seguranca` rodada
  (`.work/s6-multicliente-deploy/security-review.md`): **0 achado 🔴/🟡**, 1 🟢 (avatarUrl
  aceita https arbitrário — não explorável, fatia futura). Endurecimento aplicado:
  `toExportSafeUrl` com allowlist de host (`isAllowedBlobHost`, só
  `*.public.blob.vercel-storage.com`).
- **Provisionamento por script** — `npm run client:create` (`scripts/create-client.mjs`):
  cria conta de cliente (user + identidade), idempotente por e-mail, bcrypt 12, nunca
  imprime senha. `.env.example` atualizado com as vars.
- **Fonte embarcada (follow-up crítico RESOLVIDO)** — Selawik Regular/Bold woff2 (SIL
  **OFL 1.1**, `src/fonts/`) via `next/font/local` (`src/app/fonts.ts`), var
  `--font-selawik` no `<html>`, `SLIDE_FONT_STACK` = Segoe UI → Selawik embarcada →
  system-ui. Fidelidade métrica do PNG garantida no Linux da Vercel.
- **Testes: 250 passed / 1 skip (herdado S1) / 0 falha** (+20 novos: settings 11,
  export-safe-url 9). Type-check + build de produção limpos.

**Decisão do CEO no fim da sessão:** deploy adiado ("não iremos dar deploy ainda"). O
guia `docs/DEPLOY.md` foi cancelado; quando for deployar, ver as pendências abaixo.

## ADR 0002 — Migração de infra Neon/Vercel Blob → VPS Hostinger (EasyPanel)
Decisão do CEO: sair de serviços gerenciados (Neon, Vercel Blob) pra rodar banco e storage
self-hosted na VPS já paga. App continua na Vercel. Ver `docs/adr/0002-migracao-vps-easypanel.md`.

- ✅ **Bloco 1 — Infra na VPS** (2026-07-02, conduzido, sem código): Postgres 17 + PgBouncer
  (TLS, backup testado, usuário sem superuser) e MinIO (bucket público, CORS, TLS via Traefik)
  provisionados no EasyPanel. Firewall (UFW) + fail2ban ativos, só 6432/443/22 expostos.
  Detalhe: `docs/sessoes/2026-07-02-adr0002-bloco1-infra-vps.md`.
- ✅ **Bloco 2 — Código** (2026-07-02, esteira dev-agents, validado): driver de banco trocado
  (`@neondatabase/serverless` → `pg` + `drizzle-orm/node-postgres`, `db.transaction()`
  preservado) e storage trocado (Vercel Blob → MinIO via presigned PUT, contrato
  `UploadResult` intacto). TLS com CA pinado (certificado self-signed sem SAN — **dois CAs
  distintos**, um para o PgBouncer/runtime e outro pro Postgres direto/migrations, achado
  durante a implementação). `db:migrate` + `db:seed` rodados contra a VPS real. **269 testes
  verdes**, build limpo, validação independente sem achado de segurança. Detalhe:
  `docs/sessoes/2026-07-02-adr0002-bloco2-codigo.md`.
- ✅ **Bloco 3 — Cutover** (2026-07-03, conduzido): env vars na Vercel (+ `DB_CA_CERT`,
  achado durante o bloco — ver abaixo), Framework Preset corrigido pra Next.js (projeto
  Vercel tinha sido criado antes de existir `package.json` no repo), deploy de produção,
  domínio `carrosselstudio.evoiatecnologia.com` no ar. Smoke test completo (login, criar+
  salvar carrossel, upload de avatar/imagem no MinIO, export PNG com avatar/imagem
  renderizados) — **PASS em todos os passos**. Detalhe:
  `docs/sessoes/2026-07-03-adr0002-bloco3-cutover.md`.

## ADR 0003 — Correções de segurança para o MVP (CONCLUÍDA 2026-07-03)
Origem: auditoria de segurança (`dev-agents:analise-seguranca`) rodada logo após o cutover
da ADR 0002, produto já em produção. Ver `docs/adr/0003-correcoes-seguranca-mvp.md`.

- ✅ **CORS do MinIO** (conduzido, sem código): `MINIO_API_CORS_ALLOW_ORIGIN` confirmado no
  EasyPanel já em `https://carrosselstudio.evoiatecnologia.com` — nenhuma correção
  necessária.
- ✅ **Headers de segurança HTTP**: `next.config.mjs` com `headers()` para todas as rotas
  (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`, sem preload). Commit
  `a4528c5`.
- ✅ **Rate limit no login** (esteira `dev-agents:feature` completa — `.work/rate-limit-login/`):
  tabela nova `login_attempts` (Postgres via Drizzle, migration aditiva não destrutiva,
  aplicada na VPS de produção), bloqueio temporário por **e-mail e por IP** a partir de 5
  falhas em 15 minutos (janela deslizante), decisão puramente no Postgres (sem
  Redis/Upstash). Lógica de decisão isolada em `src/lib/rate-limit.ts` (pura, testada);
  I/O em `src/lib/login-attempts-repo.ts` (fail-closed na checagem, best-effort na
  gravação/limpeza). Reset das falhas do e-mail no `authorize` (`src/auth.ts`) após senha
  confirmada — único ponto que sabe que o login deu certo. Mensagem de erro sempre genérica
  ("E-mail ou senha inválidos"), idêntica em todos os casos de recusa (anti-enumeração).
  **296 testes passando** (271 baseline + 25 novos), type-check e build limpos. Validação
  independente: aprovado, sem achado 🔴 (duas ressalvas 🟡/🟢 — timing side-channel do
  bloqueio e ESLint não configurado no projeto — registradas como endurecimento futuro, não
  bloqueiam).

### Achados do Bloco 3 (fora do escopo original do ADR)
- **Código nunca tinha sido commitado no Git** — só a documentação estava versionada; todo
  o código de S1–S6 e do Bloco 2 (`src/`, `package.json`, testes etc.) ficou 3 dias como
  untracked local. Corrigido: commit + push pra `main` antes do cutover (269 testes
  verdes, build limpo, confirmados antes de commitar).
- **CA pinado do Postgres não sobrevive a deploy serverless** — `src/db/index.ts` lia
  `certs/db-ca.pem`, arquivo local fora do git (`.gitignore`), inexistente no ambiente da
  Vercel. Corrigido com um fix pequeno e isolado: `DB_CA_CERT` (env var com o conteúdo do
  PEM), com fallback pro arquivo local em dev — validado localmente (conexão real TLS
  contra a VPS) antes de ir pra produção. Ver `src/lib/env.ts` e `src/db/index.ts`.

## Próximo passo
- **Manter Neon e Vercel Blob vivos (free tier) por alguns dias** antes de desligar —
  são o rollback do cutover. Só desligar depois de confiar no novo ambiente sob uso real.
- **Smokes manuais** herdados de S3/S4/S5/S6 ainda não cobertos pelo smoke do Bloco 3:
  geração via `/generate` (chamada real à Claude API), herança de identidade em
  `/settings`.
- **Deploy (quando o CEO decidir):** decisão Hobby→Pro antes do 1º cliente pagante
  (`docs/RESTRICOES.md`).
- Limpar `tsconfig.tsbuildinfo` do controle de versão (artefato de build commitado por
  engano no Bloco 3) — adicionar ao `.gitignore` e remover do índice.
- **Deferido da ADR 0003 (§4, não bloqueia o MVP):** validação de magic bytes no upload de
  imagem; `avatarUrl` aceitando qualquer HTTPS externo; comentário desatualizado em
  `carousels.ts:244` citando "Neon serverless". Também deferidos da própria validação do
  rate limit (🟡/🟢, não bloqueiam): timing side-channel do bloqueio de login; ESLint ainda
  não configurado no projeto.

## Pendências do CEO (necessárias só na implementação)
- ✅ Chave **Claude API** (Anthropic, billing ativo) — configurada e em uso (S5).
- ✅ **PostgreSQL** — migrado de Neon pra self-hosted na VPS (ADR 0002, Blocos 1+2).
- ✅ **Storage** — migrado de Vercel Blob pra MinIO self-hosted na VPS (ADR 0002, Blocos 1+2).
- Decidir upgrade **Vercel Pro** antes do primeiro cliente pagante em produção.
- ✅ Follow-up crítico herdado da S1: fonte woff2 embarcada (Selawik OFL, S6).

## Decisões em aberto
- ✅ Render: **HTML → PNG no browser** (decidido na Sessão 02, provado na S1).
- ✅ Fonte do slide: `'Segoe UI', var(--font-selawik), 'Selawik', system-ui, …`. No Windows
  usa a Segoe UI real (fidelidade máxima); a **Selawik woff2 embarcada** (`next/font/local`,
  S6) cobre o Linux da Vercel. Follow-up crítico RESOLVIDO.
- Valores de **setup/mensalidade/cota** — decisão de negócio do CEO.
