# Testes — Geração de carrossel com IA (Porta A, S5)

> Estágio 06. Prova os critérios de aceite e edge cases da story com testes que
> rodaram de verdade. A fronteira Anthropic é **sempre mockada** (nunca chama a
> Claude API real — custo + segurança + a chave não é lida nos unit). Segue a infra
> existente: vitest (`vitest.config.ts`, jsdom, alias `@`), pasta `tests/`, mesmo
> estilo dos testes da S3 (mock de fronteiras externas via `vi.hoisted` + `vi.mock`).

## Arquivos de teste criados
- `tests/generate-schema.test.ts` — camada 2 (Zod nosso): `GenerateInputSchema` +
  `GeneratedCarouselSchema`. **24 testes.**
- `tests/generate-sanitize.test.ts` — camada 3 (sanitização pura): `sanitizeGeneratedText`.
  **14 testes.**
- `tests/generate-mapping.test.ts` — mapeamento `mapGeneratedToSlideRows` + contrato via
  `rowToEditorState`. **9 testes.**
- `tests/generate-action.test.ts` — server action `generateCarousel` com a fronteira
  Anthropic, a persistência, o guard de sessão e `next/navigation` mockados. **12 testes.**

**Total: 59 testes novos.**

## Critérios de aceite → testes

- [x] **AC-1 (acesso, sem login não chega à API)** → `generate-action.test.ts` › "barreira de
  sessão" › "sem sessão, requireUser redireciona e a Claude API nunca é chamada" +
  "requireUser é chamado antes de qualquer chamada à API" — **PASSOU.**
- [x] **AC-2 (intenção → geração validada por Zod)** → `generate-schema.test.ts` (input aceito
  no range; caminho feliz da action gera + persiste) + `generate-action.test.ts` › "caminho
  feliz" — **PASSOU.**
- [x] **AC-3 (aterrissagem no editor com carrossel novo)** → `generate-action.test.ts` › "intenção
  válida => gera, persiste e redireciona ao editor com o novo id" (`/editor?id=<novo>`) +
  `generate-mapping.test.ts` › "linhas geradas produzem EditorSlide com id gerado e imageUrl
  undefined" — **PASSOU.**
- [x] **AC-4 (só texto/estrutura; tema herda default)** → `generate-mapping.test.ts` (carousel
  data com overrides null => herda tema/identidade via `rowToEditorState`; a IA só define
  title + bodies + nº/ordem) — **PASSOU.** (Coberto também em `carousel-actions.test.ts` para
  a escrita: overrides null.)
- [x] **AC-5 (sugestão de imagem sinalizada, sem imageUrl)** → `generate-mapping.test.ts` ›
  "sinal de imagem" (dica textual no body quando `suggestImage=true`; **nunca** preenche
  `imageUrl`) + `generate-action.test.ts` › "persiste a estrutura sanitizada/mapeada" — **PASSOU.**
- [x] **AC-6 (regenerar)** → coberto estruturalmente: cada geração é uma chamada independente à
  action que cria um carrossel novo (`generate-action.test.ts` › caminho feliz). Regeneração =
  reabrir a tela e chamar de novo — sem mecanismo extra. (Sem teste dedicado por ser o mesmo
  fluxo do AC-3; ver "O que ficou de fora".)
- [x] **AC-7 (regras visuais no texto: pt-BR, sem emoji/markdown, `\n\n`, ≤2000)** →
  `generate-sanitize.test.ts` (remove emojis/markdown/HTML; colapsa `\n\n`; trim; preserva
  pt-BR) + `generate-schema.test.ts` (body ≤2000 no `GeneratedCarouselSchema`) — **PASSOU.**
- [~] **AC-8 (feedback de estado "gerando…" + controles desabilitados)** → é comportamento de UI
  do `generate-client.tsx`; **não coberto por teste automatizado** nesta suíte (ver "O que ficou
  de fora"). Verificado por leitura de código no 05/07.
- [x] **AC-9 (erro tratado, nenhum carrossel quebrado)** → `generate-action.test.ts` › "erros da
  fronteira Anthropic tratados" (refusal e JSON inválido → `GENERATION_FAILED`, nada persistido;
  0 slides úteis → `GENERATION_FAILED`) + `generate-schema.test.ts` (estrutura ruim rejeitada) —
  **PASSOU.**
