# Research — S5 Geração com IA

## Pedido (como recebido)
Sessão 5 — Geração com IA, em três partes:
1. Tela de entrada de intenção onde o cliente descreve o que quer comunicar.
2. Endpoint server-side que chama a Claude API e monta a estrutura dos slides,
   validada com Zod, respeitando as regras visuais do produto.
3. O resultado cai no editor da S2 para o cliente ajustar ou pedir regeneração.

Restrição-chave do CEO/CTO: a IA decide **TEXTO e ESTRUTURA** (nº de slides,
ordem, onde cabe imagem). NUNCA decide o visual — o visual é determinístico no
`<Slide>`. A saída tem que cair no MESMO estado do editor da S2 sem quebrar o
contrato.

---

## Arquivos relevantes

### Contrato de estado (o que a IA precisa produzir para encaixar)
- `src/lib/editor-state.ts:24` — `EditorSlide { id: string; body: string; imageUrl?: string }`.
  É o slide do editor. **A IA produz `body` (texto) e, no máximo, sinaliza se um
  slide tem imagem** (o `imageUrl` real vem de upload do cliente na S2/S3 — a IA
  NÃO tem URL de imagem para preencher). `id` é gerado no cliente (`crypto.randomUUID()`),
  não vem da IA.
- `src/lib/editor-state.ts:33` — `EditorState { identity, theme, slides, selectedSlideId, carouselId?, title? }`.
  É o alvo final. **A IA não mexe em `identity` nem `theme`** (identidade vem do
  client/carrossel via S3; tema é escolha visual). A IA contribui só com `slides[].body`
  e possivelmente `title`.
- `src/lib/editor-state.ts:57` — `EditorAction` (união discriminada). NÃO existe hoje
  uma action de "substituir todos os slides" ou "carregar geração". As actions
  atuais são granulares (`ADD_SLIDE`, `UPDATE_SLIDE_BODY`, etc.). **Lacuna:** para
  a geração cair no editor será preciso ou (a) uma nova action tipo
  `LOAD_GENERATED_SLIDES` / `REPLACE_SLIDES`, ou (b) semear o `initialState` antes
  do `useReducer` (fluxo por navegação com estado pré-montado). [PRECISA CLARIFICAR
  no 02/03: geração substitui o carrossel inteiro ou insere/acrescenta?]
- `src/lib/editor-state.ts:285` — `toSlideData(identity, slide, theme)`: adaptador
  EditorSlide → SlideData. Prova que `body` é o único texto por-slide; imagem é
  opcional e derivada.
- `src/components/slide/types.ts:6` — `SlideData` (contrato imutável herdado S1→S5).
  Campos: `name, handle, avatarUrl, verified, body, imageUrl?, theme`. O comentário
  no topo do arquivo (`types.ts:1-2`) já ANTECIPA a S5: "Este shape é HERDADO por
  S2 (editor), S4 (export em lote) e S5 (saída da IA)". `body:` "\n\n" separa
  blocos de ideia (parágrafos) — a IA deve usar `\n\n` para separar parágrafos.

### Onde a geração entra no fluxo do editor
- `src/app/editor/editor-client.tsx:71` — `EditorClient` é dono do `useReducer`
  (`editor-client.tsx:72`), semeado por `initialState` vindo do servidor. É aqui que
  o resultado da IA precisa aterrissar. Padrão de chamada de action assíncrona já
  existe: `handleSave` (`editor-client.tsx:98`) usa `useTransition` + try/catch +
  estado visual discriminado (`SaveState`/`ExportState`). A geração seguiria o mesmo
  padrão (estado `GenerateState` idle/generating/error).
- `src/app/editor/page.tsx:26` — Server wrapper. Lê `?id=`, chama `getCarousel`,
  passa `initialState`. Se a tela de intenção for uma rota separada que gera e depois
  redireciona para `/editor?id=`, a montagem dos slides pode acontecer no servidor
  ANTES de renderizar o editor. Alternativa: a intenção é um painel dentro do editor
  e a geração é um botão que dispara a action/endpoint.
- `src/app/carousels/page.tsx` + `carousel-list.tsx` — entrada "Meus carrosséis".
  A tela de intenção pode ser uma nova porta de entrada (ex.: `/generate` ou
  `/editor/new-ai`) paralela ao `createCarousel` atual.

### Persistência / auth (padrão para o endpoint da IA)
- `src/lib/auth-guard.ts:19` — `requireUser()`. Falha fechado → redirect `/login`.
  Retorna `{ id, email, name }`. **Toda entrada protegida (action ou route) deve
  chamá-lo no topo.** O endpoint da IA DEVE exigir sessão (custo/abuso da Claude API).
