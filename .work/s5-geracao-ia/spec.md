# Spec — Geração de carrossel com IA (Porta A) — S5

## Resumo da abordagem

Uma **rota nova `/generate`** (server wrapper + client component) coleta a intenção
do usuário e chama **uma server action `generateCarousel(input)`** (padrão dominante
da S3: `requireUser()` no topo + Zod na borda). A action chama a Claude API server-side
com **structured output** (schema JSON restringindo a saída), revalida a saída com
**Zod nosso**, **sanitiza** (remove emojis/markdown, normaliza parágrafos), e então
**persiste um carrossel novo** reusando o padrão de escrita da S3 (`createGeneratedCarousel`
= variante de `createCarousel` que insere N slides em vez de 1 vazio). A action **redireciona
para `/editor?id=<novo>`** — a aterrissagem no editor é exatamente o fluxo S3/S4 já existente
(`page.tsx` → `getCarousel` → `initialState`), **sem tocar o reducer puro da S2** nem o contrato
`SlideData`.

Por quê: (1) persistir + redirect reusa 100% da infraestrutura S3/S4 (createCarousel,
getCarousel, rowToEditorState, initialState) e é o corte mais fino — nenhum campo/action novo
no editor; (2) a IA decide só texto/estrutura, o visual continua determinístico no `<Slide>`;
(3) a defesa em 3 camadas garante que nada fora do contrato entra no banco/editor.

---

## Contrato de API/backend

### Decisão: server action (não route handler)

**Server action** `generateCarousel`, no padrão de `src/lib/actions/carousels.ts`.
Justificativa (skill `design-de-api` + `gate-de-simplicidade`):
- O disparo vem de um Client Component nosso (a tela de intenção), não de um cliente
  HTTP externo — server action encaixa direto no fluxo React (`useTransition`), sem
  precisar de `fetch`, JSON manual, nem CSRF próprio.
- O resultado **aterrissa via navegação** (redirect para `/editor?id=`), que é natural
  em server action (`redirect()` lança). Um route handler exigiria o client orquestrar
  o redirect.
- O padrão S3 já é server action com `requireUser()` + Zod; reusar mantém consistência
  e a mesma superfície de segurança. Route handler seria uma segunda arquitetura para
  o mesmo tipo de operação.

Arquivos: `src/lib/actions/generate.ts` (`"use server"`, só funções async) +
`src/lib/actions/generate-types.ts` (módulo neutro: schema Zod + tipos), espelhando
a separação `carousels.ts` / `carousel-types.ts`.

### Assinatura

```ts
// generate.ts ("use server")
export async function generateCarousel(
  input: GenerateInput,
): Promise<never>; // sempre redireciona em sucesso; lança em erro (ver abaixo)
```

- **Sucesso:** persiste o carrossel e chama `redirect("/editor?id=<novo>")` — `redirect()`
  lança internamente (NEXT_REDIRECT), então o retorno é efetivamente `never`. Mesmo padrão
  do `EditorPage` quando cria sem id.
- **Erro:** lança `GenerateError` (classe simples com `code` estável — nunca detalhe técnico).
  O client captura e mapeia para mensagem genérica em pt-BR (AC-9).

### Input (intenção + params)

```ts
// generate-types.ts (neutro)
export const GenerateInputSchema = z.object({
  // Intenção do usuário — entrada NÃO confiável. Validada na borda.
  intent: z.string().trim().min(10).max(1000),
});
export type GenerateInput = z.infer<typeof GenerateInputSchema>;
```

- `min(10)`: bloqueia intenção vazia/curta demais (edge case da story) antes de gastar
  chamada à API. `max(1000)`: teto de custo/abuso (seguranca-baseline: valida tamanho na
  borda). Números são recomendação — o CEO pode ajustar; não afeta arquitetura.
- **Sem** seleção de modelo/tom/tema pela UI (fora de escopo da story). Tom vem do `intent`.

### Output interno (estrutura gerada pela IA — antes de persistir)

Não é retornado ao client (o client recebe o redirect). É a estrutura intermediária
validada pelo Zod nosso após a chamada à API:

