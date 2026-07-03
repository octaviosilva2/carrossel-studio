# Validação — S3: Persistência + Auth + Storage

> Estágio 07-validator. Auditoria independente da entrega S3 contra os 24 critérios
> de aceite da story. Ninguém que escreveu o código escreveu esta validação.
> Evidência acima de afirmação: cada AC tem `arquivo:linha`, teste ou motivo de pendência.

## Comandos rodados por mim (não confiei no relato)

| Comando | Resultado |
|---|---|
| `npm run type-check` (`tsc --noEmit`) | **Sem erros** (saída vazia, exit 0) |
| `npx vitest run` | **137 passaram / 0 falharam** (10 arquivos) |
| `npm run build` (`next build`) | **Compilou** — 8 rotas geradas; "Skipping linting" (ESLint off no build, herdado S1) |

Saída da suíte (10 arquivos, todos verdes):
```
✓ tests/image-upload.test.ts (7)         ← S2
✓ tests/carousel-mapping.test.ts (24)    ← S3
✓ tests/editor-reducer.test.ts (43)      ← S2
✓ tests/png-dimensions.test.ts (4)       ← S2
✓ tests/blob-upload-route.test.ts (4)    ← S3
✓ tests/save-carousel-schema.test.ts (14)← S3
✓ tests/auth-actions.test.ts (6)         ← S3
✓ tests/slide.test.tsx (11)              ← S2
✓ tests/carousel-actions.test.ts (19)    ← S3
✓ tests/editor-page.test.tsx (5)         ← S2 (migrado p/ EditorClient, mesma cobertura)
Test Files 10 passed | Tests 137 passed
```

Rotas do build: `/`, `/login`, `/carousels`, `/editor`, `/api/auth/[...nextauth]`, `/api/blob/upload`, `/render-test`, `/_not-found`.

---

## Critérios de aceite

### A. Autenticação e proteção de rotas

| AC | Veredito | Evidência |
|---|---|---|
| 1. Login por senha → autenticado e redirecionado | ATENDE (verificação manual pendente) | Fluxo implementado: `src/auth.ts:32-51` (`authorize`: Zod → busca user → `bcrypt.compare`), `signInAction` redireciona p/ `/carousels`. O `authorize` está aninhado em `NextAuth({})`, não testável em unit sem Postgres+Auth.js runtime. **Falta:** smoke real login com senha correta. |
| 2. Senha errada falha fechado, msg genérica | ATENDE | `src/auth.ts:45,48` retorna `null` sem revelar qual campo; `signInAction` → `{ error: 'E-mail ou senha inválidos' }`. Teste `auth-actions.test.ts` "credenciais inválidas => mensagem genérica" PASSOU. |
| 3. Senha hasheada (bcryptjs), nada em texto puro | ATENDE (verificação manual pendente) | `scripts/seed.mjs:55` `bcrypt.hash(pwd, 12)`; comparação via `compare` em `auth.ts:47`; grep por segredos limpo. **Falta:** inspeção do banco real confirmando hash (não texto puro). |
| 4. Sessão JWT persiste ao reabrir navegador | ATENDE (verificação manual pendente) | `auth.ts:21` `session.strategy: 'jwt'`. **Nota:** story pedia "database"; gate 2 aprovou JWT (Opção A da spec §0 — obrigatório com Credentials no Auth.js v5). Comportamento do cookie é runtime → **falta** smoke: reabrir navegador dentro da validade. |
| 5. Logout invalida sessão | ATENDE | `signOutAction()` → `signOut()` + redirect `/login`. Teste `auth-actions.test.ts` "chama signOut com redirectTo /login" PASSOU. Ressalva por design (spec §7): JWT stateless não revoga server-side — limpa o cookie (aceitável p/ 1 admin, documentado). |
| 6. Rotas protegidas via `auth()` no server (não Edge) | ATENDE | `requireUser()` (`auth-guard.ts:19-29`) redireciona p/ `/login` sem sessão; usado no topo de toda action (`carousels.ts:66,100,125,172,244`) e páginas (`carousels/page.tsx`, `editor/page.tsx`). Sem middleware Edge. Teste `carousel-actions.test.ts` "barreira de sessão" (6 casos) PASSOU. |
| 7. Sem signup público | ATENDE | Nenhuma rota/action de cadastro existe; conta só por `scripts/seed.mjs`. Build lista só `/login` e `/carousels` — sem `/signup`. Frontend-notes confirma "sem signup". |

### B. Schema, migrations e isolamento por dono

