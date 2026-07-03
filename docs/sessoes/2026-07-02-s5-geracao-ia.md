# Sessão — 2026-07-02 — S5: Geração com IA

## Objetivo
Fatia S5 do roadmap: entrada de intenção do cliente → Claude monta a estrutura dos slides
server-side (validada com Zod, respeitando as regras visuais) → resultado cai no editor da S2 para
ajustar ou pedir regeneração. Conduzida pela esteira `dev-agents` (research → story → spec → backend
→ frontend → testes → validação), parando nos gates humanos.

## Como foi conduzida
Esteira completa via `dev-agents:feature`. Artefatos em `.work/s5-geracao-ia/` (research, story,
spec, backend, frontend, tests, validation, STATUS).

## Decisões (CEO)
- **Credencial:** a S5 exige `ANTHROPIC_API_KEY`. Ausente no início → pipeline parou e avisou;
  research/story/spec avançaram sem consumir a API. Chave configurada no `.env.local` no meio da
  sessão, destravando backend/testes.
- **Gate da story:** geração **sempre cria carrossel novo** (aterrissa via persistência + redirect,
  sem tocar o reducer da S2); IA gera **título + texto**, **não** escolhe tema (herda o default);
  **sem cota** nesta fatia.
- **Gate da spec:** sinal de imagem (AC-5) = **dica textual no body** (sem campo/coluna novo);
  validação da chave **lazy** (só na geração — o app sobe sem a chave).
- **Modelo:** o CEO trocou de `claude-opus-4-8` (proposto na spec) para **`claude-sonnet-4-6`**.
  Model id confirmado via skill `claude-api` (não fixado de memória).

## O que foi entregue
- **Tela de intenção** `/generate` (`src/app/generate/`): textarea com validação de borda igual ao
  `GenerateInputSchema` (10..1000 chars), estados idle/gerando/erro/sucesso com `aria-live`,
  `aria-describedby`/`aria-invalid`, botão desabilitado durante geração/input inválido, sem duplo
  submit. Link a partir de `/carousels`.
- **Server action `generateCarousel`** (`src/lib/actions/generate.ts`): padrão S3 (`requireUser()` +
  Zod na borda). Chama a Claude API via fronteira isolada `src/lib/claude.ts` com `claude-sonnet-4-6`,
  `thinking:{type:"adaptive"}`, sem streaming/temperature/top_p/top_k, `max_tokens:16000`, checando
  `stop_reason:"refusal"`. **Structured output** via `zodOutputFormat` (`@anthropic-ai/sdk@^0.109.1`,
  helper compatível com zod v4 — sem fallback). Regras visuais no **system**; intenção do usuário só
  na mensagem **user** (proteção contra prompt injection).
- **Defesa em 3 camadas:** schema na API → `GeneratedCarouselSchema` (Zod nosso, `generate-types.ts`)
  → sanitização (`generate-sanitize.ts`: remove emoji/markdown, normaliza parágrafos). **AC-5** =
  dica textual de imagem no `body`, sem preencher `imageUrl` nem tocar `SlideData`/reducer.
- **Persistência:** `createGeneratedCarousel` (`src/lib/actions/carousels.ts`, transação, N slides,
  `ownerId` da sessão) → carrossel **novo** → `redirect("/editor?id=…")`. Authz por dono na action e
  na query.
- **Chave lazy:** `env.ts` intacto; ausência vira `NOT_CONFIGURED` tratável (nunca vaza o valor).
- `.env.example` atualizado com `ANTHROPIC_API_KEY=`.

## Testes
- **230 passed / 1 skip (herdado da S1) / 0 falha.** 67 testes novos em `tests/generate/`:
  Zod de input e de estrutura, sanitização/mapeamento (AC-5), server action com fronteira Anthropic e
  persistência **mockadas** (caminho feliz + authz + `NOT_CONFIGURED`/`refusal`/`GENERATION_FAILED`/
  `INVALID_INPUT`), system prompt/modelo. Nenhuma chamada real à Claude API.
- `type-check` e `build` limpos.

## Veredito da validação (07)
**APROVAR** — 10/10 critérios de aceite cumpridos com evidência (arquivo:linha + teste). Sem achados
de segurança (🔴/🟡). Prompt injection mitigado, segredo nunca em log/código, erro genérico ao usuário.

## Desvios de implementação (documentados)
- `unstable_rethrow` no lugar de `isRedirectError` (este não é export público de `next/navigation`) —
  padrão oficial Next 15, efeito idêntico.

## Pendências / próximos passos
- **Smoke manual (único pendente da S5):** gerar um carrossel de verdade no navegador com a chave
  ativa (intenção → slides → editor) — nenhum teste automatizado toca a API real.
- Smokes herdados S3/S4 ainda abertos (login/save/upload/export + fixture multi-slide).
- **Endurecimentos sugeridos (🟢, não bloqueiam):** cota por usuário (fatia futura); faixa de emoji
  não exaustiva na sanitização.
- Follow-up crítico global: embarcar a fonte woff2 antes do deploy Linux.
- **Próxima sessão: S6 — Multi-cliente + deploy + hardening.**