```ts
// generate-types.ts (neutro) — schema NOSSO, revalida a saída da API
export const GeneratedCarouselSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slides: z
    .array(
      z.object({
        body: z.string().trim().min(1).max(2000), // teto alinhado ao slideInputSchema (S3)
        suggestImage: z.boolean(),                 // sinal de "cabe imagem" (AC-5)
      }),
    )
    .min(1)
    .max(10), // range de nº de slides — a API não garante ranges (ver camadas)
});
export type GeneratedCarousel = z.infer<typeof GeneratedCarouselSchema>;
```

### Fluxo interno da action (passo a passo)

1. `const user = await requireUser();` — falha fechado → redirect `/login` (AC-1: visitante
   não logado nunca chega à Claude API).
2. `const { intent } = GenerateInputSchema.parse(input);` — Zod na borda; rejeita vazio/curto/longo
   antes de chamar a API (edge cases; AC-2).
3. `const generated = await requestGeneration(intent);` — chama a Claude API (ver seção Claude API),
   revalida com `GeneratedCarouselSchema`, sanitiza. Erros da API viram `GenerateError`.
4. Persiste via `createGeneratedCarousel(generated)` (ver Mudanças de dados) → retorna `{ id }`.
5. `redirect("/editor?id=" + id);`

### Envelope de erro (skill `design-de-api`)

Como é server action com redirect, não há JSON de resposta; o "envelope" é a classe
de erro com `code` estável (para o client mapear) e mensagem genérica:

```ts
export type GenerateErrorCode =
  | "INVALID_INPUT"     // Zod da borda falhou (intenção vazia/longa)
  | "GENERATION_FAILED" // Claude API: rate limit, auth, timeout, refusal, JSON fora do contrato
  | "NOT_CONFIGURED";   // ANTHROPIC_API_KEY ausente (AC-10)
export class GenerateError extends Error {
  constructor(public code: GenerateErrorCode) { super(code); }
}
```

O client trata **todos** os códigos com a mesma mensagem genérica pt-BR ao usuário
("Não consegui gerar o carrossel. Tente novamente."). `code` existe para
telemetria/log server-side e testes — **nunca** vaza texto técnico ao usuário (AC-9).

---

## Claude API (fixado pela skill `claude-api` — não de memória)

Client server-only novo: `src/lib/claude.ts` (análogo a `src/db/index.ts`), com
`import "server-only"`.

- **SDK:** `@anthropic-ai/sdk` (oficial, projeto TS). Client `new Anthropic()` resolve
  a credencial de `ANTHROPIC_API_KEY` no ambiente (não passar a chave no código).
- **Model id (string exata):** `claude-opus-4-8`. É o default não-negociável da skill;
  trocar só se o CEO pedir Sonnet/Haiku explicitamente. **Não** fixar de memória — este é
  o valor da skill hoje.
- **Structured output:** usar `client.messages.parse({ ... output_config: { format: zodOutputFormat(schema) } })`
  do helper `@anthropic-ai/sdk/helpers/zod`. O schema enviado à API restringe a saída ao
  JSON esperado (canônico; substitui o `output_format` deprecado).
  - **Limitação documentada:** o JSON schema enviado à API **não** honra `min/maxLength`
    nem `minimum/maximum` (o SDK remove essas constraints). Por isso o **Zod NOSSO**
    (`GeneratedCarouselSchema`) revalida tamanho do body (≤2000) e range de slides (1–10)
    **depois** — não confiar só no schema da API.
- **Parâmetros (o que a skill permite / proíbe):**
  - `model: "claude-opus-4-8"`.
  - `max_tokens`: default `16000` (não-streaming; abaixo do timeout do SDK). Geração de
    ~5–10 slides curtos cabe folgado. **Sem streaming** nesta fatia (saída moderada; a
    story lista streaming como fora de escopo).
  - `thinking: { type: "adaptive" }` — opcional; a skill recomenda adaptive para tarefas
    não-triviais. Aceitável aqui, mas simples o bastante para omitir. Decisão de
    implementação; se usar, é `{ type: "adaptive" }` (NUNCA `budget_tokens`).
  - **PROIBIDO (dão 400 em `claude-opus-4-8`):** `temperature`, `top_p`, `top_k`,
    `budget_tokens`. **Não passar nenhum destes.**
  - `output_config: { format: zodOutputFormat(...) }` (e opcionalmente `effort: "medium"`).
