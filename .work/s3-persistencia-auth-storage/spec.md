# Spec — S3: Persistência + Auth + Storage

> Estágio 03 do pipeline dev-agents. Desenha o **como**. Baseado em `research.md` + `story.md`
> + decisões do STATUS. Aplica gate-de-simplicidade (YAGNI), segurança-baseline, migrations-seguras.
> **Ponto de gate humano ao fim.**

---

## 0. Decisão que precisa do CEO (conflito descoberto no desenho)

**Login por senha (Auth.js Credentials) + sessão no banco não são compatíveis.** A documentação
oficial do Auth.js v5 afirma: *o provider Credentials só funciona com sessão via **JWT**; usuários
autenticados por Credentials **não são persistidos na tabela de sessão**.* A story (AC 4) dizia
"strategy database". Isso é inviável com a stack aprovada (ADR: Auth.js + senha). Opções:

- **Opção A — Sessão JWT (RECOMENDADA).** Sessão num cookie assinado com `AUTH_SECRET` (HS256).
  O **usuário e a senha (hash) ficam no Postgres**; a sessão é stateless. Proteção via `auth()` no
  server. É o caminho oficial e mais simples para login por senha. Simplifica o schema (dispensa
  `accounts`/`sessions`/`verificationTokens` e o `@auth/drizzle-adapter`).
  - Custo: "logout" limpa o cookie (não há revogação server-side de sessão; aceitável — 1 admin).
- **Opção B — Sessão database com workaround.** Manter tabela `sessions` e forjar a criação da
  sessão manualmente nos callbacks `jwt`/`session`. Frágil, mais código de segurança sensível,
  contraria YAGNI. **Não recomendo.**

**Esta spec assume a Opção A.** Se o CEO exigir sessão no banco literal, reabrimos o desenho de auth.

O resto das decisões técnicas do STATUS segue: **bcryptjs**, driver **Neon serverless**, migrations
por conexão direta, upload **client** no Blob, Zod nas bordas, authz por dono, sem middleware Edge.

---

## 1. Modelo de dados (Drizzle + Postgres/Neon)

Arquivo: `src/db/schema.ts`. Todas as PKs são `uuid` (`defaultRandom()`). Timestamps `timestamptz`.

### `users` — quem loga (só admin nesta fase)
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | defaultRandom |
| email | text | **unique**, not null |
| passwordHash | text | not null (bcryptjs) |
| name | text | null |
| createdAt | timestamptz | default now() |

Sem `role` (YAGNI — só admin agora; papéis são S6).

### `clients` — identidade padrão da marca (dono = user)
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| ownerId | uuid FK→users.id | not null, onDelete cascade, **index** |
| name | text | not null |
| handle | text | not null (sem "@") |
| avatarUrl | text | not null (placeholder do seed) |
| verified | boolean | not null default false |
| theme | text | not null default 'light' (`'light'\|'dark'`) |
| createdAt / updatedAt | timestamptz | default now() |

### `carousels` — o carrossel (dono = user, marca = client, override opcional)
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| ownerId | uuid FK→users.id | not null, onDelete cascade, **index** |
| clientId | uuid FK→clients.id | not null, onDelete restrict, **index** |
| title | text | not null (default 'Carrossel sem título' na criação) |
| overrideName | text | **null = herda do client** |
| overrideHandle | text | null = herda |
| overrideAvatarUrl | text | null = herda |
| overrideVerified | boolean | null = herda |
| overrideTheme | text | null = herda (`'light'\|'dark'`) |
| createdAt / updatedAt | timestamptz | default now() |

### `slides` — conteúdo ordenado (dono = via carousel)
| coluna | tipo | regra |
|---|---|---|
| id | uuid PK | |
| carouselId | uuid FK→carousels.id | not null, onDelete cascade, **index** |
| position | integer | not null (0-based, ordem no editor) |
| body | text | not null default '' |
| imageUrl | text | null (URL https do Blob) |

`unique(carouselId, position)`. Reordenação persistida por replace-all (ver §2.4).

**Migrations (migrations-seguras):** banco vazio → migration inicial única via `drizzle-kit generate`
+ `migrate`. Sem downtime/backfill (não há dados). `drizzle.config.ts`: dialect `postgresql`,
`schema: './src/db/schema.ts'`, `out: './drizzle'`, `dbCredentials.url = DATABASE_URL_UNPOOLED`
(conexão direta — migrations não usam pooler).