- `src/app/api/blob/upload/route.ts:15` — MODELO de route handler protegido:
  `runtime = "nodejs"`, valida sessão via `auth()` dentro do handler, retorna 401
  sem sessão / 400 em falha, mensagem genérica (não vaza detalhe técnico). O endpoint
  da IA pode seguir este mesmo esqueleto (route handler `POST`), OU ser uma **server
  action** (padrão dominante da S3 em `src/lib/actions/carousels.ts`). Ver "Perguntas".
- `src/lib/actions/carousels.ts:1` — padrão de server action da S3: `"use server"`,
  `requireUser()` no topo, Zod na borda, `ownerId` sempre da sessão. Uma
  `generateSlides(intent)` server action encaixaria perfeitamente neste padrão
  (mesmo arquivo ou um `src/lib/actions/generate.ts` novo).
- `src/lib/actions/carousel-types.ts:1` — módulo NEUTRO para schema Zod + tipos
  (um arquivo `"use server"` só exporta funções async). **Se a geração virar server
  action, o schema Zod da entrada/saída da IA vai num módulo neutro análogo**
  (`generate-types.ts`), não no arquivo `"use server"`.
- `src/db/schema.ts:53` — tabela `carousels` (overrides null = herda) e
  `src/db/schema.ts:85` — `slides` (position, body, imageUrl). A geração pode:
  (a) só produzir texto em memória e deixar o `saveCarousel` existente persistir, ou
  (b) já criar/popular no banco. `createCarousel` (`carousels.ts:65`) hoje cria com
  1 slide vazio; uma variante poderia criar com os N slides gerados.

### Validação de borda (Zod já é padrão)
- `src/lib/env.ts:10` — `envSchema` valida env no boot, falha fechado, NUNCA imprime
  valores. **Aqui entra `ANTHROPIC_API_KEY`** (hoje ausente — ver Riscos). É
  `server-only`.
- `src/lib/actions/carousel-types.ts:17` — `slideInputSchema` (`body: z.string().max(2000)`).
  Bom teto de referência para o `body` gerado. `SaveCarouselSchema` exige `slides.min(1)`
  e `imageUrl` como `z.url().optional()` — a IA não produz URL, então a saída da IA
  para slide é só `{ body }` (imageUrl fica ausente até upload).

### Regras visuais (o que a estrutura gerada NÃO pode violar)
- `docs/REFERENCIA-VISUAL.md:65-69` — regras invioláveis: sem barra de engajamento,
  sem logo do X, **sem emojis no corpo**, selo sempre círculo azul, 1080×1350.
- `CLAUDE.md` (Regras visuais) — reforça: header centralizado, selo azul `#1D9BF0`.
- Consequência para o prompt da IA: instruir explicitamente **sem emojis**, texto
  em pt-BR, parágrafos separados por `\n\n`, e que a IA só decide texto/estrutura.
  O `<Slide>` cuida do visual — a IA nunca emite cor, fonte, HTML ou markdown de
  estilo.

---

## Skill claude-api — o que ela recomenda (registrado do carregamento)

- **Modelo:** `claude-opus-4-8` (default não-negociável da skill; usar outro só se o
  CEO pedir explicitamente Sonnet/Haiku). String exata: `claude-opus-4-8`. Não
  fixar modelo de memória — este é o valor atual da skill.
- **SDK:** projeto TypeScript → usar `@anthropic-ai/sdk` (oficial). Client
  `new Anthropic()` resolve credencial de `ANTHROPIC_API_KEY` no ambiente. Chamada:
  `client.messages.create({ model, max_tokens, messages, ... })`.
- **Structured output (recomendado para esta feature):** a IA precisa devolver JSON
  estruturado (lista de slides). Duas opções documentadas:
  - `output_config: { format: { type: "json_schema", schema } }` — restringe a saída
    ao schema (canônico; substitui o `output_format` deprecado). Há helper
    `zodOutputFormat(zodSchema)` de `@anthropic-ai/sdk/helpers/zod` e
    `client.messages.parse(...)` que valida contra o schema.
  - Tool use com `strict: true` — alternativa. Para "produza N slides" o
    structured output via `output_config.format` é o caminho mais direto.
  - **Importante:** structured outputs suportados em `claude-opus-4-8`. Limitações do
    JSON schema: NÃO suporta `minLength/maxLength`, `minimum/maximum` — o SDK
    Python/TS remove essas constraints e valida client-side. Então o teto de
    tamanho do `body` e o range de nº de slides devem ser reforçados por Zod NOSSO
    depois (não confiar só no schema enviado à API).
- **Thinking / params:** em `claude-opus-4-8`, adaptive thinking (`thinking: {type:"adaptive"}`)
  para tarefas não-triviais; `temperature/top_p/top_k` são REJEITADOS (400) —
  não passar. `budget_tokens` também rejeitado (400). `output_config.effort`
  controla profundidade (`low|medium|high|max`).