- **`stop_reason` — checar ANTES de ler o conteúdo:** se `stop_reason === "refusal"`
  (HTTP 200, content vazio — classificador recusou), tratar como `GENERATION_FAILED`
  (não como bug de código). `response.parsed_output` pode ser `null` em refusal/`max_tokens`
  → também `GENERATION_FAILED`.
- **Erros tipados (tratar como `GENERATION_FAILED`, log com o código HTTP internamente):**
  `Anthropic.RateLimitError` (429), `Anthropic.AuthenticationError` (401),
  `Anthropic.APIError` (`.status`), timeout/`APIConnectionError`. Nunca vaza `.message` técnico
  ao usuário.

### Prompt (seguranca-baseline: intenção como USER, regras no SYSTEM)

- **System prompt** (fixo, nosso): define o papel e as **regras visuais invioláveis**
  como restrições de TEXTO:
  - Gera em **pt-BR**, **sem emojis**, **sem markdown/HTML** de estilo.
  - Decide **só título + texto (body) de cada slide + nº/ordem de slides + flag por slide
    se cabe imagem**. **Nunca** decide cor, fonte, tema, tamanho, nem 1080×1350.
  - Parágrafos dentro de um body separados por `\n\n`.
  - Nº de slides entre 1 e 10; body de cada slide conciso (≤ ~2000 chars).
- **User message:** contém **apenas** o `intent` do usuário (entrada não confiável).
  **NUNCA** concatenar o intent no system prompt (evita prompt injection que reescreva as
  regras visuais). O structured output já força a forma; o system fixa as regras; a
  sanitização é a rede de segurança final.

---

## Defesa em 3 camadas contra JSON ruim / emojis / violação visual

Camada por camada (todas obrigatórias — research/story exigem rede de segurança além do prompt):

1. **Schema na API (`zodOutputFormat` / `output_config.format`):** restringe a *forma*
   (objeto com `title`, `slides[]`, cada slide `{ body, suggestImage }`). Impede JSON solto.
   NÃO garante tamanho/range (limitação do JSON schema da API).
2. **Zod NOSSO (`GeneratedCarouselSchema`):** revalida no servidor — `title` 1–120,
   `slides` 1–10, cada `body` 1–2000 (alinhado ao `slideInputSchema` da S3), `suggestImage`
   booleano. JSON malformado / nº de slides absurdo (0 ou >10) / body vazio → **rejeita**
   → `GENERATION_FAILED`; nada é aberto no editor (AC-9, edge cases).
3. **Sanitização (`sanitizeGeneratedText`, módulo neutro `src/lib/generate-sanitize.ts`):**
   aplicada a `title` e a cada `body` **após** o Zod, antes de persistir:
   - **Remove emojis** (faixas Unicode de emoji/pictogramas/símbolos) — regra visual
     inviolável (AC-7); rede de segurança mesmo que o usuário peça emojis no intent.
   - **Remove markdown/HTML de estilo:** tira `*`, `_`, `` ` ``, `#` de marcação, tags `<...>`;
     mantém o texto puro.
   - **Normaliza parágrafos:** colapsa 3+ quebras em `\n\n`; `trim`.
   - Se após sanitizar um `body` ficar vazio, o slide é descartado; se sobrarem 0 slides
     → `GENERATION_FAILED` (não cria carrossel quebrado).

### Como o texto vira `SlideData` / `EditorSlide` sem quebrar o contrato

- A action **não** toca `SlideData` nem `EditorSlide` diretamente. Ela persiste linhas
  na tabela `slides` (`body`, `imageUrl = null`) e `carousels` (`title`).
- Ao abrir `/editor?id=`, o `getCarousel` → `rowToEditorState` já converte as linhas em
  `EditorSlide { id: crypto.randomUUID(), body, imageUrl: undefined }` e monta o `EditorState`.
  **Zero mudança** em `editor-state.ts`, `carousel-mapping.ts` ou `types.ts`.
- **`suggestImage` NÃO vira campo de `SlideData`** (contrato imutável) nem coluna nova de
  banco nesta fatia. Ver "Sinal de imagem" abaixo.

