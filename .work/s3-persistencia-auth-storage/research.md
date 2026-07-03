# Research — S3: Persistência + Auth + Storage

> Estágio 01 do pipeline dev-agents. Read-only sobre o código. Mapeia o terreno para o
> story-writer planejar sem reabrir o código. Toda referência `arquivo:linha` foi lida.

## Pedido (como recebido)
S3 — quatro entregas:
1. **Auth.js (NextAuth v5)** com login por senha (hash bcrypt/argon2), sessões no Postgres.
2. **Drizzle ORM + schema** (users, clients, carousels, slides) + migrations no Neon.
3. **Upload real** de imagem no Vercel Blob (avatares e imagens de slide) — client upload,
   mantendo a validação de 6 MB da S2.
4. **Salvar, listar e reabrir** carrosséis por usuário; ligar o editor da S2 à persistência.

---

## Estado do projeto (o que S1/S2 entregaram)

- **S1 (Fundação + Motor de render):** scaffold Next.js 15 App Router, TS strict +
  `noUncheckedIndexedAccess`, Tailwind + shadcn/ui. Componente `<Slide>` fiel + export
  HTML→PNG 1080×1350. 15 testes verdes. (`docs/STATUS.md:20-27`)
- **S2 (Editor manual):** rota `/editor`, `useReducer` com reducer puro, identidade única +
  tema global + slides, upload **local** (FileReader → data-URL, validação tipo + 6 MB),
  preview ao vivo reusando `<Slide>`. 70 testes verdes. **100% em memória — sem banco, sem
  rede, sem auth.** (`docs/STATUS.md:28-34`, `.work/s2-editor-manual/STATUS.md`)
- **Nada de backend existe ainda:** não há `src/app/api/**`, sem `middleware.ts`, sem
  `src/db`, sem `src/auth`, sem `src/env`. O layout raiz não tem providers
  (`src/app/layout.tsx:12-19`). S3 é a **primeira fatia com servidor, banco e auth** — cria
  toda essa fundação do zero.

---

## Arquivos relevantes (com `arquivo:linha`)

### Contrato de dados a persistir (herança S1/S2 — mapeia direto para tabelas)
- `src/components/slide/types.ts:4-21` — `SlideTheme = "light" | "dark"` e `SlideData`
  (contrato **imutável** do render). Campos: `name`, `handle` (sem "@"), `avatarUrl`,
  `verified`, `body`, `imageUrl?`, `theme`. **Não redefinir; persistir o que o compõe.**
- `src/lib/editor-state.ts:11-40` — os três blocos de estado a persistir:
  - `CarouselIdentity` (`:11-18`): `name`, `handle`, `avatarUrl` (data-URL hoje), `verified`
    → **mapeia para tabela `clients`/identidade**.
  - `EditorSlide` (`:24-30`): `{ id, body, imageUrl? }` → **mapeia para tabela `slides`**
    (ordem = posição no array).
  - `EditorState` (`:33-40`): `identity` + `theme` (global) + `slides[]` + `selectedSlideId`
    → o carrossel inteiro. `theme` e `identity` são **do carrossel** (uma identidade por
    carrossel hoje), não por slide.
  - `initialState` (`:83-93`) — estado inicial que "Novo carrossel" deve reproduzir.
  - `editorReducer` (`:102-255`) — reducer puro; será a fonte para serializar/desserializar.
  - `toSlideData` (`:263-277`) — adaptador estado→render; **isola a S1**. Se persistência mudar
    o shape do slide, só o carregador precisa reconstruir `EditorSlide`, não `SlideData`.
  - `DEFAULT_AVATAR_DATA_URL` (`:72-74`) — placeholder SVG same-origin; avatar nunca é `""`.

### Editor (S2) — ponto de ligação com a persistência
- `src/app/editor/page.tsx:1-71` — **Client Component-página**, dono do `useReducer`
  (`:19`). É aqui que entram: botão "Salvar", carregar estado de um carrossel existente
  (via `id` na URL/param), e estado de "salvando/salvo/erro". Hoje o header diz "Nada é
  salvo nesta fatia" (`:36-38`) — texto a remover na S3.
- `src/app/editor/identity-panel.tsx:42-65` — handler de upload de **avatar** (data-URL).
  Ponto onde o upload local vira upload real no Blob.
- `src/app/editor/slide-editor.tsx:36-59` — handler de upload de **imagem do slide**
  (data-URL). Idem — vira upload real no Blob.