| AC | Veredito | Evidência |
|---|---|---|
| 8. Schema Drizzle + migration versionada rodável | ATENDE (verificação manual pendente) | `src/db/schema.ts` (users/clients/carousels/slides, FKs, índices, unique) bate com spec §1. Migration `drizzle/0000_damp_energizer.sql` no disco, não ignorada no `.gitignore`. **Falta:** rodar `db:migrate` num banco limpo eu mesmo (backend-notes relata sucesso no Neon, não verifiquei). |
| 9. Toda entidade de conteúdo tem dono; toda query filtra por dono | ATENDE | `schema.ts:57` `carousels.ownerId` FK; **todas** as queries de carousel filtram `ownerId`: `list` (`:109`), `get` (`:135`), `save` (`:181` + reforço na escrita `:220`), `delete` (`:252`). `getCarousel` busca slides só após validar o carousel por dono (authz transitiva, `:150-157`). Teste `carousel-actions.test.ts` "authz por dono — ownerId no filtro" PASSOU. |
| 10. Identidade fixa por cliente + override por carrossel; nulo herda | ATENDE | `resolveIdentity` (`carousel-mapping.ts:65-75`) override-por-campo `?? client`; `verified: false` distinto de `null` via `??`. Testes `carousel-mapping.test.ts` (herança nenhuma/parcial/total + verified=false) PASSARAM. |
| 11. Contrato `<Slide>`/`SlideData` intacto | ATENDE | `src/components/slide/*` não tocado (frontend-notes + backend-notes confirmam "não tocar"). Regressão `slide.test.tsx` (11) + `png-dimensions` (4) verde. |
| 12. Sem regressão S2 (70 testes verdes) | ATENDE | 70 testes S2 verdes dentro dos 137 (image-upload 7 + editor-reducer 43 + png-dimensions 4 + slide 11 + editor-page 5). Ampliação de `EditorState` (`carouselId?`, `title?`) é aditiva/opcional (backend-notes desvio 1). Rodado por mim. |

### C. Upload real de imagem (Vercel Blob)

| AC | Veredito | Evidência |
|---|---|---|
| 13. Upload real avatar + slide via client upload; URL https guardada | ATENDE (verificação manual pendente) | `blob-upload.ts:26` `upload()` do `@vercel/blob/client` → grava `blob.url`; `identity-panel.tsx`/`slide-editor.tsx` trocam data-URL por `uploadImageToBlob` (frontend-notes). **Falta:** upload físico real ao Blob (integração, precisa `BLOB_READ_WRITE_TOKEN` + browser). |
| 14. Validação 6 MB + tipo no client E no server | ATENDE | Client: `blob-upload.ts:20` `validateImageFile` (reusa `MAX_IMAGE_BYTES`, `image-upload.ts:6`). Server: `route.ts:29-31` `allowedContentTypes` png/jpeg/webp + `maximumSizeInBytes = MAX_IMAGE_BYTES`. Server é **mais restritivo** que o client (falha fechado). Teste `blob-upload-route.test.ts` (4) PASSOU. |
| 15. Nota S4 (Blob→data-URL no export) registrada, não implementada | ATENDE | Só guarda a URL do Blob; nenhuma conversão/export introduzida. `src/lib/export-png.ts` não tocado. Nada impede a conversão futura. |

### D. Salvar, listar e reabrir (ligar o editor da S2)

| AC | Veredito | Evidência |
|---|---|---|
| 16. Salvar persiste + UI salvando→salvo→erro | ATENDE | `saveCarousel` (`carousels.ts:169-235`) transação replace-all; `editor-client.tsx:100-113` estado `saving→saved→error` (`aria-live`, `role=alert`), erro não afirma "salvo" e preserva estado. Teste `carousel-actions.test.ts` "saveCarousel — transação replace-all" PASSOU. Persistência física = pendente manual. |
| 17. Reordenação persistida | ATENDE (verificação manual pendente) | `slidesToRows`/replace-all: `position = índice` (`carousels.ts:199,224-231`); `rowToEditorState` ordena por `position` (`mapping.ts:99`). Testes de ordem PASSARAM. **Falta:** INSERT ordenado físico no Postgres (integração — smoke reabrir após reordenar). |
| 18. Listar só os meus | ATENDE | `listCarousels` (`carousels.ts:99-117`) `WHERE ownerId`, ordena `updatedAt desc`. Teste "listCarousels — só os do dono" PASSOU. |
| 19. Reabrir por id → estado resolvido + ordem | ATENDE (verificação manual pendente) | `getCarousel` → `rowToEditorState` (identidade/tema resolvidos, slides ordenados, `selectedSlideId`=1º). Testes de montagem PASSARAM. **Falta:** reabrir real via UI (integração DB). |
| 20. Novo carrossel herda identidade padrão + salva 1ª vez | ATENDE (verificação manual pendente) | `createCarousel` (`carousels.ts:65-93`) usa 1º client do dono, overrides null, 1 slide vazio; `/editor` sem id → cria e redireciona. **Falta:** fluxo real (precisa seed do client). |
| 21. Texto "Nada é salvo nesta fatia" removido | ATENDE | Grep por "Nada é salvo"/"nesta fatia" em `src/` → **nenhum match**. |

