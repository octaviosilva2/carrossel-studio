# Backend — Geração de carrossel com IA (Porta A, S5)

## O que foi implementado

- `src/lib/actions/generate-types.ts` — módulo NEUTRO (sem `"use server"`):
  - `GenerateInputSchema` (Zod) — borda do input: `intent` string trim 10..1000.
  - `GeneratedCarouselSchema` (Zod NOSSO) — revalida a saída da IA: `title` 1..120,
    `slides` 1..10, cada `{ body: 1..2000, suggestImage: boolean }`.
  - `GenerateError` (classe com `code` estável) + `GenerateErrorCode`
    (`INVALID_INPUT | GENERATION_FAILED | NOT_CONFIGURED`) + `isGenerateError`.
- `src/lib/generate-prompt.ts` — módulo NEUTRO: `GENERATE_SYSTEM_PROMPT` (regras
  visuais/texto como SYSTEM), `GENERATE_MODEL = "claude-sonnet-4-6"`,
  `GENERATE_MAX_TOKENS = 16000`.
- `src/lib/generate-sanitize.ts` — módulo PURO (camada 3): `sanitizeGeneratedText`
  (remove emojis, tags HTML, marcadores markdown `* _ \` #`, normaliza parágrafos
  em `\n\n`, trim); `mapGeneratedToSlideRows` (sanitiza title+bodies, aplica a dica
  de imagem no body quando `suggestImage`, descarta bodies vazios, reindexa
  `position`; retorna `null` se sobrar 0 slide). `IMAGE_HINT` exportado.
- `src/lib/claude.ts` — FRONTEIRA Anthropic, `server-only`:
  `createAnthropicClient()` (lê `process.env.ANTHROPIC_API_KEY` LAZY, ausente =>
  `GenerateError("NOT_CONFIGURED")`); `requestGeneration(intent, client?)` (chama
  `messages.parse` com structured output, checa `stop_reason === "refusal"` e
  `parsed_output === null` antes de ler, revalida com o Zod nosso). Erros da API
  viram `GENERATION_FAILED` (log só do status HTTP, nunca `.message`/chave).
- `src/lib/actions/generate.ts` — `"use server"`: `generateCarousel(input)` —
  `requireUser()` → Zod na borda → `requestGeneration` → `mapGeneratedToSlideRows`
  → `createGeneratedCarousel` → `redirect("/editor?id=")`. Retorno `Promise<never>`.
- `src/lib/actions/carousels.ts` — NOVA `createGeneratedCarousel(mapped)`: insere
  1 carousel (title gerado, overrides null => herda identidade/tema default) + N
  slides em TRANSAÇÃO; `ownerId` sempre da sessão; reusa `getDefaultClient`.
  `createCarousel` e demais actions intactas.
- `src/app/generate/page.tsx` — Server wrapper (`requireUser`, `force-dynamic`).
- `src/app/generate/generate-client.tsx` — Client Component: form de intenção,
  `GenerateState` (union discriminada idle/generating/error), um pedido por vez
  (controles desabilitados durante `generating`), `aria-live`, erro genérico pt-BR,
  `unstable_rethrow` para deixar o Next tratar o redirect de sucesso.
- `src/app/carousels/page.tsx` — botão "Gerar com IA" (→ `/generate`) ao lado de
  "Novo carrossel".
- `.env.example` — seção `ANTHROPIC_API_KEY=` com comentário (validação lazy).
- `package.json` — dependência `@anthropic-ai/sdk@^0.109.1`.

## Contrato real entregue (o Frontend consome isto)

```ts
// Import de TIPOS: "@/lib/actions/generate-types" (módulo neutro, safe no client)
import { generateCarousel } from "@/lib/actions/generate";
import type { GenerateInput } from "@/lib/actions/generate-types";

// Server action:
generateCarousel(input: GenerateInput): Promise<never>
//   GenerateInput = { intent: string }  (trim 10..1000)
//   Sucesso: redirect("/editor?id=<novo>") — lança NEXT_REDIRECT (navegação).
//   Erro:    lança GenerateError (code: INVALID_INPUT | GENERATION_FAILED | NOT_CONFIGURED).
```

- O client NÃO recebe payload de sucesso — aterrissa via navegação no editor.
- Erro: o client trata TODOS os `code` com a MESMA mensagem genérica pt-BR
  ("Não consegui gerar o carrossel. Tente novamente."). `code` é para log/telemetria
  e testes — nunca vaza ao usuário.
- No `catch`, chamar `unstable_rethrow(err)` (de `next/navigation`) ANTES de setar
  estado de erro — re-lança o redirect de sucesso; só erro real vira estado `error`.
  (O `generate-client.tsx` já faz isso; documentado caso o Frontend altere a UI.)

## Migrations / dados

