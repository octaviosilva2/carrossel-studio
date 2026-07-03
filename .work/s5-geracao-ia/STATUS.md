# STATUS — S5 Geração com IA

**Slug:** s5-geracao-ia
**Ponto de entrada:** 01-researcher (feature nova, cruza camadas UI + servidor)
**Estágio atual:** 07-validação (CONCLUÍDO — APROVAR) → aguardando gate humano

## Gates
- [x] Story aprovada (após 02) — **APROVADA pelo CEO em 2026-07-01**
  - cria carrossel novo; IA gera título+texto (tema herda default); sem cota.
- [x] Spec aprovada (após 03) — **APROVADA pelo CEO em 2026-07-01**
  - AC-5: **dica textual no body** (sem campo novo).
  - Chave: **validação lazy** (só na geração; app roda sem a chave).
- [~] Validação (após 07) — **RECOMENDAÇÃO: APROVAR** (2026-07-02). Aguardando gate humano do CEO.
  - 10/10 ACs cumpridos com evidência; type-check+build limpos; testes 230 passed / 1 skip / 0 falha.
  - Segurança sem achados 🔴/🟡. Pendência única: smoke manual contra a Claude API real.
  - Ver `validation.md`.

## Escopo
1. Tela de entrada de intenção (cliente descreve o que quer comunicar).
2. Endpoint server-side que chama a Claude API e monta a estrutura dos slides,
   validada com Zod, respeitando as regras visuais do produto.
3. Resultado cai no editor da S2 para ajustar / pedir regeneração.

## Restrições / notas
- CONSULTAR skill `claude-api` para modelo e parâmetros — NÃO fixar modelo de memória.
- Pré-requisitos S2 (editor) e S3 (persistência) concluídos.
- **ANTHROPIC_API_KEY configurada no `.env.local`** (2026-07-02).
- **DECISÃO DO CEO (2026-07-02): modelo = `claude-sonnet-4-6`** (não `claude-opus-4-8`).
  Confirmado via skill claude-api. Params: `thinking:{type:"adaptive"}`, effort
  `low|medium|high|max` (sem `xhigh`), sem temperature/top_p, checar `stop_reason:"refusal"`.
- Backend precisa RE-RODAR do zero (sessão anterior travou por limite antes de implementar).
- Decisões do CEO: seguir para S5 já (smoke S3/S4 fica para depois); esteira
  completa parando nos gates.

## Decisões da spec (03) — a confirmar no gate
- **Server action** `generateCarousel` (padrão S3: requireUser + Zod na borda), não
  route handler.
- **Aterrissagem:** persistir via `createGeneratedCarousel` (variante de createCarousel,
  N slides) + `redirect("/editor?id=")` — reusa 100% S3/S4, sem tocar reducer/contrato.
- **Claude API (skill claude-api):** model `claude-opus-4-8`; structured output via
  `zodOutputFormat`/`output_config.format`; `max_tokens` 16000 não-streaming; PROIBIDO
  temperature/top_p/top_k/budget_tokens; checar `stop_reason: "refusal"` antes do content.
- **Defesa em 3 camadas:** schema na API → Zod nosso (`GeneratedCarouselSchema`) →
  sanitização (emojis/markdown/parágrafos).
- **Sinal de imagem (AC-5):** dica TEXTUAL no body (`suggestImage`), sem coluna/campo novo
  nem violar `SlideData`. **CONFIRMAR no gate** (dica textual vs. placeholder visual).
- `ANTHROPIC_API_KEY` no `envSchema` (falha fechada no boot). **CONFIRMAR** que a chave
  estará no ambiente antes do deploy (senão avaliar validação lazy).
- **Risco:** compat `@anthropic-ai/sdk/helpers/zod` com zod v4 (projeto usa 4.4.3) —
  verificar na implementação; fallback JSON schema manual.

## Decisões propostas na story (a confirmar no gate) — já aprovadas
- Geração **cria carrossel novo** (não substitui/acrescenta).
- IA gera **título** (texto), **não** escolhe tema (visual, herda default).
- IA **sinaliza** slide com imagem, sem preencher `imageUrl`.
- S5 faz **regeneração do zero**; refino conversacional fica fora.
- **Sem cota** nesta fatia.

