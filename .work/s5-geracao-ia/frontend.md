# Frontend — Geração de carrossel com IA (Porta A, S5)

> Estágio 05. A UI de intenção já havia sido entregue pelo backend (04). Este
> estágio **revisou e poliu** essa UI para bater 100% com a spec/story e os
> padrões do projeto, consumindo o contrato REAL da action `generateCarousel`.
> **Não** houve reescrita do zero.

## O que foi implementado

- `src/app/generate/page.tsx` — Server wrapper (inalterado). `requireUser()` barra
  o visitante antes de renderizar (AC-1); `force-dynamic`. Renderiza `<GenerateClient />`.
- `src/app/generate/generate-client.tsx` — Client Component da tela de intenção.
  **Ajustes deste estágio:**
  - **Limpa o erro ao editar** (`handleIntentChange`): um estado `error` de tentativa
    anterior volta a `idle` assim que o usuário digita — o erro pertence à submissão
    passada; a nova edição começa limpa (padrão de formulário).
  - **Aviso de mínimo não atingido** (`isTooShort`): quando o usuário já digitou algo,
    mas ainda abaixo de `INTENT_MIN` (10), a dica vira "Descreva um pouco mais — pelo
    menos 10 caracteres" (edge case "intenção vazia/curta" da story). Espaço em branco
    puro conta como vazio (usa `trim`) e **não** dispara o aviso. Comunicação por
    **texto**, não só por cor (a11y).
  - **A11y de formulário:** o `<Textarea>` ganhou `aria-describedby` ligando o campo à
    dica (`intent-hint`) e ao contador (`intent-counter`), e `aria-invalid` quando o
    texto está abaixo do mínimo (skill `acessibilidade-a11y`).
  - **Contador** com `tabular-nums` (não "pula" largura ao digitar) e id próprio.

## Estados cobertos (onde cada um aparece)

- **idle / vazio:** textarea + botão "Gerar carrossel". Botão **desabilitado** enquanto
  o texto trimado estiver fora de `[10, 1000]` (validação de UX espelhando o
  `GenerateInputSchema`; a borda do servidor é a verdade). Dica neutra orienta o usuário.
- **inválido (curto):** dica vira aviso de mínimo + `aria-invalid` no campo; botão segue
  desabilitado. Sem chamar a API (edge case da story).
- **gerando (loading):** `isGenerating` (`generating` ou `isPending` do `useTransition`)
  → botão vira "Gerando…", textarea e botão **desabilitados** (um pedido por vez, AC-8),
  e a região `aria-live="polite"` anuncia "Gerando o carrossel… isso pode levar alguns
  segundos".
- **erro:** mensagem **genérica pt-BR** ("Não consegui gerar o carrossel. Tente
  novamente."), `role="alert"`, cor `text-destructive`. Controles reabilitados; o texto
  digitado é **preservado** para nova tentativa (AC-9). **Todos** os códigos de erro do
  backend (`INVALID_INPUT | GENERATION_FAILED | NOT_CONFIGURED`) caem na mesma mensagem
  — o `code` é para log/telemetria, nunca vaza ao usuário (inclui NOT_CONFIGURED = chave
  ausente e refusal).
- **sucesso:** não há estado local. A action `redirect("/editor?id=")` lança
  `NEXT_REDIRECT`; o `catch` chama `unstable_rethrow(err)` **antes** de setar erro, então
  o Next trata a navegação e o usuário aterrissa no editor com o carrossel novo. Enquanto
  o transition está pendente, o estado visível é "gerando".

## Integração com backend (confere com o contrato real?)

- **Import da action:** `import { generateCarousel } from "@/lib/actions/generate"` —
  confere com o contrato (`backend.md`).
- **Tipos:** o client passa `{ intent }`; a action valida com `GenerateInputSchema`
  (`intent` trim 10..1000). Os limites de UX (`INTENT_MIN=10`, `INTENT_MAX=1000`) são
  **idênticos** ao schema do backend — sem divergência.
- **Retorno de sucesso:** `Promise<never>` (redirect). O client **não** espera payload;
  aterrissa por navegação. Trata o redirect com `unstable_rethrow` conforme instruído no
  `backend.md` (o símbolo `isRedirectError` da spec não é export público; `unstable_rethrow`
  é o oficial do Next 15). **Sem duplo submit:** `canSubmit` exige `!isGenerating`, e o
  handler tem guarda `if (!canSubmit) return`.
- **Erros:** o backend lança `GenerateError` com `code`; o client trata todos com a mesma
  mensagem genérica, sem inspecionar o `code`. Coerente com o contrato.
- **Sem chave de API no cliente:** a chamada à Claude API é 100% server-side
  (`src/lib/claude.ts`, `server-only`); o client só chama a server action. Nada exposto.

## Comandos rodados

- `npm run type-check` (`tsc --noEmit`) → **passou, zero erro**.
- `npm run build` (`next build`) → **compilou**; rota `/generate` dinâmica (3.32 kB,
  First Load 117 kB). "Skipping linting" (projeto sem ESLint no Next; type-check cobre).
- `npm test` (`vitest run`) → **171 passed, 1 skipped, 0 falha** — sem regressão nos
  testes existentes (testes novos da geração são do estágio 06).

## Desvios da spec

- **`isRedirectError` → `unstable_rethrow`:** a spec citava `isRedirectError` no `catch`,
  mas esse símbolo não é export público de `next/navigation` (já documentado no `backend.md`).
  Usado `unstable_rethrow`, efeito idêntico: redirect de sucesso não vira erro de UI. Mantido.
- **Sinal de imagem (AC-5):** materializado como dica textual no `body` pelo backend — **nada**
  a fazer no front (aparece como texto do slide no editor). Sem placeholder visual (decisão do
  CEO no gate). O front não toca `SlideData`/reducer.
- **Nenhum outro desvio.** A UI cumpre a story, trata idle/vazio/inválido/gerando/erro/sucesso,
  consome o contrato real e passa type-check + build + testes.