### E. Baseline de segurança

| AC | Veredito | Evidência |
|---|---|---|
| 22. Zod nas bordas (login, save/list/get, upload) | ATENDE | Login: `auth.ts:15-18` + `signInAction`. Save: `SaveCarouselSchema` (`carousel-types.ts:23-29`) `.parse` em `carousels.ts:175` (lança antes de tocar banco). get/delete: `uuidSchema.safeParse`. Upload: tipos/tamanho no handler. Testes `save-carousel-schema.test.ts` (14) + "malformada rejeita antes de efeito" PASSARAM. |
| 23. Authz por dono em toda leitura/escrita | ATENDE | Ver AC 9. Nenhuma query de carousel confia em id do client sem `AND ownerId`; id de outro dono → `notFound()` (404, não vaza existência). `save` reforça `ownerId` até na escrita da transação (`:220`). Teste "outro dono => notFound" PASSOU. |
| 24. Sem segredo no código; `.env.example` documenta | ATENDE | Grep por `postgres://`, `sk-`, `vercel_blob_rw_`, `AUTH_SECRET=`, senhas → nenhum segredo real (único "password" é fixture `"senha-ok"` em teste). `.env.local` no `.gitignore` (`git check-ignore` confirma); nenhum `.env` rastreado; `.env.example` versionado, 6 chaves sem valores. Env validado por Zod (`env.ts`). |

---

## Edge cases

| Edge case | Tratado? | Evidência |
|---|---|---|
| Sessão expirada/inválida | Sim | `requireUser()` redireciona; teste "sem sessão, query nunca roda" PASSOU. |
| Upload inválido (tipo/>6 MB) | Sim | Client `validateImageFile` + server `maximumSizeInBytes`/`allowedContentTypes`. Testes client + route PASSARAM. |
| Carrossel de outro dono (id manipulado) | Sim | `AND ownerId` em toda query → `notFound()`. Testes get/save/delete "de OUTRO dono => notFound" PASSARAM. |
| Override parcial (nulos herdam, não materializa) | Sim | `identityToOverride` grava `null` se igual ao client (`mapping.ts:135-147`). Teste "não materializa herdados" + round-trip PASSOU. |
| Reordenação persistida | Sim | AC 17 (persistência física pendente de smoke). |
| Salvar com falha de rede/banco | Sim | `editor-client.tsx:105-112` catch → estado "error", não afirma salvo, preserva memória. |
| Reabrir inexistente/removido | Sim | `getCarousel` → `notFound()` (404 do Next), não quebra editor. |
| Avatar nunca vazio | Sim | Placeholder SVG same-origin no seed (`seed.mjs:40`) + `avatarUrl` do save aceita `min(1)` (data-URL default). Upload só substitui em sucesso. |

---

## Segurança (auditoria ativa — OWASP)

Percorri seguindo o dado não confiável da entrada ao uso:

- **Injeção (SQL):** 🟢 nenhum achado. Actions usam Drizzle parametrizado (`eq`/`and`); seed usa placeholders `$1..$6` (`seed.mjs:63,69`). Nenhuma concatenação de input em query.
- **Quebra de authz / IDOR:** 🟢 coberto. Todo acesso a carousel filtra `ownerId` da sessão; id do client nunca decide dono. `notFound()` não distingue "não existe" de "não é seu" (não vaza existência).
- **Exposição de dados:** 🟢 erros ao usuário são genéricos (`"Falha no upload."`, `"E-mail ou senha inválidos"`); `env.ts:24` nunca imprime valores, só nomes de chave; seed nunca imprime a senha (`seed.mjs:87`).
- **Autenticação fraca:** 🟢 bcrypt cost 12; msg genérica (não revela se email existe); Zod na borda do `authorize`. Ressalva conhecida: JWT sem revogação server-side (design aprovado, 1 admin).
- **XSS:** 🟢 sem `dangerouslySetInnerHTML` com dado de usuário na fatia; render via React. `<Slide>` intacto.
- **Segredos/config:** 🟢 nenhum segredo no repo; `.env.local` ignorado; `.env.example` sem valores.
- **Upload/superfície:** 🟢 token do Blob só p/ logado (`route.ts:25-27` → 401); server restringe tipo (png/jpeg/webp) e tamanho — mais restritivo que o client.

