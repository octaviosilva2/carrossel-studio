# Sessão S3 — Persistência + Auth + Storage — 2026-07-01

## Objetivo
Transformar o editor em memória (S2) numa ferramenta de trabalho real: login por senha, carrosséis
salvos no banco por dono, imagens reais em storage. Quatro entregas: Auth.js (login por senha),
Drizzle + schema no Neon, upload real no Vercel Blob, salvar/listar/reabrir ligando o editor à
persistência. Conduzida pela esteira `dev-agents`.

## Como foi conduzido
- Esteira completa: research (01) → story (02, GATE 1) → spec (03, GATE 2) → backend (04) →
  frontend (05) → testes (06) → validação independente (07, GATE 3).
- Estado do pipeline em `.work/s3-persistencia-auth-storage/` (research, story, spec, *-notes, validation, STATUS).
- **Provisionamento de infra pelo CEO** no início (guiado): projeto Neon `carrossel-studio` (Postgres 18,
  us-east) e Vercel Blob store `carrossel-studio-blob` (público). Segredos em `.env.local` (git-ignored);
  conexão ao Neon validada antes de começar.
- CEO decidiu os pontos de negócio nos gates e depois **delegou** atravessar os gates seguintes com as
  opções recomendadas e concluir a S3 (modo autônomo a partir da spec).

## Decisões-chave
### Negócio (CEO)
- **Acesso:** só admin (Octavio) nesta fase — 1 usuário real, mas schema e queries já filtram por dono
  (prep S6). Sem signup público.
- **Contas:** criadas por **script/seed** (`npm run db:seed`), senha hasheada. Sem tela de cadastro.
- **Identidade da marca:** **fixa por cliente com override por carrossel** — o `client` guarda o padrão;
  o `carousel` sobrescreve campos pontualmente; campo nulo herda do cliente.
- **Título** do carrossel: sim. **Estado:** só timestamps (sem campo status). **Seed:** admin + 1 client
  placeholder editável.

### Técnica (CTO)
- **Sessão JWT, não database** (GATE 2). Auth.js v5 com Credentials **não suporta sessão no banco**
  (limitação oficial). Usuário/senha ficam no Postgres; a sessão é um JWT stateless assinado com
  `AUTH_SECRET`. Simplificou o schema (dispensou `@auth/drizzle-adapter` e tabelas accounts/sessions).
- **bcryptjs** (cost 12) — roda em serverless sem build nativo. Runtime **Node** nas rotas de auth.
- **Driver Neon serverless** (Pool + `ws`) para transações no app; conexão **direta** só nas migrations.
- **Upload client** no Blob (`@vercel/blob/client`), sem o teto de 4,5 MB do server upload; validação de
  tipo + 6 MB reforçada no server (`onBeforeGenerateToken`).
- **Export/CORS (S4):** decidido converter a imagem do Blob → data-URL antes do canvas. **Não** implementado
  aqui; só registrado para não quebrar o export da S4.

## Arquitetura / arquivos
- **Dados:** `src/db/schema.ts` (users, clients, carousels, slides — FKs, índices, unique(carouselId,position),
  overrides nullable), `src/db/index.ts` (Drizzle + Neon Pool), `drizzle.config.ts`, `drizzle/0000_*.sql`.
- **Auth:** `src/auth.ts`, `src/types/next-auth.d.ts`, `src/app/api/auth/[...nextauth]/route.ts`,
  `src/lib/auth-guard.ts` (`requireUser()`).
- **Núcleo puro:** `src/lib/carousel-mapping.ts` (resolveIdentity, identityToOverride que **não materializa**
  herdados, rowToEditorState ordenando por position, slidesToRows).
- **Server actions:** `src/lib/actions/auth.ts`, `src/lib/actions/carousels.ts`
  (create/save/list/get/delete — `requireUser` + Zod + `AND ownerId` em toda query; save em transação
  replace-all). Schema/tipos em `src/lib/actions/carousel-types.ts` (separado por regra do Next `"use server"`).
- **Upload:** `src/app/api/blob/upload/route.ts`, `src/lib/blob-upload.ts`.
- **UI:** `src/app/login/*`, `src/app/carousels/*`, `src/app/editor/*` (wrapper server + `editor-client.tsx`
  com Título/Salvar, upload real em identity-panel/slide-editor), `src/app/page.tsx` (redirect → /carousels).
- **Infra:** `src/lib/env.ts` (Zod nas env vars), `scripts/seed.mjs`, `.env.example`.
- **Ampliação aditiva:** `src/lib/editor-state.ts` (`carouselId?`, `title?`, action `SET_TITLE`) — sem
  quebrar os 70 testes da S2.
- **Intocado:** `src/components/slide/*` (contrato `SlideData`) e `src/lib/export-png.ts`.

## Resultado da validação (estágio 07 — auditor independente)
- `npm run type-check`: **limpo**. `npm run build`: **compilou** (8 rotas).
- `npx vitest run`: **137/137** (70 da S2 sem regressão + 67 novos da S3).
- **24 critérios de aceite:** 14 ATENDEM plenos + 10 ATENDEM com **verificação manual pendente**
  (runtime real no navegador).
- **Segurança sem furos:** SQL parametrizado, `ownerId` da sessão em toda query (não vaza existência via
  `notFound`), erros de login genéricos, bcrypt cost 12, `.env.local` fora do git, `.env.example` sem valores.
- **Veredito: APROVAR COM RESSALVAS** (smoke manual dos 10 ACs de runtime).
- **Smoke real de infra além da suíte:** conexão Neon OK; migration + seed aplicados no Neon; upload no
  Vercel Blob put→GET 200→del **PASS** (token ponta a ponta).

## Pendente para o Octavio — roteiro de smoke manual (fecha os 10 ACs de runtime)
Rodar `npm run dev` e, no navegador:
1. `/login` com `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` do `.env.local` → cai em `/carousels`.
2. Senha errada → erro genérico, sem logar. Acessar `/editor` deslogado → volta pro login.
3. "Novo carrossel" → editor abre com identidade herdada do client. Editar título/texto, subir avatar e
   imagem de slide (vira URL do Blob), reordenar, **Salvar** (salvando→salvo).
4. Voltar a `/carousels`, **reabrir** → identidade/tema/slides e a **ordem** vêm como salvos.
5. Sair → sessão encerrada. (Detalhes em `.work/s3-persistencia-auth-storage/validation.md`.)

## Follow-ups / notas (fora do escopo S3)
- **Fonte woff2 não embarcada** (herdado S1) — pré-deploy Linux.
- **ESLint** ainda `ignoreDuringBuilds: true`.
- **Export/CORS** — converter Blob → data-URL antes do canvas: implementar na **S4**.
- Reset/troca de senha por e-mail (Resend) — pós-S3.
- Sessão JWT não tem revogação server-side (aceitável com 1 admin) — revisar em multi-cliente (S6).

## Próximo passo
Sessão 4 — Export (todos os slides → PNGs → download ZIP). Não depende do CEO. Antes, rodar o smoke
manual acima. Prompt em `docs/PROMPTS-SESSOES.md`.