---

## 2. Contratos de API

**Decisão server actions × route handlers (gate-de-simplicidade):** CRUD de carrossel = **server
actions** (type-safe, sem boilerplate de fetch, padrão Next 15). Upload do Blob = **route handler**
(exigência do `@vercel/blob/client`). Auth = handler gerado pelo Auth.js + actions finas.

Toda action/handler: (1) `requireUser()` primeiro, (2) valida entrada com **Zod**, (3) filtra/injeta
`ownerId` da sessão — **nunca** confia em id/dono vindo do client.

### Auth
- `POST /api/auth/[...nextauth]` — handler do Auth.js (`src/app/api/auth/[...nextauth]/route.ts`).
- `signInAction(formData)` — server action: Zod `{email, password}` → `signIn('credentials', ...)`.
  Erro → retorna `{ error: 'E-mail ou senha inválidos' }` (genérico, AC 2). Sucesso → redirect.
- `signOutAction()` — server action → `signOut()`.

### Carrosséis (server actions em `src/lib/actions/carousels.ts`)
| Ação | Assinatura | Input (Zod) | Saída | Authz |
|---|---|---|---|---|
| criar | `createCarousel()` | — | `{ id }` (novo, herdando client padrão) | ownerId=sessão; usa 1º client do dono |
| salvar | `saveCarousel(input)` | `SaveCarouselSchema` (id, title, theme, identity, slides[]) | `{ ok, updatedAt }` | `carousels WHERE id AND ownerId` |
| listar | `listCarousels()` | — | `CarouselListItem[]` (id, title, updatedAt) | `WHERE ownerId` |
| obter | `getCarousel(id)` | `uuid` | `EditorInitialState` \| notFound | `WHERE id AND ownerId` |
| deletar | `deleteCarousel(id)` | `uuid` | `{ ok }` | `WHERE id AND ownerId` |

`SaveCarouselSchema` (Zod): `id: uuid`, `title: string.min(1).max(120)`, `theme: enum(light,dark)`,
`identity: { name, handle, avatarUrl(url), verified }`, `slides: array({ body: string.max(...),
imageUrl: url.optional() }).min(1)`. Rejeição → erro sem efeito colateral (AC 22).

Erros: not-found/dono errado → `notFound()` (404) ou retorno `{ error }` — **nunca** vaza dado alheio
(AC 23, edge "carrossel de outro dono").

### Upload Blob — `src/app/api/blob/upload/route.ts`
`POST` com `handleUpload` do `@vercel/blob/client`. `onBeforeGenerateToken`:
1. `requireUser()` — sem sessão → 401 (só logado gera token).
2. `allowedContentTypes: ['image/png','image/jpeg','image/webp']`.
3. `maximumSizeInBytes: MAX_IMAGE_BYTES` (6 MB, reusa `src/lib/image-upload.ts:6`) — reforço server (AC 14).
Client usa `upload()` de `@vercel/blob/client` apontando pra essa rota; recebe URL https → guarda no estado.

### `saveCarousel` — transação (§2.4)
Salvar é atômico: numa transação (driver Neon serverless suporta), `UPDATE carousels` (title +
overrides + updatedAt) → `DELETE FROM slides WHERE carouselId` → `INSERT` dos slides na ordem atual
com `position = índice`. Replace-all resolve reordenação sem diff (AC 17). Simplicidade > upsert.

---

## 3. Auth (Auth.js v5, Opção A — JWT)

