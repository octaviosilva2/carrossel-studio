# Validação — S5 Geração de carrossel com IA (Porta A)

**Auditor:** estágio 07 (validator, independente). **Data:** 2026-07-02.
**Método:** skills `verificacao-objetiva`, `code-review-rigoroso`, `analise-seguranca`.
Build/type-check/testes rodados por mim; cada AC julgado com evidência (`arquivo:linha` / teste).

> Nota de processo: ao iniciar a auditoria, o estágio 06 (testes) **ainda estava em
> andamento** — a suíte subiu de 195→218→230 durante as primeiras leituras (arquivos
> `generate-sanitize`/`generate-mapping`/`generate-action` gravados às 00:32). O veredito
> abaixo reflete o estado **final estável** (230 passed / 1 skip), reconfirmado por mim.

## Testes/build (rodados por mim)

- `npm run type-check` (`tsc --noEmit`) → **zero erro**.
- `npm run build` (`next build`) → **compilou**; rota `/generate` gerada (dinâmica, 3.32 kB,
  First Load 117 kB). "Skipping linting" — projeto sem ESLint no Next; o type-check do build cobre tipos.
- `npm test` (`vitest run`) → **230 passed / 1 skipped / 0 falha** (16 arquivos).
  - Testes S5: `generate-schema` (24) · `generate-sanitize` (14) · `generate-mapping` (9) ·
    `generate-action` (12). Sem regressão nos 171 testes anteriores (S1–S4 verdes).
  - O 1 skip é herdado da S1 (`png-dimensions` — smoke de export, não S5).

> Contexto da tarefa citava "238 passed"; o número real reconfirmado é **230** (a diferença
> não indica falha — nenhuma falha na suíte; provavelmente contagem estimada no handoff).

## Critérios de aceite

- [x] **AC-1 (acesso)** — CUMPRIDO. `page.tsx:13` `await requireUser()` antes de renderizar;
  `auth-guard.ts:22` faz `redirect("/login")` real. A action `generate.ts:40` repete
  `requireUser()` no topo. Teste `generate-action.test.ts:229` prova que sem sessão a
  Claude API **nunca** é chamada. Sem chave no cliente (chamada 100% server-only, `claude.ts:10`).
- [x] **AC-2 (intenção → geração)** — CUMPRIDO. `generate.ts:43` Zod na borda
  (`GenerateInputSchema`, 10..1000); `requestGeneration` chama `messages.parse` e revalida
  com `GeneratedCarouselSchema` (`claude.ts:98`). Testes `generate-schema.test.ts:36-83`
  (borda) e `generate-action.test.ts:104` (fluxo feliz).
- [x] **AC-3 (aterrissagem no editor)** — CUMPRIDO. `createGeneratedCarousel` insere carrossel
  novo + N slides em transação (`carousels.ts:119`); `generate.ts:62` `redirect("/editor?id=<novo>")`.
  Reusa `rowToEditorState` sem tocar reducer/contrato — provado em `generate-mapping.test.ts:170`
  (linhas geradas viram `EditorSlide` válidos, id gerado, imageUrl undefined). Carrossel
  anterior intocado (id novo). `generate-action.test.ts:104` confere a URL de redirect.
- [x] **AC-4 (só texto e estrutura)** — CUMPRIDO. Schema gerado só tem `title` + `slides[{body,
  suggestImage}]` (`generate-types.ts:30`); `createGeneratedCarousel` grava `overrides null`
  → **tema herda o default** (`carousels.ts:126`, comentário explícito). System prompt proíbe
  cor/fonte/tema/HTML (`generate-prompt.ts:26-35`).
- [x] **AC-5 (sugestão de imagem)** — CUMPRIDO (com a decisão aprovada de dica textual).
  `suggestImage:true` acrescenta `IMAGE_HINT` ao final do body (`generate-sanitize.ts:108`);
  `imageUrl` **nunca** preenchido. Testes `generate-mapping.test.ts:59-94` (dica presente só
  quando true; imageUrl sempre null). Não viola `SlideData` — é só `body`. Confirmado no gate
  (STATUS: dica textual vs. placeholder — CEO escolheu textual).
- [x] **AC-6 (regenerar)** — CUMPRIDO (por design). Cada geração cria carrossel novo; regenerar
  = reabrir `/generate`, editar intenção e gerar de novo. Client preserva/limpa estado
  (`generate-client.tsx:61`). Refino conversacional está fora de escopo (declarado).