- **Nenhuma migration. Nenhuma coluna nova.** Usa o schema S3 tal como está.
- `createGeneratedCarousel`: INSERT 1 linha `carousels` + N linhas `slides` em
  transação. Não-destrutivo. `imageUrl = null` em todos os slides (upload é manual).
- Sinal de imagem (AC-5): materializado como TEXTO no `body` (`IMAGE_HINT`), sem
  campo/coluna novo, sem tocar `SlideData`/`EditorSlide`/reducer (decisão do CEO).
- Authz: `ownerId` sempre da sessão; aterrissagem via `getCarousel` (já filtra dono).

## Comandos rodados

- `npm install @anthropic-ai/sdk` → added 6 packages; fixou `@anthropic-ai/sdk@^0.109.1`.
- `npm run type-check` (`tsc --noEmit`) → **passou, zero erro**.
- `npm run build` (`next build`) → **compilou com sucesso**; rota `/generate`
  gerada (dinâmica, 3.18 kB). Nota: "Skipping linting" — o projeto não tem ESLint
  configurado no Next; a validação de tipos do build cobre o type-check.
- `npm test` (`vitest run`) → **171 passed, 1 skipped, 0 falha** (nenhuma regressão
  nos testes existentes; testes novos são do estágio 06).

## Desvios da spec

- **Modelo:** `claude-sonnet-4-6` (não `claude-opus-4-8` da spec) — decisão do CEO
  em 2026-07-02, registrada no STATUS. Params: `thinking:{type:"adaptive"}` (sem
  `budget_tokens`), sem `temperature/top_p/top_k`, `max_tokens:16000`, sem streaming.
  Não uso `output_config.effort` (opcional; omitido — default do modelo).
- **Validação da ANTHROPIC_API_KEY: LAZY** (decisão do CEO), NÃO no `envSchema` do
  boot como a spec sugeria em `src/lib/env.ts`. Lida dentro de `createAnthropicClient`;
  ausente => `NOT_CONFIGURED`. `src/lib/env.ts` NÃO foi tocado — o app roda sem a chave.
- **`zodOutputFormat` com zod v4: COMPATÍVEL, usado (sem fallback).** O helper
  `@anthropic-ai/sdk/helpers/zod` (SDK 0.109.1) importa de `zod/v4` e o peerDependency
  do SDK é `"zod": "^3.25.0 || ^4.0.0"` — suporta o zod 4.4.3 do projeto. Usei
  `client.messages.parse({ output_config: { format: zodOutputFormat(GeneratedCarouselSchema) } })`.
  O fallback (JSON schema manual) NÃO foi necessário. A camada 2 (Zod nosso via
  `safeParse` em `requestGeneration`) continua reforçando min/max de tamanho/range,
  que o schema da API não honra.
- **`isRedirectError` → `unstable_rethrow`:** a spec citava `isRedirectError`, mas
  esse símbolo não é exportado publicamente por `next/navigation`. Usei
  `unstable_rethrow` (export oficial do Next 15 para re-lançar erros de controle de
  fluxo). Efeito idêntico: redirect de sucesso não vira erro de UI.

## O que o Frontend precisa saber

- Import da action: `import { generateCarousel } from "@/lib/actions/generate"`.
  Tipos: `import type { GenerateInput } from "@/lib/actions/generate-types"`.
- Chamar dentro de `startTransition(async () => { ... })`; no `catch`, chamar
  `unstable_rethrow(err)` ANTES de setar erro (re-lança o redirect de sucesso).
- Sucesso NÃO tem retorno — a navegação para `/editor?id=` é automática.
- Erro é sempre genérico pt-BR ao usuário; nunca inspecionar/exibir o `code`.
- A UI já está entregue (`generate-client.tsx`); a rota vive em `/generate` e há
  link "Gerar com IA" em `/carousels`. A fronteira Anthropic está isolada em
  `src/lib/claude.ts` (`requestGeneration(intent, client?)` aceita client injetado)
  para o 06 mockar sem chamar a API real.
- **Ainda não houve smoke real contra a Claude API** (não foi chamada de verdade
  nesta fatia). Fica como smoke manual quando o CEO validar (chave já no `.env.local`).

## Como o 06 mocka a fronteira

- `src/lib/claude.ts` isola TODA a interação com o SDK. Duas estratégias:
  1. **Injeção:** `requestGeneration(intent, fakeClient)` — passar um objeto com
     `messages.parse` mockado; não toca env nem SDK real.
  2. **Mock de módulo:** `vi.mock("@/lib/claude")` e stubar `requestGeneration`
     na action `generateCarousel` (testar orquestração: refusal → GENERATION_FAILED,
     JSON fora do contrato → GENERATION_FAILED, sucesso → createGeneratedCarousel+redirect,
     input inválido → INVALID_INPUT sem chamar a API).
- Módulos puros (`generate-sanitize.ts`) e schemas (`generate-types.ts`) testam
  sem qualquer mock — sem API, sem DB.
```