- **Streaming:** a skill recomenda streaming para `max_tokens` alto / saída longa
  (evita timeout HTTP do SDK). Para gerar ~5-10 slides o `max_tokens` é moderado;
  provavelmente não-streaming basta (default `~16000` para não-streaming). Se a
  geração puder ser longa, usar `.stream()` + `.finalMessage()`. Decisão fica p/ spec.
- **Erros:** classes tipadas (`Anthropic.RateLimitError`, `Anthropic.AuthenticationError`,
  `Anthropic.APIError` com `.status`). Tratar 429 (rate limit) e refusal
  (`stop_reason === "refusal"`) — checar `stop_reason` ANTES de ler `content`.
- **Refusal:** `claude-opus-4-8` pode retornar `stop_reason: "refusal"` (HTTP 200,
  content vazio). Tratar como falha de geração, não erro de código.

---

## Features similares já feitas (padrão a reusar)

1. **Server action protegida com Zod (S3):** `src/lib/actions/carousels.ts` +
   `carousel-types.ts`. Padrão exato para uma `generateSlides` action:
   `requireUser()` → Zod na entrada → lógica → retorno tipado. Schema/tipos em
   módulo neutro. **Reusar este padrão** em vez de inventar arquitetura nova.
2. **Route handler protegido (S3):** `src/app/api/blob/upload/route.ts`. Se a spec
   preferir um endpoint HTTP (`/api/generate`) em vez de server action, este é o
   molde: `runtime="nodejs"`, `auth()`, 401/400, mensagem genérica.
3. **Ação assíncrona no editor com estado visual (S3/S4):** `handleSave`
   (`editor-client.tsx:98`) e `handleExportZip` (`editor-client.tsx:182`) —
   `useTransition`, união discriminada de estado (`SaveState`/`ExportState`),
   `aria-live` para feedback, mensagem genérica em erro. **Reusar** para o estado
   de "gerando…".
4. **Validação de env falha-fechada (S3):** `src/lib/env.ts`. Adicionar
   `ANTHROPIC_API_KEY` ao `envSchema` segue o padrão existente (falha no boot se
   ausente, nunca imprime valor).

---

## O que já está quebrado / pendências herdadas na área
- `docs/STATUS.md:82-89` — **Pendências antes da S5:** rodar smoke manual da S4
  (fixture multi-slide + carrossel com imagem do Blob no navegador) e, se possível,
  o da S3. Não bloqueia o research, mas é gate operacional do CEO.
- `docs/STATUS.md:96,101` — **Follow-up crítico da S1 (não resolvido):** embarcar a
  fonte woff2 (Selawik/Segoe UI) via `next/font/local` ANTES do deploy Linux. Não
  afeta a lógica da S5, mas afeta o produto final gerado (fidelidade visual no export).
- `docs/STATUS.md:74` — endurecimento sugerido na S4 (allowlist de host em
  `toExportSafeUrl`) ainda pendente (🟡, não bloqueia).
- Nenhum TODO/código morto na área de geração (a área não existe ainda — é greenfield
  sobre contratos estáveis).

## Riscos sinalizados
- **`ANTHROPIC_API_KEY` ausente:** não está no `.env.example`, nem no `envSchema`
  (`src/lib/env.ts:10`), nem em `package.json` (não há `@anthropic-ai/sdk`). Impacto:
  é dependência nova do CEO (billing ativo — `docs/STATUS.md:92`) e nova dep npm.
  Falha fechado no boot se faltar (seguir padrão do `env.ts`).
- **`@anthropic-ai/sdk` não instalado** (`package.json:18-40`). Precisa ser adicionado
  como dependência. Escolher a versão na fase de implementação.
- **Custo/latência da Claude API:** geração é operação cara e lenta comparada ao
  resto do app (tudo client-side hoje). Impacto: precisa de estado "gerando…",
  timeout razoável, e proteção contra abuso (só logado; considerar cota/rate-limit
  por usuário — modelo done-for-you cobra manutenção, mas cota descontrolada = custo).
  A skill lembra: default `max_tokens ~16000` não-streaming; considerar streaming se
  a saída crescer.
- **JSON malformado / saída fora do contrato:** a IA pode devolver JSON inválido,
  emojis, markdown, ou nº de slides absurdo. Mitigação em CAMADAS: (1) structured
  output (`output_config.format` / `zodOutputFormat`) na API; (2) Zod NOSSO na
  borda do servidor revalidando (a API não garante `maxLength`/ranges); (3) sanitização
  de emojis/markdown no `body` antes de cair no editor. Nunca confiar só no schema
  enviado à API.
