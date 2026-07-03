# Backend — S3: Persistência + Auth + Storage

Estágio 04-backend. Fatia de servidor + libs puras da spec. Sessão JWT (Opção A,
gate 2 aprovado). Stack: Next 15 App Router, Drizzle + Neon serverless, Auth.js v5
Credentials, Vercel Blob, Zod nas bordas.

## O que foi implementado

### Dados / infra
- `src/lib/env.ts` — validação Zod das env vars de runtime (DATABASE_URL, AUTH_SECRET,
  BLOB_READ_WRITE_TOKEN). `server-only`, falha fechado com erro claro (sem imprimir valores).
- `src/db/schema.ts` — tabelas `users`, `clients`, `carousels`, `slides` exatamente
  como §1: uuid PK defaultRandom, FKs com onDelete (cascade/restrict), índices em
  todas as FKs de busca, `unique(carouselId, position)`, overrides nullable, timestamptz.
  Exporta tipos inferidos (`UserRow`, `ClientRow`, `CarouselRow`, `SlideRow`).
- `src/db/index.ts` — client Drizzle via driver Neon serverless (Pool + `ws`), que
  habilita `db.transaction()` (usado no saveCarousel). `server-only`.
- `drizzle.config.ts` — dialect postgresql, schema/out corretos, URL = DATABASE_URL_UNPOOLED
  (conexão direta p/ migrations). Carrega `.env.local` via dotenv.
- `drizzle/0000_damp_energizer.sql` — migration inicial (versionada).

### Auth (Auth.js v5, JWT)
- `src/auth.ts` — NextAuth Credentials, `session.strategy='jwt'`, `pages.signIn='/login'`.
  `authorize` valida (Zod) → busca user por email → `bcrypt.compare`. Callbacks: `jwt`
  injeta `token.uid`; `session` expõe `session.user.id`.
- `src/types/next-auth.d.ts` — estende `Session.user.id` e `JWT.uid`.
- `src/app/api/auth/[...nextauth]/route.ts` — handler, runtime nodejs.
- `src/lib/auth-guard.ts` — `requireUser()`: `auth()` → redirect('/login') se sem sessão.

### Núcleo puro (testável sem I/O)
- `src/lib/carousel-mapping.ts` — `resolveIdentity`, `resolveTheme`, `rowToEditorState`,
  `identityToOverride` (campo igual ao client → null; NÃO materializa herdados),
  `themeToOverride`, `slidesToRows`. Sem import de `@/db` (não arrasta server-only p/ jsdom).
  Define shapes de linha próprios (ClientData/CarouselData/SlideData).

### Server actions (contrato consumido pelo frontend)
- `src/lib/actions/auth.ts` — `signInAction`, `signOutAction`.
- `src/lib/actions/carousels.ts` — `createCarousel`, `saveCarousel`, `listCarousels`,
  `getCarousel`, `deleteCarousel`. Todas com `requireUser()` no topo, Zod na entrada,
  `ownerId` sempre da sessão, queries de carousel sempre filtram `AND ownerId`.

### Upload
- `src/app/api/blob/upload/route.ts` — `handleUpload` do @vercel/blob/client.
  `onBeforeGenerateToken` exige sessão (senão 401), allowedContentTypes png/jpeg/webp,
  maximumSizeInBytes = MAX_IMAGE_BYTES (6 MB, importado de image-upload.ts).
- `src/lib/blob-upload.ts` — wrapper client `uploadImageToBlob(file)`: valida (6 MB/tipo)
  → `upload()` apontando p/ /api/blob/upload → retorna `{ ok, url }`.

### Editor state (ampliação aditiva)
- `src/lib/editor-state.ts` — campos ADITIVOS `carouselId?: string` e `title?: string`
  (opcional p/ não quebrar literais dos testes S2), `DEFAULT_CAROUSEL_TITLE`, action
  `SET_TITLE` (nova; nenhuma action existente alterada). `initialState` traz o default.