### Sinal de imagem (AC-5) — decisão de solução

A IA sinaliza `suggestImage: true` por slide, mas **não** há coluna nem campo de contrato
para persistir isso, e a story diz "não pode violar o contrato `SlideData`" e "imagem é
upload manual". Decisão **YAGNI (gate-de-simplicidade)** para a S5:

- **A sugestão é materializada como texto no `body`**, não como flag de UI persistida.
  Quando `suggestImage === true`, a sanitização/montagem **acrescenta uma linha de dica
  ao final do body** do slide, ex.: `\n\n[Sugestão: adicione uma imagem neste slide]`.
  Essa dica:
  - Aparece para o cliente no editor (é texto do body — ele lê e decide).
  - **Não** preenche `imageUrl` (upload continua manual na S2/S3).
  - **Não** viola `SlideData` (é só `body`).
  - O cliente apaga a linha ao ajustar (comportamento esperado de rascunho).

  Alternativa descartada: campo efêmero `suggestImage` em `EditorSlide` + nova action/coluna
  → tocaria reducer puro (testado no 06), contrato e schema — custo alto para um sinal que
  a story explicitamente mantém como "indicação". A dica textual entrega o valor (o cliente
  vê onde cabe imagem) com custo zero de contrato. **Confirmar no gate** se o CEO prefere a
  dica textual vs. um placeholder visual (que seria fatia maior).

---

## Como o resultado aterrissa no editor (carrossel novo)

**Decisão: persistir via server action + redirect** (não semear `initialState` em memória).

Justificativa (reuso S3/S4 — `gate-de-simplicidade`):
- O editor da S3 **já** exige que todo carrossel tenha `id` antes de editar
  (`EditorPage`: sem id → `createCarousel` → `redirect("/editor?id=")`). Persistir a
  geração e redirecionar para `/editor?id=<novo>` **é exatamente esse fluxo** — reusa
  `getCarousel` + `rowToEditorState` + `initialState` sem nada novo no editor.
- Semear `initialState` por navegação (passar o estado gerado sem persistir) exigiria
  um caminho paralelo de montagem no `page.tsx` e um carrossel "não salvo" no editor —
  divergiria do invariante S3 e criaria estado órfão se a sessão cair (edge case da story:
  "não persiste resultado órfão").
- **AC-3:** carrossel **novo** aberto no editor da S2 já preenchido; o carrossel aberto
  anteriormente não é tocado (é outro `id`).

### Mecanismo exato
1. `generateCarousel` chama `createGeneratedCarousel(generated)` (variante de `createCarousel`).
2. `createGeneratedCarousel` insere 1 linha em `carousels` (title = `generated.title`,
   overrides null = herda identidade/tema do client — **tema herda o default**, AC-4) e
   N linhas em `slides` (position = índice, body sanitizado, imageUrl = null).
3. Retorna `{ id }`.
4. `redirect("/editor?id=" + id)`.

---

## Mudanças de dados

**Nenhuma migração destrutiva. Nenhuma coluna nova.** A geração usa o schema S3 tal como está.

| Tabela | Operação | Destrutiva? | Notas |
|---|---|---|---|
| `carousels` | INSERT (1 linha) | Não | title = título gerado; overrides null (herda client) |
| `slides` | INSERT (N linhas) | Não | position=índice, body sanitizado, imageUrl=null |

- **RLS/authz (seguranca-baseline):** o projeto **não usa RLS de Postgres** — a autorização
  é feita na aplicação (padrão S3). Toda leitura/escrita filtra por `ownerId` **da sessão**
  (nunca do client). `createGeneratedCarousel` segue `createCarousel`: `requireUser()` →
  `getDefaultClient(user.id)` → INSERT com `ownerId: user.id` e `clientId` do dono. A
  aterrissagem usa `getCarousel`, que já filtra por `ownerId` e faz `notFound()` para id
  alheio. Ponto de validação: `GenerateInputSchema` na borda da action.
- **Sem cota** nesta fatia (decisão do CEO) — sem coluna de contagem.

### Nova função de escrita (não altera as existentes)