**Nenhum furo de segurança 🔴/🟡 encontrado.**

---

## Escopo

- **Faltou algo do escopo?** Não. Os 24 ACs estão endereçados (14 plenamente verificáveis por mim; 10 dependem de runtime real — ver pendências).
- **Entregou além?** Não. Sem export/IA/multi-cliente/signup (todos corretamente fora). `createCarousel` já cria 1 slide vazio — coerente com S2, dentro do escopo.
- **Desvios documentados (todos justificados, sem furo):**
  - AC 4: sessão **JWT** no lugar de "database" — obrigatório com Credentials no Auth.js v5 (gate 2 aprovado, spec §0). **Não é furo:** é a decisão aprovada; apenas registro que o texto da story AC 4 foi substituído pelo gate.
  - `SaveCarouselSchema`/tipos movidos p/ `carousel-types.ts` (módulo neutro) — exigência estrutural do Next 15 (`"use server"` só exporta funções async). Contrato inalterado.
  - `title` opcional em `EditorState` (aditivo, preserva os 70 testes S2).
  - `src/app/page.tsx` foi entregue no 05 (redirect `/`→`/carousels`), não no 04 — coberto.

---

## Riscos do research (01) / spec (07)

| Risco | Estado |
|---|---|
| CORS/export S4 (Blob→data-URL) | **Tratado (preventivo):** só guarda URL do Blob; export não implementado; nada impede conversão futura. AC 15. |
| Session database × Credentials (conflito Auth.js) | **Resolvido:** Opção A (JWT) aprovada no gate 2. |
| `next-auth@beta` breaking changes | **Mitigado:** versão fixada (`--save-exact`); type-check + build verdes. |
| Driver Neon + transações no `saveCarousel` | **De pé (verificação manual pendente):** código usa `db.transaction()` (Pool+ws); backend-notes relata funcionamento no Neon, mas **não rodei transação real**. Smoke de save físico fecha isto. |

---

## Pendências de verificação manual (o humano/CEO precisa rodar antes de "produção")

Estas exigem Postgres/Blob/runtime reais — corretamente impossíveis na suíte jsdom (mocking-estratégico). Não são defeitos; são o que a auditoria automatizada não alcança:

1. **AC 1/3/4** — login real com senha correta → redireciona; sessão JWT sobrevive a reabrir o navegador; hash bcrypt no banco (não texto puro).
2. **AC 8** — `npm run db:migrate` num banco Neon limpo produz as 4 tabelas + índices + unique.
3. **AC 13/16/17/19/20** — smoke fim-a-fim: seed → login → novo carrossel → upload avatar/slide (URL https) → salvar → reordenar → salvar → reabrir na mesma ordem, com imagens.
4. **Transação `saveCarousel`** — replace-all atômico funciona no driver Neon serverless real (risco residual da spec §7).

Recomendação: um roteiro de smoke manual de ~10 min cobre todas.

---

## Veredito

**APROVAR COM RESSALVAS.**

Justificativa: os 24 ACs estão implementados com evidência; type-check limpo, **137/137 testes verdes** (70 S2 sem regressão), build compila; segurança sem furo (Zod nas bordas, authz por dono em toda query, zero segredo no repo, bcrypt). As ressalvas são **10 ACs cujo fechamento pleno depende de runtime real** (Postgres/Blob/navegador) — não verificáveis em jsdom e listados acima como smoke manual. Nenhum achado 🔴/🟡 bloqueante; a única troca de contrato (JWT × database, AC 4) foi decisão aprovada no gate 2, não desvio.

**Achado 🟢 (não bloqueia):** ESLint segue `ignoreDuringBuilds: true` no `next.config.mjs` (dívida herdada da S1, fora do escopo S3) — build não roda lint. Registrar como follow-up, não devolver.

---

## GATE HUMANO

Recomendação: **aprovar a S3** condicionada ao Octavio rodar o roteiro de smoke manual (4 itens acima) num ambiente com Neon + Blob + `.env.local` preenchido. Se o smoke passar, os 10 ACs pendentes fecham e a S3 está pronta. **A palavra final é do CEO.**
