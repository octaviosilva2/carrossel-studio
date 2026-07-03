# Frontend — S3: Persistência + Auth + Storage

Estágio 05-frontend. UI da S3 sobre o contrato REAL entregue pelo 04-backend
(server actions, upload wrapper, editor-state ampliado). Stack: Next 15 App Router,
TS strict + noUncheckedIndexedAccess, Tailwind + shadcn/ui. Sessão JWT lida só em
Server Components via `auth()`; sem SessionProvider.

## O que foi implementado

### `/login` (AC 1, 2)
- `src/app/login/page.tsx` (Server Component) — `auth()`; se já logado → `redirect('/carousels')`.
  `export const dynamic = 'force-dynamic'` (decisão depende da sessão). Renderiza o form.
- `src/app/login/login-form.tsx` (Client) — `useActionState(signInAction, undefined)`.
  Inputs `name="email"` e `name="password"` (shadcn Input/Label/Button). Botão submit com
  pending via `useFormStatus` (componente `SubmitButton` interno, pois o hook só enxerga o
  `<form>` ancestral). `state.error` renderizado inline (mensagem genérica) com `role="alert"`,
  `aria-invalid` e `aria-describedby` nos inputs. Sem signup.

### `/carousels` (AC 18, 20, logout)
- `src/app/carousels/page.tsx` (Server Component) — `requireUser()` + `listCarousels()`.
  `dynamic='force-dynamic'`. Botão "Novo carrossel" e CTA do estado vazio usam a server action
  inline `createCarouselAction` (`"use server"`): chama `createCarousel()` → `redirect('/editor?id=<id>')`.
  Botão "Sair" via `<form action={signOutAction}>`. Estado vazio → bloco tracejado com CTA.
- `src/app/carousels/carousel-list.tsx` (Client) — lista clicável; cada item é `<Link href="/editor?id=<id>">`
  com `title` + `updatedAt` formatado pt-BR (`Intl.DateTimeFormat`, client-side p/ evitar mismatch
  de hidratação). Keys estáveis pelo `id`. Consome o tipo `CarouselListItem`.

### `/editor` (AC 16, 19, 20, 21)
- `src/app/editor/page.tsx` — REESCRITO como Server Component wrapper. `requireUser()`;
  lê `searchParams` (Promise no Next 15). Sem `id` → `createCarousel()` + `redirect('/editor?id=<novo>')`
  (todo carrossel tem id, AC 20). Com `id` → `getCarousel(id)` (a action chama `notFound()` p/ dono
  errado/inexistente → 404 do Next, AC 23) → passa o `EditorState` como `initialState` ao Client.
  `dynamic='force-dynamic'`.
- `src/app/editor/editor-client.tsx` — NOVO. Extração do Client Component do editor (o useReducer da
  S2, agora semeado por `initialState` do banco em vez do hardcoded). Ganha:
  - Campo **Título** (`Input` ligado a `SET_TITLE`; cai em `DEFAULT_CAROUSEL_TITLE` quando ausente).
  - Botão **Salvar** — monta `SaveCarouselInput` do estado (id=carouselId, title, theme, identity,
    slides com `imageUrl` só quando houver — omitido senão) e chama `saveCarousel`. Estado visual
    `idle→saving→saved→error` (union discriminada `SaveState`), com `aria-live="polite"` e `role="alert"`
    no erro. Em erro NÃO afirma "salvo" e preserva o estado do editor (AC edge). Guarda: sem `carouselId`
    ou 0 slides → erro claro, não chama a action.
  - Link "Meus carrosséis" (`/carousels`). Texto "Nada é salvo nesta fatia" REMOVIDO (AC 21).

### Upload real no Blob (AC 13, 14)
- `src/app/editor/identity-panel.tsx` — avatar: `readFileAsDataUrl` → `uploadImageToBlob(file)`.
  `{ok:true}` → `SET_AVATAR` com `url` https; `{ok:false}` → erro inline, estado inalterado.
  `validateImageFile` mantido antes do envio (reforçado no server). Botão desabilita/mostra "Enviando…".
- `src/app/editor/slide-editor.tsx` — imagem do slide: idem, com `SET_SLIDE_IMAGE` (id, url).
- `src/components/slide/*` e `src/lib/export-png.ts` NÃO tocados (contrato SlideData imutável, AC 11).

