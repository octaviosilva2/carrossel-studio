# Testes — S3: Persistência + Auth + Storage

Estágio 06-tester. Testes que provam os critérios de aceite da S3. Estratégia:
banco (`@/db`) e Blob são fronteiras externas → MOCK (jsdom não conecta a Postgres).
O núcleo testável é a lógica pura + validação Zod + authz. Nenhum código de produção
foi alterado. Nenhum dado real de cliente nos fixtures.

## Arquivos de teste criados (todos em `tests/`)

| Arquivo | Testes | Área |
|---|---|---|
| `carousel-mapping.test.ts` | 24 | Núcleo puro row↔EditorState (herança, ordem, overrides) |
| `save-carousel-schema.test.ts` | 14 | Zod `SaveCarouselSchema` (borda de entrada) |
| `carousel-actions.test.ts` | 19 | Server actions (barreira de sessão, authz por dono, transação) |
| `auth-actions.test.ts` | 6 | `signInAction`/`signOutAction` (falha fechado, msg genérica) |
| `blob-upload-route.test.ts` | 4 | Route de upload (sessão exigida, limite 6 MB server) |
| **Total novos** | **67** | |

Regressão S2: **70 testes** (5 arquivos) intactos.

## Resultado da rodada (números reais)

- `npx vitest run` → **137 passaram, 0 falharam** (10 arquivos).
  - 70 da S2 (image-upload 7, editor-reducer 43, png-dimensions 4, slide 11, editor-page 5) — todos verdes (AC 12).
  - 67 novos da S3.
- `npm run type-check` (`tsc --noEmit`) → **sem erros**. Os testes SÃO type-checked
  (tsconfig inclui `**/*.ts`/`**/*.tsx`; só `tests/fixtures` e `scripts` estão excluídos).

## Critérios de aceite → testes

- [x] **AC 2** (senha errada falha fechado, msg genérica) → `auth-actions.test.ts`:"credenciais inválidas (AuthError) => mensagem genérica" — PASSOU
- [x] **AC 5** (logout) → `auth-actions.test.ts`:"chama signOut com redirectTo /login" — PASSOU
- [x] **AC 6** (toda action barrada sem sessão) → `carousel-actions.test.ts`:"barreira de sessão" (6 testes, um por action + o "sem sessão → redirect, query nunca roda") — PASSOU
- [x] **AC 9 / 23** (authz por dono; filtro ownerId em toda query) → `carousel-actions.test.ts`:"authz por dono — ownerId da sessão no filtro" (get/save/delete filtram; outro dono → notFound) — PASSOU
- [x] **AC 10** (identidade fixa por cliente + override por carrossel) → `carousel-mapping.test.ts`:"resolveIdentity — herança por campo" (nenhum/total/parcial) + `resolveTheme` — PASSOU
- [x] **AC 14** (validação 6 MB + tipo no server) → `blob-upload-route.test.ts` (sessão exigida 401; allowedContentTypes + maximumSizeInBytes = 6 MB) + `image-upload.test.ts` (validação client, já existia) — PASSOU
- [x] **AC 16 / 17** (salvar; reordenação persistida) → `carousel-actions.test.ts`:"saveCarousel — transação replace-all" + `carousel-mapping.test.ts`:"slidesToRows — position segue a ordem" e "rowToEditorState ordena por position" — PASSOU
- [x] **AC 18** (listar só os do dono) → `carousel-actions.test.ts`:"listCarousels — só os do dono" — PASSOU
- [x] **AC 19** (reabrir: estado resolvido, slides na ordem) → `carousel-mapping.test.ts`:"rowToEditorState — montagem do EditorState" — PASSOU
- [x] **AC 22** (Zod nas bordas; malformado rejeitado sem efeito) → `save-carousel-schema.test.ts` (10 casos de rejeição + 4 de aceite) + `carousel-actions.test.ts`:"entrada malformada rejeita antes de qualquer efeito" + `auth-actions.test.ts`:"validação de borda" — PASSOU

## Edge cases cobertos