```ts
// carousels.ts ("use server") — NOVA função (createCarousel fica intacta)
export async function createGeneratedCarousel(
  generated: GeneratedCarousel, // já validado + sanitizado pela action
): Promise<{ id: string }>;
```
- `requireUser()` no topo; `getDefaultClient(user.id)`; INSERT em `carousels` +
  INSERT em `slides` (N linhas). Reusa exatamente o padrão de `createCarousel`,
  só troca "1 slide vazio" por "N slides gerados". `ownerId` sempre da sessão.
- Pode viver em `carousels.ts` (mesmo domínio) OU ser chamada por `generate.ts`. Recomendo
  em `carousels.ts` para reusar `getDefaultClient` (helper privado do módulo).

---

## UI/frontend

### Rota e componentes (nova porta de entrada, paralela a `/editor`)

- `src/app/generate/page.tsx` — **Server Component** wrapper. `await requireUser()` no
  topo (AC-1: barra visitante antes de renderizar). Renderiza `<GenerateClient />`.
  `export const dynamic = "force-dynamic"`.
- `src/app/generate/generate-client.tsx` — **Client Component**. Dono do form de intenção
  e do estado visual. Reusa o padrão de `editor-client.tsx` (`useTransition` + union
  discriminada de estado + `aria-live` + mensagem genérica em erro).
- Entrada para a tela: link "Gerar com IA" na `/carousels` (ao lado do "Novo carrossel").

### Estado visual (union discriminada — mesmo padrão de `SaveState`/`ExportState`)

```ts
type GenerateState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "error"; message: string };
```

- **idle:** textarea de intenção + botão "Gerar". Botão desabilitado se o texto estiver
  vazio/abaixo do mínimo (validação de UX espelhando o Zod; a borda do servidor é a
  verdade).
- **generating:** botão vira "Gerando…" e **desabilita** os controles (textarea + botão);
  um pedido por vez (AC-8, edge "duplo clique"). Feedback anunciado via `aria-live="polite"`
  (padrão `handleSave`/`handleExportZip`).