### Seed
- `scripts/seed.mjs` — lê SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD do env (aborta se
  ausentes; nunca hardcode). Cria user admin (bcrypt.hash cost 12) + 1 client "Sua Marca"
  / "suamarca" / avatar = mesmo placeholder same-origin do editor / verified false / light.
  Idempotente (skip se email existe). Transação user+client.

### Config
- `.env.example` — documenta as 6 chaves sem valores.
- `package.json` — deps fixadas + scripts `db:generate`, `db:migrate`, `db:seed`.

## Contrato real entregue (o Frontend consome isto)

### Auth actions — `src/lib/actions/auth.ts`
- `signInAction(prevState: SignInResult | undefined, formData: FormData): Promise<SignInResult>`
  - Feito para `useActionState`. `formData` deve conter `email` e `password`.
  - Sucesso → redireciona p/ `/carousels` (lança redirect; não retorna).
  - Falha → `{ error: 'E-mail ou senha inválidos' }` (genérico, não revela se email existe).
- `signOutAction(): Promise<void>` — encerra sessão e redireciona p/ `/login`.

### Carousel actions — `src/lib/actions/carousels.ts`
- `createCarousel(): Promise<{ id: string }>`
  - Cria carrossel herdando o client padrão + 1 slide vazio (position 0). Retorna `{ id }`.
- `listCarousels(): Promise<CarouselListItem[]>`
  - `CarouselListItem = { id: string; title: string; updatedAt: string /* ISO */ }`.
  - Só do dono, ordenado por updatedAt desc.
- `getCarousel(id: string): Promise<EditorState>`
  - id inválido / de outro dono / inexistente → `notFound()` (404).
  - Retorna `EditorState` (de `@/lib/editor-state`) com `carouselId`, `title`, identidade e
    tema resolvidos (override ?? client), slides ordenados por position, selectedSlideId = 1º.
- `saveCarousel(input: SaveCarouselInput): Promise<{ ok: true; updatedAt: string /* ISO */ }>`
  - `SaveCarouselInput` (Zod `SaveCarouselSchema`, exportado):
    ```
    {
      id: string (uuid),
      title: string (1..120),
      theme: 'light' | 'dark',
      identity: { name: string(≤120), handle: string(≤120), avatarUrl: string(≥1), verified: boolean },
      slides: Array<{ body: string(≤2000), imageUrl?: string (url) }>  // min 1
    }
    ```
  - Replace-all atômico (transação): UPDATE carousel + DELETE slides + INSERT na ordem
    (position = índice). Entrada malformada → ZodError antes de qualquer efeito colateral.
    id de outro dono → `notFound()`.
  - Overrides calculados por herança: campo igual ao client vira null (herda).
- `deleteCarousel(id: string): Promise<{ ok: true }>`
  - id inválido / de outro dono / inexistente → `notFound()`. Slides caem por cascade.

### Upload — client wrapper `src/lib/blob-upload.ts`
- `uploadImageToBlob(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }>`
  - Valida 6 MB/tipo no client, envia ao Blob via /api/blob/upload (exige sessão).
  - Frontend guarda `url` (https) no estado do slide/avatar; persiste depois via saveCarousel.

### Env de sessão
- Ler sessão só em Server Components via `auth()` de `@/auth`. Sem SessionProvider (YAGNI).
- `session.user.id` disponível (tipo estendido).

## Migrations / dados
- **Destrutiva?** Não. Banco vazio → migration inicial única, 100% aditiva (CREATE TABLE/INDEX).
- **Gerada:** `npx drizzle-kit generate` → `drizzle/0000_damp_energizer.sql` (4 tabelas, FKs, índices, unique).
- **Aplicada no Neon:** `npx drizzle-kit migrate` → "migrations applied successfully".
  Confirmado: tabelas públicas = `carousels, clients, slides, users` (+ `__drizzle_migrations`).
- **Seed aplicado no Neon:** `npm run db:seed` → admin + client "Sua Marca" criados.
  Idempotência confirmada (2ª execução: "Admin ja existe — nada a fazer"). users=1, client light/não verificado.