- [x] **AC-7 (regras visuais no texto)** — CUMPRIDO. Sanitização remove emojis/markdown/HTML e
  normaliza `\n\n` (`generate-sanitize.ts:37-67`); testes `generate-sanitize.test.ts:14-99`
  (remove emoji mesmo se o texto pedir; remove `* _ \` #` e tags; colapsa 3+ quebras; preserva
  pt-BR). Teto `body ≤ 2000` no Zod (`generate-types.ts:35`). System prompt sem emojis (verificado
  por mim: 0 emoji no arquivo). Rede de segurança **além** do prompt — como a story exige.
- [x] **AC-8 (feedback de estado)** — CUMPRIDO. `generate-client.tsx`: `isGenerating` desabilita
  textarea+botão (`:125,:152`), botão vira "Gerando…", região `aria-live="polite"` anuncia
  (`:160`). Guarda `if (!canSubmit) return` + `!isGenerating` no `canSubmit` (`:52,:74`) →
  um pedido por vez (edge "duplo clique").
- [x] **AC-9 (erro tratado)** — CUMPRIDO. `GenerateError` com `code` estável (`generate-types.ts:60`);
  `claude.ts` traduz rate-limit/auth/timeout/refusal/JSON-fora-do-contrato → `GENERATION_FAILED`
  (`:69-102`), logando só status HTTP (nunca `.message`/chave). Client mapeia **todos** os
  codes para a mesma mensagem genérica pt-BR (`generate-client.tsx:20,:87`). Nenhum carrossel
  quebrado: testes `generate-action.test.ts:151-196` provam que refusal/JSON/0-slides **não
  persistem**.
- [x] **AC-10 (chave ausente)** — CUMPRIDO (via validação lazy, decisão do CEO). `claude.ts:31`
  lê `ANTHROPIC_API_KEY` lazy; ausente → `GenerateError("NOT_CONFIGURED")`, sem expor valor,
  **sem derrubar o resto do app** (`env.ts` intacto — app sobe sem a chave; build passou sem
  ela no boot). Teste `generate-action.test.ts:152` (NOT_CONFIGURED não persiste).

## Edge cases

- **Intenção vazia / só espaços** — tratado. `trim().min(10)` no Zod; teste `generate-schema.test.ts:44-53`.
  UX bloqueia o botão (`generate-client.tsx:52`).
- **Intenção acima do limite (>1000)** — tratado na borda; teste `generate-schema.test.ts:70`
  e `generate-action.test.ts:218` (INVALID_INPUT sem chamar API).
- **Pede emojis/markdown** — tratado. Sanitização remove server-side; teste `generate-sanitize.test.ts:33`.
- **Refusal (HTTP 200, content vazio)** — tratado. `claude.ts:84` checa `stop_reason==="refusal"`
  antes de ler; teste `generate-action.test.ts:161`.
- **JSON malformado / nº de slides absurdo (0 ou >10)** — tratado. Zod nosso rejeita
  (`generate-schema.test.ts:120-193`); `parsed_output null` → GENERATION_FAILED (`claude.ts:91`).
- **Timeout/latência** — tratado. `APIConnectionError`/APIError → GENERATION_FAILED (`claude.ts:74`);
  estado "gerando…" persiste até resolver.
- **Duplo clique / geração concorrente** — tratado. Controles desabilitados + guarda `canSubmit`.
- **Sessão expira durante a geração** — tratado (falha fechada). `createGeneratedCarousel` chama
  `requireUser()` de novo (`carousels.ts:110`): se a sessão cair após a chamada à API, a
  persistência falha fechada — **não cria carrossel órfão**. Guarda dupla (action + escrita).

## Segurança (skills analise-seguranca / seguranca-baseline)

- **Authz por dono** — 🟢 OK. `ownerId: user.id` **sempre da sessão** (`carousels.ts:123`), nunca
  do cliente. Aterrissagem via `getCarousel` já filtra por dono (`notFound()` para id alheio,
  S3). Sem IDOR: o `id` do redirect é de carrossel recém-criado pelo próprio dono.
- **Prompt injection** — 🟢 OK. Intenção (não confiável) vai **só** na mensagem `user`
  (`claude.ts:67`); regras no `system`. Structured output + Zod + sanitização contêm o dano
  mesmo se o usuário pedir "ignore as regras / use emojis". Prompt instrui explicitamente a
  tratar a intenção como conteúdo, não como instrução (`generate-prompt.ts:35`).