- **override parcial não materializa herdados** → `carousel-mapping.test.ts`:"identityToOverride — não materializa herdados" (campo igual→null; diferente→valor; round-trip) — PASSOU
- **verified=false ≠ null** (`??` não confunde false com herança) → `carousel-mapping.test.ts`:"override verified=false é distinto de null" e "verified diferente do client materializa mesmo sendo false" — PASSOU
- **carrossel de outro dono** (id manipulado) → `carousel-actions.test.ts`:"getCarousel/saveCarousel/deleteCarousel de OUTRO dono => notFound" — PASSOU
- **reordenação persistida** → `carousel-mapping.test.ts`:"reordenar o array muda as positions" — PASSOU
- **sessão inválida/expirada** → `carousel-actions.test.ts`:"sem sessão, requireUser redireciona e a query nunca roda" — PASSOU
- **upload inválido (tipo/tamanho)** → `image-upload.test.ts` (client) + reforço server em `blob-upload-route.test.ts` — PASSOU
- **título vazio no banco cai no default** → `carousel-mapping.test.ts`:"título vazio no banco cai no DEFAULT_CAROUSEL_TITLE" — PASSOU
- **0 slides (shape vazio coerente)** → `carousel-mapping.test.ts`:"0 slides: shape vazio coerente" — PASSOU

## Notas de estratégia de mock

- **`carousel-actions.test.ts`** mocka `@/db` com um query-builder encadeável (thenable)
  cujo resultado final é configurável por teste, e captura os argumentos de `.where()`.
  A prova de "ownerId da sessão entra no filtro" usa uma varredura recursiva do objeto
  `where` do Drizzle (o valor comparado fica em campos internos, não em JSON.stringify),
  com asserção de **discriminação** (um id inexistente NÃO aparece) para o teste não ser
  trivial. A prova de authz também é **comportamental**: query vazia (outro dono) → `notFound()`.
  `@/lib/auth-guard`, `next/navigation` (notFound/redirect) e `db.transaction` também mockados.
- **`auth-actions.test.ts`** mocka `@/auth` e `next-auth` (AuthError) — evita arrastar
  `server-only`/`@/db`. Testa o comportamento observável do login sem subir o Auth.js real.
- **`blob-upload-route.test.ts`** mocka `@vercel/blob/client` de modo que `handleUpload`
  **invoca** o `onBeforeGenerateToken` real da rota — testa a regra da rota, não a lib.

## O que ficou coberto por VERIFICAÇÃO MANUAL (e por quê)

Documentado para o Validator (07). Estes exigem Postgres/Blob reais ou o runtime do
Auth.js — impossíveis em jsdom sem mocks pesados e frágeis (contra a skill mocking-estratégico):

- **AC 1** (login com senha correta → autenticado e redirecionado): o `authorize` do
  Auth.js está aninhado em `NextAuth({...})` (não exportado isoladamente) e depende de
  `bcrypt.compare` + query real. Verificado no backend-notes (login→salvar→reabrir manual).
- **AC 3** (senha hasheada com bcryptjs; nada em texto puro): garantido pelo seed
  (`bcrypt.hash` cost 12) — verificação por inspeção do banco, não unit.
- **AC 4** (sessão JWT persiste ao reabrir o navegador): comportamento do cookie do Auth.js.
- **AC 8** (schema Drizzle + migrations num banco limpo): confirmado no backend-notes
  (`drizzle-kit generate`/`migrate` aplicados no Neon; tabelas verificadas).
- **AC 11** (contrato `<Slide>`/`SlideData` intacto): garantido pela regressão S2 verde
  (slide.test.tsx + png-dimensions) + `src/components/slide/*` não tocado.
- **AC 13** (upload real de fluxo end-to-end no Blob): a validação client/server está
  coberta; o upload físico ao Blob é integração real (manual).
- **AC 20/21/24** (novo carrossel end-to-end; texto removido; env sem segredo): UI/config,
  verificados por inspeção (frontend-notes confirma texto removido; `.env.example` sem valores).
- **`saveCarousel` — persistência real da ordem no banco**: os testes provam que a action
  entra na transação e que `slidesToRows`/replace-all produz `position = índice`; a
  materialização física (INSERT ordenado) é integração real (smoke manual do backend-notes).

## Bugs encontrados

**Nenhum.** Toda a suíte passou sem exigir alteração de código de produção. O núcleo puro
(`carousel-mapping.ts`), os schemas Zod, a authz por dono das actions, a barreira de sessão,
a msg genérica de login e o reforço de 6 MB no server comportaram-se exatamente como o
contrato do backend-notes descreve.

## Status final

- **137 testes, 137 passaram, 0 falharam** (70 S2 + 67 S3).
- `type-check` limpo.
- Sem regressão da S2 (AC 12 ✔).
- Sem bug de produção. Pronto para o estágio 07-validator.