- `src/app/editor/theme-preview.tsx:42-101` — toggle de tema + preview; consome
  `toSlideData`. Não muda na S3 (preview continua igual), mas prova que `avatarUrl`/`imageUrl`
  precisam ser **URLs carregáveis pelo `<img>`** (hoje data-URL; com Blob, URL https).
- `src/app/editor/slide-nav.tsx` — lista/reordena slides (não crítico para persistência,
  mas define a ordem que será salva).

### Upload (borda de input a estender)
- `src/lib/image-upload.ts:1-45` — **REUSAR a validação, estender a leitura**:
  - `MAX_IMAGE_BYTES = 6 * 1024 * 1024` (`:6`) — **manter os 6 MB** (pedido explícito).
  - `validateImageFile(file)` (`:16-24`) — validação pura tipo + tamanho. **Reusar como-está**
    no client antes do upload ao Blob (falha fechado).
  - `readFileAsDataUrl(file)` (`:30-45`) — hoje transforma em data-URL para memória. Na S3, o
    fluxo passa a **enviar o File ao Blob** e guardar a **URL retornada** no estado, em vez da
    data-URL. `readFileAsDataUrl` pode continuar existindo (ex.: preview otimista) ou ser
    substituído pela URL do Blob.

### Export (não muda, mas impõe restrição de CORS)
- `src/lib/export-png.ts:24-39` — `renderSlideToPng` usa `html-to-image` (`toPng`) com
  `cacheBust: true` (`:34`). **Risco CORS herdado:** hoje avatar/imagem são data-URL
  same-origin (zero CORS no canvas — comentário em `editor-state.ts:62-63`). Ao trocar para
  URL do Vercel Blob (origem cross), o canvas do `html-to-image` pode ser **tainted** e o
  export (S4) quebrar. Ver Riscos. `cacheBust:true` **adiciona querystring** — que com Blob
  cross-origin dispara um request extra que precisa de CORS permissivo.

### Config / infra
- `package.json:15-44` — dependências (nenhuma de banco/auth/storage instalada — ver seção).
  Scripts: `dev`, `build`, `start`, `type-check` (`tsc --noEmit`), `test` (`vitest run`),
  `test:watch`, `gen:fixtures` (`:6-14`). **Não há script de migration** — S3 precisa criar
  (`db:generate`, `db:migrate`, `db:push` do drizzle-kit).
- `tsconfig.json:8-9` — `"strict": true` + `"noUncheckedIndexedAccess": true`. Todo código
  novo (queries, adapter, handlers) sofre narrowing obrigatório em índices e retornos.
  `exclude: ["node_modules","scripts","tests/fixtures"]` (`:25`) — se as migrations forem
  `.sql`/`.ts` fora de `scripts`, entram no type-check.
- `vitest.config.ts:1-18` — ambiente `jsdom`, `globals: true`, `setupFiles: ["./tests/setup.ts"]`,
  `include: ["tests/**/*.test.{ts,tsx}"]`. Testes de banco/auth precisam decidir estratégia
  (mock do adapter/queries vs banco de teste) — jsdom não conecta a Postgres.
- `next.config.mjs:5-7` — `eslint.ignoreDuringBuilds: true` (lint fora do gate). **Faltará**
  `images.remotePatterns` para o domínio do Vercel Blob se usar `next/image` (hoje usa `<img>`
  cru — `identity-panel.tsx:118`, então talvez não precise).
- `src/app/layout.tsx:12-19` — layout raiz **sem provider** (sem `SessionProvider`, sem
  `<html>` com theme). S3 precisa decidir onde envolver o provider de sessão (se usar
  `useSession` no client).