- **error:** mensagem **genérica em pt-BR** ("Não consegui gerar o carrossel. Tente
  novamente."), sem detalhe técnico (AC-9). Controles reabilitados; o texto do usuário é
  preservado para tentar de novo.
- **sucesso:** não há estado local — a action redireciona para `/editor?id=`. Enquanto o
  `useTransition` está pendente, o estado é `generating`.

### Disparo

```ts
function handleGenerate() {
  // validação leve de UX (min length); a verdade é o Zod do servidor
  setGenerateState({ status: "generating" });
  startTransition(async () => {
    try {
      await generateCarousel({ intent });
      // sucesso => redirect lança NEXT_REDIRECT (navegação), não cai no catch de erro real
    } catch (err) {
      if (isRedirectError(err)) throw err; // deixa o Next tratar o redirect
      setGenerateState({ status: "error", message: GENERATE_ERROR_MESSAGE });
    }
  });
}
```
- **Cuidado (implementação):** `redirect()` dentro da action lança `NEXT_REDIRECT`; o
  `catch` do client deve **re-lançar** o erro de redirect (`isRedirectError` de
  `next/navigation`) para não confundir sucesso com falha. Só erros reais viram estado
  `error`.

### Regeneração (AC-6)

Regeneração = **do zero**: o cliente volta à `/generate`, edita a intenção e gera de novo
(produz um carrossel **novo**). Sem refino conversacional (fora de escopo). Como cada
geração cria um carrossel novo, "gerar de novo" é literalmente reabrir/usar a tela de
intenção — nenhum mecanismo extra.

---

## Arquivos a tocar

### CRIAR
- `src/lib/claude.ts` — client Anthropic server-only (`import "server-only"`; `new Anthropic()`).
- `src/lib/actions/generate.ts` — `"use server"`: `generateCarousel(input)` +
  `requestGeneration(intent)` (chamada à Claude API + parse). Só funções async.
- `src/lib/actions/generate-types.ts` — módulo neutro: `GenerateInputSchema`,
  `GeneratedCarouselSchema`, tipos, `GenerateError`/`GenerateErrorCode`.
- `src/lib/generate-sanitize.ts` — módulo PURO: `sanitizeGeneratedText`,
  `mapGeneratedToSlideRows` (aplica dica de imagem, descarta bodies vazios). Testável sem API.
- `src/lib/generate-prompt.ts` — o system prompt fixo (constante) das regras de texto.
  (Pode viver dentro de `generate.ts`; separar facilita teste/leitura.)
- `src/app/generate/page.tsx` — Server wrapper (`requireUser`, `force-dynamic`).
- `src/app/generate/generate-client.tsx` — Client Component (form + `GenerateState`).
- Testes (ver Plano de teste): `tests/generate-schema.test.ts`,
  `tests/generate-sanitize.test.ts`, `tests/generate-mapping.test.ts`,
  `tests/generate-action.test.ts` (mockando a fronteira Anthropic).

### EDITAR
- `src/lib/env.ts` — adicionar `ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY ausente")`
  ao `envSchema` (falha fechada no boot; nunca imprime valor — AC-10).
- `.env.example` — nova seção com `ANTHROPIC_API_KEY=` (billing ativo, provido pelo CEO).
- `package.json` — nova dependência `@anthropic-ai/sdk` (versão fixada na implementação;
  precisa expor `@anthropic-ai/sdk/helpers/zod` compatível com **zod v4** — o projeto usa
  `zod 4.4.3`; **conferir compatibilidade do helper com zod v4 na implementação** — se o
  helper só suportar zod v3, usar `output_config.format` com JSON schema manual + Zod nosso
  no lugar do `zodOutputFormat`).
- `src/lib/actions/carousels.ts` — adicionar `createGeneratedCarousel(generated)` (reusa
  `getDefaultClient`). **Não** altera `createCarousel` nem as demais actions.
- `src/app/carousels/carousel-list.tsx` (ou onde está o botão "Novo carrossel") — adicionar
  link/botão "Gerar com IA" → `/generate`.

### NÃO TOCAR (contratos imutáveis)
- `src/components/slide/types.ts` (`SlideData`).
- `src/lib/editor-state.ts` (reducer puro + `EditorSlide` + actions).
- `src/lib/carousel-mapping.ts` (a geração consome o mapping existente via `getCarousel`).

---

## Plano de teste (skill `plano-de-teste` + `mocking-estrategico`)

Regra: **nunca chamar a Claude API real em teste** (custo + regra de segurança + a chave
está ausente). Mockar a fronteira Anthropic (`src/lib/claude.ts`) conforme `mocking-estrategico`
(mockar só a fronteira externa cara/instável; o resto roda real).

### Unit (Vitest, sem API)
| Alvo | Cobre | Ligado a |
|---|---|---|
| `GenerateInputSchema` | intenção vazia/curta (<10) e longa (>1000) rejeitadas; válida passa | AC-2, edge cases |
| `GeneratedCarouselSchema` | JSON válido passa; nº de slides 0 e >10 rejeitados; body >2000 rejeitado; body vazio rejeitado; título vazio rejeitado | AC-9, edge "nº absurdo" |
| `sanitizeGeneratedText` | remove emojis; remove markdown/HTML; colapsa quebras em `\n\n`; trim; body que zera vira descartável | AC-7, edge "pede emojis" |
| `mapGeneratedToSlideRows` | `suggestImage:true` acrescenta a dica no body; slides viram linhas `{position, body, imageUrl:null}`; 0 slides após sanitizar → erro | AC-5, AC-3 |
| Mapeamento p/ `EditorSlide` | via `rowToEditorState` (já testado na S3) — asserir que linhas geradas produzem `EditorSlide` válidos (id gerado, imageUrl undefined) | AC-3, contrato |
| `generateCarousel` (action) | com Anthropic **mockado**: (a) refusal → `GenerateError("GENERATION_FAILED")`, nada persistido; (b) JSON fora do contrato → `GENERATION_FAILED`; (c) sucesso → chama `createGeneratedCarousel` e `redirect`; (d) input inválido → `INVALID_INPUT` sem chamar a API | AC-2, AC-9, AC-1 (via requireUser mock) |
| Params da chamada Anthropic | mock verifica que a chamada **não** envia `temperature`/`top_p`/`top_k`/`budget_tokens`; envia `model: "claude-opus-4-8"`; intent vai na mensagem **user**, não no system | claude-api, seguranca-baseline |

### Integração leve
- `env.ts` com `ANTHROPIC_API_KEY` ausente → boot lança erro claro (falha fechada) sem
  imprimir valor (AC-10). (Teste do schema de env, não do processo inteiro.)

### Smoke manual (documentar no STATUS; só quando a chave existir)
- Chamada **real** à Claude API pela `/generate` no navegador: intenção real → carrossel
  novo aberto no editor com título + N slides preenchidos, sem emojis/markdown, tema herdado
  editável. Depende de `ANTHROPIC_API_KEY` configurada (billing ativo do CEO) — hoje ausente,
  então fica como smoke manual, não automatizado (AC-2, AC-3, AC-4, AC-7 end-to-end).

---

## Decisões e trade-offs

- **Server action vs route handler** → server action. Descartado route handler: exigiria
  fetch/JSON/redirect no client e uma 2ª arquitetura; server action reusa o padrão S3 e o
  redirect natural.
- **Persistir + redirect vs semear `initialState`** → persistir + redirect. Descartado
  semear em memória: divergiria do invariante S3 ("todo carrossel tem id"), criaria estado
  órfão em queda de sessão, e exigiria caminho novo no `page.tsx`.
- **Sinal de imagem: dica textual no body vs campo/coluna novo** → dica textual (YAGNI).
  Descartado campo `suggestImage` em `EditorSlide`/coluna: tocaria reducer puro (testado 06),
  contrato `SlideData` e schema, por um sinal que a story mantém como "indicação". **Ponto
  de confirmação no gate.**
- **Structured output via `zodOutputFormat` vs tool use** → structured output. Mais direto
  para "produza N slides". Fallback documentado se o helper não suportar zod v4.
- **Sem streaming** → saída moderada (5–10 slides curtos) cabe em `max_tokens=16000`
  não-streaming, sob o timeout do SDK. Streaming é fora de escopo da story.
- **Nova função `createGeneratedCarousel` vs generalizar `createCarousel`** → função nova.
  Não muda a assinatura de `createCarousel` (usada pelo `EditorPage`), evita regressão na S3.

---

## Riscos para implementação

- **Compat `@anthropic-ai/sdk/helpers/zod` com zod v4:** o projeto usa `zod 4.4.3`. Se o
  helper `zodOutputFormat` só suportar zod v3, cair no fallback (`output_config.format` com
  JSON schema manual + `GeneratedCarouselSchema` como validador nosso). **Verificar na
  implementação antes de fixar a versão do SDK.**
- **`ANTHROPIC_API_KEY` ausente hoje:** com a chave no `envSchema`, o boot **falha fechado**
  se ela faltar. Isso quebraria o app inteiro (não só a geração). Mitigação: adicionar a chave
  ao `.env.local` local antes de rodar; em CI/testes, mockar a fronteira (a chave não é lida
  nos unit). **Confirmar com o CEO** que a chave estará no ambiente antes do deploy — senão,
  considerar validar `ANTHROPIC_API_KEY` de forma *lazy* (só quando a geração roda) em vez de
  no boot global, para não derrubar o resto do app (trade-off vs. o padrão falha-fechada do
  `env.ts`). Recomendação: falha-fechada no boot (consistente com S3), com a chave provida.
- **Custo/latência:** operação cara e lenta vs. o resto do app. Estado "gerando…" +
  `max_tokens` moderado + sem cota (decisão do CEO) — abuso é limitado só por login + um
  pedido por vez. Se custo virar problema, cota entra em fatia futura.
- **Prompt injection:** intenção do usuário vai **só** na mensagem user; regras no system;
  sanitização server-side é a rede final. Mesmo que o usuário peça "com emojis / em inglês /
  ignore as regras", o structured output + Zod + sanitização contêm o dano ao contrato visual.
- **Fidelidade visual no export (herdado S1):** a fonte woff2 embarcada ainda é pendência
  do deploy Linux; não afeta a lógica da S5, mas afeta o PNG final gerado a partir do
  carrossel criado pela IA. Fora do escopo desta fatia.