- [x] **AC-10 (chave ausente)** → `generate-action.test.ts` › "chave ausente (NOT_CONFIGURED)
  propaga o código e NÃO persiste" — **PASSOU.**

## Edge cases cobertos
- **Intenção vazia** → `generate-schema.test.ts` "rejeita intenção vazia" + `generate-action.test.ts`
  "intenção vazia => INVALID_INPUT sem chamar a API" — **PASSOU.**
- **Intenção só espaços** → `generate-schema.test.ts` "rejeita intenção só com espaços (trim)" —
  **PASSOU.**
- **Intenção curta (<10)** → schema + action "intenção curta (<10) => INVALID_INPUT SEM chamar a
  Claude API" — **PASSOU.**
- **Intenção acima do limite (>1000)** → schema (1001 rejeitado; 1000 aceito) + action "intenção
  longa (>1000) => INVALID_INPUT sem chamar a API" — **PASSOU.**
- **Intenção pedindo emojis/formatação proibida** → `generate-sanitize.test.ts` "mesmo com o texto
  pedindo emojis, o resultado sai sem emoji" — **PASSOU.**
- **API refusal (HTTP 200, content vazio)** → `generate-action.test.ts` "refusal
  (GENERATION_FAILED) propaga o código e NÃO persiste" — **PASSOU.**
- **JSON malformado / nº de slides absurdo (0 ou >10)** → `generate-schema.test.ts` (0 slides, 11
  slides, body vazio, slides ausente, slide como string) + action (JSON inválido → não abre
  editor) — **PASSOU.**
- **Saída que sanitiza para 0 slides úteis** → `generate-mapping.test.ts` "retorna null quando
  todos os bodies zeram" + `generate-action.test.ts` "saída que sanitiza para 0 slides úteis =>
  GENERATION_FAILED, sem persistir" — **PASSOU.**
- **Duplo clique / geração concorrente** → comportamento de UI (controles desabilitados); não
  coberto aqui (ver "O que ficou de fora").
- **Sessão expira / sem sessão** → `generate-action.test.ts` "sem sessão... a Claude API nunca é
  chamada" (falha fechada, nada persistido) — **PASSOU.**

## Resultado da rodada

`npm test` (`vitest run`):
```
 Test Files  16 passed (16)
      Tests  230 passed | 1 skipped (231)
```
- **59 testes novos** desta fatia, todos passando (24 + 14 + 9 + 12).
- **171 testes anteriores continuam verdes** (230 = 171 + 59); **1 skip** pré-existente
  (`png-dimensions.test.ts`, ambiente sem browser) — inalterado. **Sem regressão.**
- **Nenhuma falha.**

`npm run type-check` (`tsc --noEmit`): **passou, zero erro** (respeitando
`noUncheckedIndexedAccess` — acessos indexados nos testes são afirmados antes de usar).

## Bugs encontrados
Nenhum. O código de produção não foi alterado para "fazer passar" — os testes provaram o
comportamento como está implementado.

## O que ficou de fora e por quê
- **AC-8 (loading/aria-live) e edge "duplo clique"** — são comportamento de UI do
  `generate-client.tsx` (estado `generating`, controles desabilitados, `aria-live`). Não há
  teste de componente para essa tela nesta suíte; o valor é melhor coberto por render-test/E2E,
  e a lógica (`canSubmit`/`isGenerating`) foi verificada por leitura no 05/07. Fora do escopo
  desta rodada de testes de unidade/integração da lógica de geração.
- **AC-6 (regenerar)** — sem teste dedicado: é literalmente o mesmo fluxo do AC-3 chamado de novo
  (cada geração cria carrossel novo). Cobrir de novo seria redundante.
- **Chamada REAL à Claude API (smoke)** — proibida em teste (custo/segurança; regra da spec). Fica
  como smoke manual quando o CEO validar a `/generate` no navegador com a chave ativa. A fronteira
  `requestGeneration` é sempre mockada aqui.
- **Params exatos enviados ao SDK Anthropic** (model/`thinking`/ausência de `temperature`) — vivem
  dentro de `requestGeneration` em `src/lib/claude.ts` (`server-only`, importa o SDK real). Testar
  isso exigiria injetar um client fake e importar o módulo server-only no jsdom; optou-se por
  mockar a fronteira inteira (o contrato observável é "intenção → estrutura validada ou
  GenerateError"). Os params estão fixados e revisados no backend/validação; um teste de params
  seria de implementação, não de comportamento observável.