- `src/auth.ts` — `NextAuth({...})`: provider **Credentials** (`email`, `password`).
  `authorize`: Zod valida → busca `users WHERE email` → `bcrypt.compare(password, passwordHash)` →
  retorna `{ id, email, name }` ou `null`. `session.strategy = 'jwt'`. Callbacks: `jwt` injeta
  `token.uid = user.id`; `session` expõe `session.user.id = token.uid`. `pages.signIn = '/login'`.
  Runtime **Node** (bcrypt não roda em Edge). **Sem** `@auth/drizzle-adapter** (não é preciso com
  Credentials+JWT — simplificação).
- `src/lib/auth-guard.ts` — `requireUser()`: `const s = await auth(); if(!s?.user) redirect('/login');
  return s.user;`. Usado em toda página protegida e no topo de cada action.
- **Seed** — `scripts/seed.mjs` (Node, fora do type-check): lê `SEED_ADMIN_EMAIL` e
  `SEED_ADMIN_PASSWORD` de env (**nunca** hardcoded; se ausentes, aborta). Cria: 1 `user` admin
  (senha `bcrypt.hash`) + 1 `client` padrão com identidade **placeholder editável**
  (name "Sua Marca", handle "suamarca", avatarUrl = placeholder same-origin, verified false,
  theme light). Idempotente (skip se email já existe). Script: `"db:seed": "node scripts/seed.mjs"`.

---

## 4. Frontend

- **`/login`** (`src/app/login/page.tsx`) — Server Component: se `auth()` já logado → redirect
  `/carousels`. Renderiza `login-form.tsx` (Client): campos email/senha (shadcn input/label/button),
  chama `signInAction`, mostra erro genérico inline, estado de submitting.
- **`/carousels`** (`src/app/carousels/page.tsx`) — Server Component: `requireUser()` +
  `listCarousels()`. Lista só os do dono (title + updatedAt), link → `/editor?id=`, botão "Novo"
  (chama `createCarousel` → redirect pro editor), botão sair (`signOutAction`). Vazio → CTA "criar".
- **`/editor`** (modificado, `src/app/editor/page.tsx`) — Server Component wrapper lê `?id=`:
  - com id → `getCarousel(id)` (404 se não for do dono) → passa `initialState` ao Client atual.
  - sem id → redireciona pra `createCarousel` (ou usa `initialState` da S2 e cria ao salvar 1ª vez, AC 20).
  - Client ganha: botão **Salvar** (chama `saveCarousel`, estado salvando→salvo→erro, AC 16), campo
    **título**, e remove o texto "Nada é salvo nesta fatia" (AC 21). `useReducer` intacto (S2).
- **Upload real** — `identity-panel.tsx` e `slide-editor.tsx`: handlers trocam `readFileAsDataUrl`
  por: `validateImageFile` (client) → `upload()` no Blob → guarda URL https no estado (via action
  existente do reducer). Preview otimista opcional. `<Slide>`/`SlideData` **intactos** (AC 11).
- **Provider:** ler sessão só em Server Components via `auth()` → **sem** `SessionProvider` no layout
  (YAGNI). `src/app/layout.tsx` inalterado exceto se precisar redirect raiz.
- **`/`** — redireciona pra `/carousels` (ou `/login` se deslogado).

### Adaptador row↔EditorState (`src/lib/carousel-mapping.ts`) — coração testável
- `resolveIdentity(client, carousel)` → `CarouselIdentity` (override ?? client, por campo).
- `resolveTheme(client, carousel)` → `carousel.overrideTheme ?? client.theme`.
- `rowToEditorState(client, carousel, slides[])` → `EditorState` (identidade/tema resolvidos,
  slides ordenados por `position` → `{id, body, imageUrl}`, `selectedSlideId` = 1º).
- `identityToOverride(identity, client)` → override por campo = `identity.f === client.f ? null : identity.f`
  (**não materializa herdados** — edge "override parcial"; se client mudar, herdados acompanham).
- `slidesToRows(slides[])` → `[{position, body, imageUrl}]` na ordem do array.
Funções **puras**, sem I/O — testáveis em jsdom sem banco.

---

## 5. Arquivos a tocar

**Novos**
- `src/db/schema.ts` — tabelas Drizzle. `src/db/index.ts` — client Drizzle (Neon serverless Pool).
- `drizzle.config.ts` — config drizzle-kit. `drizzle/` — migrations geradas.
- `src/auth.ts` — Auth.js. `src/app/api/auth/[...nextauth]/route.ts` — handler.
- `src/lib/auth-guard.ts` — `requireUser`. `src/lib/env.ts` — validação Zod das 4 env vars.
- `src/lib/actions/auth.ts` — signIn/signOut actions. `src/lib/actions/carousels.ts` — CRUD.
- `src/lib/carousel-mapping.ts` — adaptador puro. `src/lib/blob-upload.ts` — wrapper client `upload()`.
- `src/app/api/blob/upload/route.ts` — token do Blob.
- `src/app/login/page.tsx` + `login-form.tsx`. `src/app/carousels/page.tsx` + `carousel-list.tsx`.
- `scripts/seed.mjs`. `.env.example`.

**Modificados**
- `src/app/editor/page.tsx` — carregar por id, botão salvar, título, remove texto obsoleto.
- `src/app/editor/identity-panel.tsx` + `slide-editor.tsx` — upload real no Blob.
- `src/lib/editor-state.ts` — ampliar `EditorState` com `carouselId?`, `title` (sem quebrar os 70
  testes; campos aditivos, reducer preserva shape — AC 12).
- `src/app/page.tsx` — redirect. `package.json` — deps + scripts `db:generate/migrate/seed`.
- `.gitignore` — já cobre `.env*` (ok); adicionar `/drizzle` não (migrations versionam).

**Não tocar:** `src/components/slide/*` (contrato `SlideData` imutável — AC 11), `src/lib/export-png.ts`.

**Deps a instalar:** `next-auth@beta`, `drizzle-orm`, `@neondatabase/serverless`, `@vercel/blob`,
`bcryptjs`, `zod` (prod); `drizzle-kit`, `@types/bcryptjs` (dev). **Sem** `@auth/drizzle-adapter`.

---

## 6. Plano de teste (vitest, jsdom; banco/Blob mockados)

**Puros (sem I/O) — o núcleo:**
- `carousel-mapping.test.ts`: `resolveIdentity` (override total, parcial, nenhum → herda) [AC 10];
  `identityToOverride` (não materializa herdados; campo igual→null) [edge override parcial];
  `rowToEditorState` ordena por position [AC 17,19]; `resolveTheme`; `slidesToRows` mantém ordem.
- `image-upload` (existente) — validação 6 MB/tipo continua verde [AC 14].

**Zod schemas:** `SaveCarouselSchema`, login schema, upload params — parse rejeita malformado (400),
aceita válido [AC 22]. Testável puro.

**Actions com mocks (fronteira externa mockada — mocking-estrategico):**
- `getCarousel/saveCarousel/listCarousels`: `vi.mock` do `src/db` e do `auth()`. Verificar que **toda
  query inclui `ownerId` da sessão** e que id de outro dono → notFound [AC 9,18,23; edge outro dono].
- `saveCarousel`: replace-all persiste ordem; transação chamada [AC 16,17].
- Upload route `onBeforeGenerateToken`: sem sessão → rejeita; tipo/tamanho inválido → rejeita [AC 14].

**Regressão:** os **70 testes da S2 verdes** (sem quebra de shape do reducer) [AC 12] — checagem-de-regressao.

**Fora da suíte jsdom:** conexão real ao Neon + migração + seed = smoke manual documentado (não roda
em CI jsdom). Um teste de integração real de banco fica como follow-up (precisa de banco de teste).

**Gate de verificação (07):** `npm run type-check` + `npm run build` + `vitest run` verdes; migration
aplica em banco limpo; seed cria admin+client; login→salvar→reabrir manual OK.

---

## 7. Riscos e decisões de simplicidade (o que NÃO fazemos agora)

- **Não** usamos `@auth/drizzle-adapter` nem tabelas `accounts/sessions/verificationTokens` — Credentials
  + JWT não precisa (menos schema, menos deps).
- **Não** implementamos revogação de sessão server-side (JWT stateless; 1 admin — aceitável).
- **Não** implementamos export/CORS (S4). Guardamos só a **URL do Blob**; a conversão Blob→data-URL
  fica documentada como dependência da S4 (AC 15) — nada aqui a impede.
- **Não** há tela de admin, multi-cliente, nem tabela de identidades reutilizáveis (S6). 1 client por seed.
- **Não** embarcamos a fonte (dívida S1) — follow-up.
- **Risco residual:** `next-auth@beta` (v5) pode ter breaking changes menores de API — fixar versão no
  `package.json`. Driver Neon serverless com transações: validar no backend que `db.transaction()`
  funciona no `saveCarousel` (fallback: batch sequencial se o driver HTTP não suportar — usar Pool WebSocket).

---

## GATE HUMANO
Spec pronta. **Parar aqui.** Decisão nº1: aprovar **sessão JWT (Opção A)** no lugar de "sessão no
banco" — tecnicamente obrigatório para login por senha no Auth.js. Aprovado isso + o desenho geral,
sigo para implementação (04-backend → 05-frontend → 06-tester → 07-validator).