### Segredos / env
- **Nenhum uso de `process.env` no código de produção** (grep: só
  `scripts/generate-fixtures.mjs`). Não há `src/env.ts`, `.env.example` nem validação de env.
  S3 introduz **os primeiros segredos** (`DATABASE_URL`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`).
- `.gitignore:10-13` — já ignora `.env`, `.env.*` (exceto `.env.example`) e `.vercel/`
  (`:15`). **Cobertura de segredos OK** — só criar `.env.example` documentando as chaves.

---

## Features similares já existentes (padrão a seguir)

1. **Borda de input com validação pura + falha fechado** (`src/lib/image-upload.ts`,
   `src/app/editor/slide-editor.tsx:41-58`): o projeto já tem o padrão "valida na borda,
   não muta estado se inválido, erro inline". A S3 (upload ao Blob, validação de forms de
   login/carrossel) **deve seguir esse mesmo padrão**. Nota: a spec da S2 decidiu **não**
   instalar Zod por ser trivial (`spec.md:339-345`) — S3 traz forms de auth + payloads de
   API, então reavaliar Zod aqui é natural (o CLAUDE.md lista Zod na stack).
2. **Adaptador que isola contrato entre camadas** (`toSlideData`, `editor-state.ts:263-277`):
   padrão de "uma função pura converte o modelo interno no contrato da outra camada". A S3
   replica isso para **DB row → EditorState** (carregar) e **EditorState → DB rows** (salvar).
3. **Módulo puro testável separado do componente** (`editor-state.ts`, `image-upload.ts` sem
   `"use client"`): o coração testável mora em `src/lib/`. Queries e serialização de S3
   devem seguir — lógica pura testável, efeitos (fetch/db) na borda.
4. **Co-locação por rota** (`src/app/editor/*`, `src/app/render-test/*`): subcomponentes e
   fixtures ao lado da rota. Rotas novas de S3 (`/login`, `/carousels`, API) seguem o padrão.

---

## O que já está quebrado / dívidas na área

- **Follow-up crítico da fonte (herdado S1):** a fonte Segoe UI/Selawik **não está embarcada**
  via `next/font/local` (`docs/STATUS.md:49-51`, `spec.md` S2 `:533-535`). No deploy Linux
  (Vercel) o slide cai em fallback e perde fidelidade. **Não é escopo de S3**, mas S3 é a
  primeira fatia que aproxima o deploy — registrar para não surpreender.
- **Texto "Nada é salvo nesta fatia"** no editor (`src/app/editor/page.tsx:36-38`) — mentira
  após S3; precisa ser removido/atualizado.
- **ESLint desligado no build** (`next.config.mjs:5-7`) — não bloqueia S3, mas o gate real é
  só `type-check` + `vitest` + `build`. Código de auth/DB não tem lint de segurança
  automático; confiar em review.
- **Sem `middleware.ts`** — proteção de rota do editor ainda não existe; qualquer um acessa
  `/editor`. S3 precisa criar a proteção.

---

## Dependências faltantes a instalar (nenhuma existe no `package.json:15-44`)

| Pacote | Para quê | Nota |
|---|---|---|
| `next-auth@beta` (v5) | Auth.js App Router | v5 ainda beta; API de config é `NextAuth()` em `src/auth.ts` + route handler. |
| `@auth/drizzle-adapter` | adapter de sessão/usuário no Postgres via Drizzle | exige tabelas `users`/`accounts`/`sessions`/`verificationTokens` no schema. |
| `drizzle-orm` | ORM/queries | — |
| `drizzle-kit` (dev) | migrations/`drizzle-kit generate/migrate` + `drizzle.config.ts` | scripts novos no `package.json`. |
| driver Postgres | conexão | **decisão:** `@neondatabase/serverless` (HTTP, ideal serverless Vercel) **vs** `postgres` (postgres-js) **vs** `pg`. Ver Riscos. |
| `@vercel/blob` | upload real de imagens | client upload usa `handleUpload` (server route) + `upload()` (client). |
| `bcryptjs` **ou** `argon2` | hash de senha | **bcryptjs** (JS puro) é mais seguro para serverless/Edge da Vercel; `argon2` é binário nativo e pode falhar no runtime serverless. Ver Riscos. |
| `zod` | validação de forms de login + payloads de API | CLAUDE.md lista na stack; S2 adiou por trivialidade — S3 tem forms/API, reavaliar. |

`react`/`next`/`tailwind`/`shadcn` já estão. `@radix-ui/*` já presente (S2).

---

## Riscos concretos (com severidade)

- 🔴 **CORS/canvas no export ao trocar data-URL por URL do Blob.** Todo o design da S1/S2
  escolheu data-URL **deliberadamente** para o canvas do `html-to-image` não ser tainted
  (`editor-state.ts:62-63`, `export-png.ts:34` com `cacheBust:true`). Servir avatar/imagem do
  Vercel Blob (origem cross) pode **quebrar o export da S4** (canvas tainted → `toPng` lança).
  Mitigações a decidir na spec: (a) Blob com CORS liberado + `crossorigin="anonymous"` nos
  `<img>` do `<Slide>` + `html-to-image` com `fetchRequestInit`/`cacheBust:false`; ou (b)
  buscar a imagem e reconverter para data-URL no client antes do export. **Isto precisa de
  decisão explícita antes de mexer no upload** — é o maior acoplamento oculto de S3→S4.
- 🔴 **Session strategy: `database` vs `jwt` no Auth.js v5.** O pedido diz "sessões no
  Postgres" (`database`). O `@auth/drizzle-adapter` suporta, mas **`database` sessions não
  funcionam bem em `middleware`/Edge** (o middleware não consegue consultar o Postgres via
  driver node). Padrão v5 comum: `jwt` para middleware + adapter para persistir usuários. Se
  o CEO quer sessão **no banco** literalmente, a proteção de rota tem de rodar no runtime
  Node (não Edge) ou usar checagem em cada Server Component. **Decisão de arquitetura para o
  story/spec.**
- 🟡 **Driver Neon: serverless (HTTP) vs node-postgres.** `@neondatabase/serverless` casa com
  funções serverless da Vercel (sem conexões penduradas) mas tem limitações (ex.: transações,
  sessões `database` do Auth precisam de conexão). `postgres`/`pg` dão conexão real mas
  precisam de pooling. Escolha afeta o adapter e o `middleware`. Alinha com Vercel **Hobby**
  (`docs/RESTRICOES.md:14-18`: função leve, timeout curto).
- 🟡 **Hash de senha em runtime serverless/Edge (Vercel Hobby).** `argon2` (nativo) pode não
  compilar/rodar no runtime serverless; `bcryptjs` (JS puro) é o caminho seguro. Nunca no
  Edge runtime (custo alto). Decidir runtime da rota de login = Node.
- 🟡 **Migration com dados / provisionamento done-for-you.** Modelo de negócio
  (`docs/PLAYBOOK-CLIENTE.md:18-26`): o **Octavio cria a conta do cliente** (e-mail + senha
  provisória) — não há signup público. O schema precisa suportar criação administrativa de
  usuário e **multi-identidade por cliente** (`VISAO.md:44-46`, `PLAYBOOK:21-22`,
  `PLAYBOOK:39-44`). Ver Perguntas abertas sobre a modelagem `users`×`clients`×identidades.
- 🟡 **Vercel Blob — client upload precisa de rota server.** `@vercel/blob/client` `upload()`
  chama um route handler que usa `handleUpload` + `BLOB_READ_WRITE_TOKEN`. A validação de
  6 MB tem de ser **reforçada no server** (`onBeforeGenerateToken` / `maximumSizeInBytes`),
  não só no client (`image-upload.ts:16-24` é client — burlável). Cota do tier gratuito do
  Blob a monitorar (`RESTRICOES.md:18`).
- 🟡 **Testes de banco/auth em jsdom.** `vitest.config.ts:7-12` roda em jsdom; queries reais
  não conectam. Definir estratégia: mockar o adapter/queries (mocking-estrategico: mockar
  fronteira externa) ou banco de teste dedicado. O grosso testável deve ser **serialização
  pura row↔EditorState** (segue o padrão `toSlideData`).
- 🟢 **`noUncheckedIndexedAccess`** (`tsconfig.json:9`) — retornos de query (`rows[0]`) são
  `T | undefined`; todo acesso exige narrowing. Sem atalho, já é o padrão do projeto.
- 🟢 **Provider de sessão no layout raiz** (`layout.tsx:12-19`) — se usar `useSession` no
  client, precisa envolver com `SessionProvider`; senão, ler sessão só em Server Components
  (`auth()`), sem provider. Decisão de spec.

---

## Dependências afetadas (blast radius)

- `src/app/editor/page.tsx` (🟡 comportamental) — ganha carregar/salvar, param de `id`,
  estado de rede. Maior mudança de UI.
- `src/app/editor/identity-panel.tsx` + `slide-editor.tsx` (🟡) — handlers de upload trocam
  data-URL local por upload ao Blob + URL retornada.
- `src/lib/image-upload.ts` (🟢) — `validateImageFile` reusado; `readFileAsDataUrl` pode ficar
  ou ser complementado por `uploadToBlob`. Não quebra assinatura existente.
- `src/lib/editor-state.ts` (🟢/🟡) — `EditorState`/`EditorSlide` podem ganhar campos de
  persistência (ex.: `carouselId`, `title`, `slide.id` vira id do banco). Cuidado: os **70
  testes** da S2 dependem do shape atual (`tests/editor-reducer.test.ts`). Ampliar sem quebrar.
- `src/components/slide/*` (🔴 se tocado) — **NÃO tocar** o contrato `SlideData`; mudar quebra
  os testes de contrato da S1 (`tests/slide.test.tsx`) e a S4. `avatarUrl`/`imageUrl` já
  aceitam qualquer string (data-URL ou URL) — URL do Blob cabe sem mudar o tipo, mas o
  **canvas** do export é que sofre (risco CORS acima).
- **Novo:** `src/app/api/**`, `middleware.ts`, `src/db/`, `src/auth.ts`, `drizzle.config.ts`,
  `.env.example` — tudo criado do zero, sem dependentes existentes.
- **Testes:** os 70 atuais não podem regredir (`checagem-de-regressao`). Ampliação de
  `EditorState` é o ponto de maior risco de regressão.

---

## Perguntas abertas (para o story-writer / CEO)

- [PRECISA CLARIFICAR: **Modelagem `users` × `clients` × identidades.** O código atual tem
  UMA identidade por carrossel (`CarouselIdentity`, `editor-state.ts:11-18`). Mas
  `VISAO.md:44-46` e `PLAYBOOK-CLIENTE.md:21-22,39-44` pedem **múltiplas identidades por
  cliente** salvas e reutilizáveis. Na S3, cada carrossel salva sua identidade inline (snapshot),
  ou já criamos a tabela de identidades reutilizáveis? O pedido lista tabelas
  `users, clients, carousels, slides` — sem tabela de "identidade" separada. Confirmar se
  identidade é coluna(s) em `carousels`/`clients` ou tabela própria.]
- [PRECISA CLARIFICAR: **Relação `users` × `clients`.** Done-for-you: o Octavio (admin) cria
  contas. `users` = quem loga (inclui o admin Octavio?), `clients` = a marca/cliente atendido?
  Um `user` pertence a um `client`? Há papel `admin` vs `cliente`? Isso define o isolamento de
  dados (quem vê quais carrosséis) — mesmo que o multi-cliente pleno seja S6, o schema de S3
  precisa da FK de dono correta.]
- [PRECISA CLARIFICAR: **Session strategy — `database` (literal "sessões no Postgres") ou
  `jwt`?** Impacta se a proteção de rota roda em `middleware` (Edge) ou só em Server Components
  (Node). Ver Risco 🔴.]
- [PRECISA CLARIFICAR: **Driver Neon:** `@neondatabase/serverless` (HTTP, casa com Vercel
  serverless) ou `postgres`/`pg` (conexão real, necessária para sessões `database`)? Depende da
  resposta sobre session strategy.]
- [PRECISA CLARIFICAR: **Hash:** `bcryptjs` (JS puro, seguro em serverless) ou `argon2`
  (nativo, risco no runtime)? Recomendação técnica: `bcryptjs`. Confirmar.]
- [PRECISA CLARIFICAR: **Estratégia CORS/export (Risco 🔴).** Ao servir imagens do Blob, como
  garantir que o export da S4 não quebre? Opção A (CORS + crossorigin no `<img>`) ou opção B
  (re-fetch para data-URL antes do export)? Precisa decidir em S3 porque muda como a URL é
  guardada e consumida.]
- [PRECISA CLARIFICAR: **Signup público existe?** Pelo Playbook, NÃO (`PLAYBOOK:6-8`) — só o
  Octavio cria contas. Confirmar que S3 entrega só **login** (+ seed/rota admin para criar a
  primeira conta), sem tela de cadastro público. Reset/troca de senha (`PLAYBOOK:44`) é S3 ou
  depois?]
- [PRECISA CLARIFICAR: **Campos do carrossel a salvar:** o `EditorState` não tem `title` nem
  `status`/datas, mas `VISAO.md:56-57` lista "título, dono, status, datas". Adicionar `title`
  (e status?) ao salvar? Como o usuário nomeia o carrossel — campo novo no editor?]
- [PRECISA CLARIFICAR: **Zod entra agora?** S2 adiou (`spec.md:339-345`). Com forms de login e
  payloads de API na borda, o baseline de segurança recomenda validar. Confirmar adoção.]

---

## Definição de "feito" (deste research)
O story-writer tem: o contrato de dados a persistir com `arquivo:linha`, os pontos exatos do
editor a ligar, o que reusar (validação 6 MB, adaptador, módulo puro), as dependências a
instalar, os riscos de acoplamento (CORS/export, session strategy, driver) e as perguntas de
modelagem que o código não responde. Nenhum arquivo citado foi inventado — todos foram lidos.