- Confirmação humana de destrutivo: não necessária (nada destrutivo).

## Comandos rodados
- `npm install --save-exact next-auth@beta drizzle-orm @neondatabase/serverless @vercel/blob bcryptjs zod dotenv ws` → ok (versões fixadas)
- `npm install --save-exact -D drizzle-kit @types/bcryptjs @types/ws` + `server-only` → ok
- `npx drizzle-kit generate` → migration 0000 gerada (4 tabelas)
- `npx drizzle-kit migrate` → aplicada com sucesso no Neon
- `npm run db:seed` → admin + client criados; 2ª vez → idempotente (skip)
- consulta `information_schema.tables` → carousels, clients, slides, users
- `npm run type-check` (tsc --noEmit) → **sem erros**
- `npx vitest run` → **70 passed (5 files)** — regressão S2 zero
- `npm run build` (next build) → **compilou**; rotas /api/auth e /api/blob registradas

## Desvios da spec
1. **`title` opcional em EditorState** (spec §5 dizia "title" sem qualificar). Tornei
   `title?: string` (não obrigatório) para não quebrar os literais de `EditorState` dos
   testes da S2 (AC 12). `initialState` traz o default e leituras caem em
   `DEFAULT_CAROUSEL_TITLE`. Aditivo e não-quebrante — cumpre a intenção da spec.
2. **`src/app/page.tsx` (redirect da raiz) NÃO alterado.** A spec §5 lista como
   "modificado", mas o prompt do 04 restringe o escopo a servidor/libs e delega páginas
   de UI ao 05. Redirecionar `/` p/ `/carousels`/`/login` antes de o 05 criar essas rotas
   quebraria a home. Deixado para o 05 junto com login/carousels/editor.
3. **`zod` v4** (não v3): usei a API nova (`z.email()`, `z.url()`, `z.string().uuid()`).
   Type-check e build validaram. Sem impacto no contrato.
4. `createCarousel` já insere 1 slide vazio (position 0) — coerente com o editor da S2 que
   abre com 1 slide, e satisfaz `slides.min(1)` do SaveCarouselSchema no 1º save.

## O que o Frontend (05) precisa saber
- **Login:** form (Client) usa `useActionState(signInAction, undefined)`; campos `name="email"`
  e `name="password"`; renderizar `state.error` inline. `/login` (Server) redireciona p/
  `/carousels` se `auth()` já logado.
- **Sessão:** só em Server Components via `auth()`; `requireUser()` no topo de páginas protegidas.
- **Editor:** `getCarousel(id)` devolve `EditorState` pronto p/ o `useReducer` da S2 (inclui
  `carouselId` e `title`). Salvar → montar `SaveCarouselInput` do estado (theme, identity, slides
  com `imageUrl?` = a url do Blob ou omitir) e chamar `saveCarousel`. Novo carrossel: `createCarousel`
  → redirect `/editor?id=`.
- **Título:** editável via action `SET_TITLE` do reducer (nova). Default `DEFAULT_CAROUSEL_TITLE`.
- **Upload:** trocar `readFileAsDataUrl` por `uploadImageToBlob(file)`; em `{ ok:true }` gravar
  `url` via `SET_AVATAR`/`SET_SLIDE_IMAGE`. `avatarUrl` no save aceita a data-URL placeholder
  (default) OU a url https do Blob. `identity.avatarUrl` nunca deve ser "".
- **imageUrl dos slides:** no `SaveCarouselSchema` é `url` (https). Slides sem imagem: omitir o
  campo. O placeholder de avatar (data-URL) NÃO passa por `imageUrl` de slide.
- **Erros de recurso alheio/inexistente:** as actions chamam `notFound()` → renderiza a página
  404 do Next; tratar com `not-found.tsx` se quiser UX custom.
- **`avatarUrl` do save** aceita `min(1)` (não exige `url`) porque o default é uma data-URL SVG.