### `/` (raiz)
- `src/app/page.tsx` — `redirect('/carousels')` (que exige login → manda p/ `/login` se deslogado).

## Estados cobertos
- **Login:** carregando (botão "Entrando…" via useFormStatus), erro (mensagem genérica inline),
  sucesso (redirect pela action).
- **Lista:** vazio (CTA "criar meu primeiro carrossel"), sucesso (itens com data pt-BR).
  Carregando/erro: resolvidos no Server Component (RSC aguarda a query; erro de sessão → `requireUser`
  redireciona p/ login).
- **Editor:** salvando ("Salvando…" + botão disabled), salvo ("Salvo." verde + check), erro
  ("Falha ao salvar…" `role=alert`, trabalho preservado). Upload: enviando/erro inline por campo.
  Slide vazio (0 slides) e sem-slide já cobertos pela S2.

## Integração com backend (confere com o contrato real)
- `signInAction(prevState, formData)` via `useActionState` — campos `email`/`password`. ✔
- `signOutAction()` via `<form action>`. ✔
- `createCarousel(): {id}` → wrapper redireciona (a action não redireciona sozinha, conforme contrato). ✔
- `listCarousels(): CarouselListItem[]` (id/title/updatedAt ISO). ✔
- `getCarousel(id): EditorState` (com carouselId, title, identidade/tema resolvidos, slides ordenados,
  selectedSlideId = 1º). Passado direto ao useReducer. ✔
- `saveCarousel(SaveCarouselInput): {ok, updatedAt}` — payload montado exatamente conforme
  `SaveCarouselSchema` (slides com `imageUrl?` só quando houver; avatarUrl aceita placeholder data-URL). ✔
- `uploadImageToBlob(file): {ok,url}|{ok,error}` — narrowing no chamador; url gravada via action do reducer. ✔
- `notFound()` das actions → página 404 do Next (sem `not-found.tsx` custom — YAGNI). ✔

## Comandos rodados
- `npm run type-check` → sem erros.
- `npx vitest run` → **70 passed (5 files)** — zero regressão da S2.
- `npm run build` → **compilou**; rotas `/login`, `/carousels`, `/editor`, `/`, `/api/blob/upload`,
  `/api/auth` registradas.

## Desvios da spec

1. **Editor extraído p/ `editor-client.tsx`.** A spec sugeria (§4) extrair "se ajudar" — foi
   necessário: `page.tsx` virou Server Component async com I/O; o useReducer/painéis vivem no Client.

2. **`SaveCarouselSchema` e tipos movidos p/ `src/lib/actions/carousel-types.ts` (módulo neutro).**
   MOTIVO: o build do Next 15 falhou com *"A 'use server' file can only export async functions, found
   object"* quando Client Components passaram a importar de `carousels.ts` — o arquivo `"use server"`
   exportava o objeto Zod `SaveCarouselSchema`. Um arquivo de server actions só pode exportar funções
   async. Movi o schema + tipos (`SaveCarouselInput`, `CarouselListItem`, `SaveCarouselResult`,
   `CreateCarouselResult`, `DeleteCarouselResult`) p/ um módulo neutro; `carousels.ts` importa deles e
   exporta SOMENTE funções async. **Nenhuma lógica/contrato do servidor mudou** — só a localização do
   schema/tipos. O backend não pegou isso porque nenhum client importava dele ainda. Não é gambiarra:
   é a estrutura que o Next 15 exige. (Se o time preferir, o 04 pode assumir esse módulo — flag p/ o CTO.)

3. **`tests/editor-page.test.tsx` reapontado p/ `<EditorClient initialState>`.** A página virou Server
   Component (searchParams + I/O de banco), imprópria p/ render síncrono em jsdom. O teste de integração
   UI+reducer migrou para o novo Client Component (mesma cobertura). Mocka `@/lib/actions/carousels` e
   `@/lib/blob-upload` (fronteiras server-only) p/ não arrastar `server-only` ao jsdom. **Shape do reducer
   intacto** — os 70 testes seguem verdes (AC 12).

## Nada bloqueou — contrato do backend bateu com o que a UI precisava
(exceto o ajuste estrutural do item 2, que não altera contrato nem lógica).