- **Segredo** — 🟢 OK. Chave lida via `process.env`, nunca no código/commit; `.env.example` só
  com placeholder; log jamais imprime `.message`/chave (só status HTTP). Chamada 100% server-only.
- **Vazamento de erro** — 🟢 OK. Cliente recebe só mensagem genérica pt-BR; `code` técnico fica
  em log/testes. Sem stack trace ao usuário.
- **Validação de entrada** — 🟢 OK. Zod na borda (tamanho/tipo) antes de qualquer chamada cara.
- **Dependência nova** — 🟢 OK. `@anthropic-ai/sdk@^0.109.1` (oficial), peer zod `^4.0.0`
  compatível com o zod 4.4.3 do projeto; `zodOutputFormat` usado sem fallback.

Nenhum achado 🔴/🟡 de segurança.

## Escopo

- **Sem extra indevido.** Nada fora da story foi implementado; `SlideData`/`EditorSlide`/reducer
  intactos (contratos imutáveis respeitados). `createCarousel` e demais actions da S3 não alteradas.
- **Sem falta funcional.** Todos os 10 ACs cobertos.
- **Fora de escopo respeitado** (refino conversacional, substituir/acrescentar, IA escolher tema,
  imageUrl automático, cota, streaming, link como fonte) — nenhum virou furo.
- **Desvios de spec são legítimos e registrados:** modelo `claude-sonnet-4-6` (decisão CEO
  2026-07-02, não `opus` da spec); validação lazy da chave (decisão CEO, não boot); `unstable_rethrow`
  no lugar de `isRedirectError` (símbolo não exportado publicamente pelo Next 15). Todos coerentes.

## Riscos do research (01)

- **Compat helper zod v4** — RESOLVIDO. Confirmado compatível; usado sem fallback.
- **Chave ausente derrubar o app** — RESOLVIDO. Validação lazy → app sobe sem a chave (build passou).
- **Prompt injection** — MITIGADO (ver Segurança).
- **Custo/latência sem cota** — DE PÉ (aceito). Proteção só por login + um pedido por vez; cota é
  fatia futura por decisão do CEO. 🟢 endurecimento sugerido, não bloqueio (ver abaixo).
- **Fonte woff2 no export Linux (herdado S1)** — DE PÉ, fora do escopo da S5; afeta o PNG final,
  não a lógica de geração.

## Smoke manual (só a chamada real à Claude API no navegador prova)

Nenhum teste automatizado chama a Claude API real (correto — custo/segurança; mocka-se a fronteira).
Fica como smoke manual quando o CEO validar (chave já no `.env.local`):
1. `/generate` com intenção real → carrossel novo aberto no editor com título + N slides
   preenchidos (AC-2, AC-3 end-to-end).
2. Texto sem emojis/markdown, tema herdado editável (AC-4, AC-7 no resultado real do modelo).
3. Slide sinalizado exibe a linha `[Sugestão: adicione uma imagem neste slide]` no editor (AC-5).
4. Latência real dentro do estado "gerando…"; erro real (ex.: derrubar rede) cai na mensagem
   genérica (AC-8, AC-9).

## Endurecimentos sugeridos (🟢 — não bloqueiam)

- 🟢 **Cota/rate-limit por usuário** — hoje só login + um pedido por vez. Sonnet 4.6 com
  `max_tokens:16000` por chamada, sem teto de gerações/usuário: custo cresce com abuso.
  Fatia futura (decisão de negócio do CEO, já sinalizada na story).
- 🟢 **Faixa de emoji não exaustiva** — `EMOJI_PATTERN` (`generate-sanitize.ts:24`) cobre os
  blocos comuns, não todo o Unicode. Aceitável (prompt já proíbe; é rede de segurança), mas
  um emoji raro fora das faixas passaria. Baixo risco.

## Veredito

**APROVAR** (recomendação ao gate humano).

Todos os 10 critérios de aceite CUMPRIDOS com evidência; type-check e build limpos; suíte
230 passed / 1 skip / 0 falha, com cobertura das 3 camadas de defesa, da orquestração da action
(refusal/JSON/0-slides/INVALID_INPUT/AC-1) e do contrato (EditorSlide via rowToEditorState).
Segurança sem achados 🔴/🟡. Pendência única e esperada: **smoke manual** contra a Claude API real
(depende do CEO validar no navegador). Endurecimentos (cota, faixa de emoji) são 🟢, fatia futura.