## Log
- 2026-07-01 — pipeline iniciado; estágio 01 disparado.
- 2026-07-01 — estágio 02 (story) concluído; `story.md` gravado. Aprovada pelo CEO.
- 2026-07-01 — estágio 03 (spec) concluído; `spec.md` gravado. Skill `claude-api`
  consultada (model/params fixados). Aguardando gate humano da abordagem.
- 2026-07-02 — estágio 04 (backend) CONCLUÍDO (re-rodado do zero). Ver `backend.md`.
  - Instalado `@anthropic-ai/sdk@^0.109.1`. `zodOutputFormat` COMPATÍVEL com zod v4
    (peer `^4.0.0`, helper importa `zod/v4`) — usado sem fallback.
  - Modelo `claude-sonnet-4-6`; `thinking:{type:"adaptive"}`; sem temperature/top_p/top_k;
    `max_tokens:16000`; sem streaming; checa `stop_reason:"refusal"` e `parsed_output:null`.
  - Validação da ANTHROPIC_API_KEY LAZY (fora do envSchema; `env.ts` intacto).
  - Server action `generateCarousel` + `createGeneratedCarousel` (transação, N slides,
    ownerId da sessão). AC-5 = dica textual no body (sem coluna/campo novo).
  - UI `/generate` (server wrapper + client) e link em `/carousels` entregues.
  - `type-check` OK, `build` OK, `test` 171 passed / 0 falha (sem regressão).
  - Fronteira Anthropic isolada em `src/lib/claude.ts` (injetável) p/ o 06 mockar.
  - NÃO houve chamada real à Claude API (smoke fica para validação manual).
- 2026-07-02 — estágio 05 (frontend) CONCLUÍDO. Ver `frontend.md`. Revisão/polimento
  da UI de intenção já entregue pelo 04 (sem reescrita).
  - Limpa erro ao editar; aviso de mínimo não atingido (texto, não só cor); a11y de
    form (`aria-describedby`, `aria-invalid`); contador com `tabular-nums`.
  - Estados idle/vazio/inválido/gerando/erro/sucesso cobertos; erro sempre genérico
    pt-BR (todos os codes, incl. NOT_CONFIGURED/refusal); redirect via `unstable_rethrow`.
  - Contrato real da action consumido; limites de UX = `GenerateInputSchema`; sem chave
    no cliente; sem duplo submit.
  - `type-check` OK, `build` OK (rota `/generate` 3.32 kB), `test` 171 passed / 0 falha.
- 2026-07-02 — estágio 06 (testes) CONCLUÍDO. Ver `tests.md`. **59 testes novos** provando
  ACs + edge cases, fronteira Anthropic sempre MOCKADA (nunca chama a API real):
  - `tests/generate-schema.test.ts` (24) — Zod camada 2: `GenerateInputSchema` (vazia/curta<10/
    longa>1000) + `GeneratedCarouselSchema` (0/>10 slides, body vazio/>2000, título, campos
    faltando).
  - `tests/generate-sanitize.test.ts` (14) — camada 3: remove emojis/markdown/HTML, normaliza
    `\n\n`, trim, preserva pt-BR (AC-7).
  - `tests/generate-mapping.test.ts` (9) — dica de imagem no body sem `imageUrl` (AC-5), descarte
    de bodies vazios + reindex, contrato via `rowToEditorState` (AC-3).
  - `tests/generate-action.test.ts` (12) — caminho feliz (persiste + redirect `/editor?id=`),
    NOT_CONFIGURED (AC-10), refusal/JSON inválido/0 slides → GENERATION_FAILED sem persistir (AC-9),
    INVALID_INPUT sem chamar a API (AC-2), barreira de sessão sem chegar à API (AC-1).
  - `npm test` → **230 passed / 1 skip / 0 falha** (171 anteriores intactos, sem regressão).
  - `npm run type-check` → **zero erro** (respeita `noUncheckedIndexedAccess`).
  - **Nenhum bug encontrado**; código de produção não foi tocado.
  - Fora de escopo automatizado: AC-8/duplo clique (UI do `generate-client.tsx`, melhor por
    E2E) e smoke real contra a Claude API (proibido em teste; manual quando o CEO validar).