- **Refusal / classificadores:** `stop_reason: "refusal"` retorna HTTP 200 com content
  vazio — ler `content[0]` sem checar quebra. Tratar como "não consegui gerar".
- **Regras visuais violáveis pelo texto:** emojis no corpo são a violação mais provável
  (usuário pede "com emojis"). O prompt do sistema deve proibir explicitamente; a
  sanitização server-side é a rede de segurança.
- **i18n pt-BR:** todo o app é pt-BR (`carousel-list.tsx:13` usa locale pt-BR;
  mensagens de erro em português). O prompt da IA deve gerar em pt-BR por padrão e as
  mensagens de erro/UI da tela de intenção devem ser pt-BR.
- **Onde a geração aterrissa (acoplamento com o reducer):** não há action para
  "carregar N slides gerados de uma vez" (`editor-state.ts:57`). Adicionar action nova
  toca o reducer puro (testado por 06) e o `default` exhaustive (`editor-state.ts:271`).
  Alternativa menos invasiva: gerar no servidor e semear via `initialState` (fluxo por
  navegação). Decisão de escopo/solução para 02/03.
- **Segurança de prompt:** a intenção do usuário vai dentro do prompt à Claude —
  entrada não confiável. Validar tamanho (Zod), e o texto do usuário deve ir como
  conteúdo de mensagem do usuário, não concatenado no system prompt (evita injeção
  que reescreva as regras visuais).

## Dependências afetadas
- **`package.json`** — nova dependência `@anthropic-ai/sdk`.
- **`.env.example` + `src/lib/env.ts:10`** — nova var `ANTHROPIC_API_KEY` (obrigatória
  em runtime da geração). Dependência externa do CEO (billing).
- **`src/lib/editor-state.ts`** — provavelmente nova `EditorAction` (ex.:
  `LOAD_GENERATED_SLIDES`) OU nenhum toque se a geração semear `initialState`. Se
  tocar, reverbera nos testes do reducer (06) e no `default` exhaustive.
- **`src/app/editor/editor-client.tsx`** OU nova rota de intenção — ponto de UI onde
  a geração é disparada e o resultado aplicado.
- **Novos arquivos prováveis** (a confirmar na spec): `src/lib/actions/generate.ts`
  (`"use server"`), `src/lib/actions/generate-types.ts` (schema Zod + tipos neutros),
  `src/lib/claude.ts` (client Anthropic server-only, análogo a `src/db/index.ts`),
  tela de intenção (rota/painel).
- **`src/components/slide/types.ts` (SlideData)** — contrato imutável, NÃO deve mudar
  (o comentário do arquivo confirma que a S5 apenas consome/produz o shape).
- **Testes (`tests/`)** — nova cobertura: parsing/validação da saída da IA (mockar a
  Claude API — nunca chamar a real em teste, per skill `mocking-estrategico` e regra
  de segurança de não usar dados reais/custo real em teste).

## Perguntas abertas
- [PRECISA CLARIFICAR: a geração **substitui** todos os slides do carrossel aberto,
  **acrescenta** ao final, ou cria um **carrossel novo** já populado? Define se toca o
  reducer (nova action) ou o fluxo de navegação (semear `initialState` / variante de
  `createCarousel`).]
- [PRECISA CLARIFICAR: a IA decide o **tema** (light/dark) e o **título**, ou só o
  texto dos slides? O contexto diz "IA decide TEXTO e ESTRUTURA... nunca o visual" —
  tema é visual, então provavelmente NÃO; título é texto, então talvez SIM. Confirmar.]
- [PRECISA CLARIFICAR: "onde cabe imagem" — a IA apenas **sinaliza** que um slide
  comportaria imagem (flag), já que ela não tem URL de imagem? Ou não trata imagem
  nesta fatia (imagem é 100% upload manual da S2)? A saída da IA por slide hoje só
  tem `body`; um flag `suggestImage` seria campo novo fora do contrato SlideData.]
- [PRECISA CLARIFICAR: endpoint como **server action** (padrão dominante da S3) ou
  **route handler `/api/...`** (padrão do blob upload)? O pedido diz "endpoint
  server-side"; ambos servem — server action encaixa melhor no fluxo do editor.]
- [PRECISA CLARIFICAR: há **cota/rate-limit** por usuário para conter custo da Claude
  API (regenerações ilimitadas)? Modelo done-for-you sugere que sim, mas não há
  infraestrutura de contagem hoje.]
- [PRECISA CLARIFICAR: "pedir regeneração" — regenera do zero com a mesma intenção,
  ou é refino conversacional ("encurta o slide 3", como sugere `docs/VISAO.md:13`)?
  A VISAO menciona refino por conversa; o pedido da S5 fala em "ajustar ou pedir
  regeneração". Escopo do 02.]
