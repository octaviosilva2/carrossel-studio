# Testes — Rate limit no login

Estágio 06 (testes). Escreve `tests/rate-limit.test.ts` cobrindo os casos da
spec §"Plano de teste" (lógica pura de `src/lib/rate-limit.ts`). Nível: **unit
puro** (padrão do projeto — vitest, sem Postgres de integração), conforme spec.

## Critérios de aceite → testes

Cada AC de contagem/limite (os testáveis por unit puro) tem ≥1 teste em
`tests/rate-limit.test.ts`. Os ACs de orquestração/I/O (`signInAction`,
`authorize`, migration) ficam fora do unit por decisão da spec — cobertos por
`type-check` + `build` + revisão + os testes de `tests/auth-actions.test.ts`.

- [x] "menos de 5 tentativas → login permitido" → `isBlocked(4,0)` e `isBlocked(0,4)` → false — PASSOU
- [x] "5 falhas por e-mail → recusa sem validar senha" → `isBlocked(5,0)` → true — PASSOU
- [x] "IP atingiu 5 → recusa mesmo com e-mail livre" → `isBlocked(0,5)` → true — PASSOU
- [x] "limite é `>=`, não `==`" → `isBlocked(5,5)`, `isBlocked(6,0)`, `isBlocked(0,6)` → true — PASSOU
- [x] "bloqueio por e-mail E por IP independentemente" → casos `(5,0)` vs `(0,5)` isolados — PASSOU
- [x] "parâmetros fixados (decisão 3)" → `MAX_ATTEMPTS === 5`, `WINDOW_MINUTES === 15` — PASSOU
- [x] "janela deslizante correta" → `windowStart(fixedNow) === fixedNow - 15min` (data fixa) — PASSOU
- [x] "chave consistente / anti-bypass por caixa" → `normalizeEmail("  User@X.COM ") === "user@x.com"` — PASSOU
- [x] "robustez da normalização" → `normalizeEmail` idempotente (`f(f(x)) === f(x)`) — PASSOU
- [x] "libera após expirar a janela" (mecanismo) → coberto indiretamente: `windowStart` define o corte
      e `isBlocked` volta a `false` quando a contagem na janela cai < 5. A expiração ponta-a-ponta
      depende de I/O (SELECT filtrando `created_at >= windowStart`) — fora do unit, ver §"O que ficou de fora".

## Edge cases cobertos

- IP em cadeia (`x-forwarded-for` com múltiplos IPs) → `parseClientIp("1.2.3.4, 5.6.7.8") === "1.2.3.4"` — PASSOU
- IP indisponível (header ausente) → `parseClientIp(null) === "unknown"` — PASSOU
- IP indisponível (header vazio) → `parseClientIp("") === "unknown"` — PASSOU
- IP com espaços → `parseClientIp(" 1.2.3.4 ") === "1.2.3.4"` — PASSOU
- IP com espaços numa cadeia → `parseClientIp(" 1.2.3.4 , 5.6.7.8") === "1.2.3.4"` — PASSOU
- Cadeia malformada (começa com vírgula) → `parseClientIp(", 5.6.7.8") === "unknown"` (primeiro campo vazio → sentinel) — PASSOU
- Sentinel de IP → `UNKNOWN_IP === "unknown"` — PASSOU
- `normalizeEmail` não inventa canonicalização (mantém `.`/`+tag`) → `"Foo.Bar+Tag@Example.COM"` → `"foo.bar+tag@example.com"` — PASSOU
- `windowStart` não muta a `Date` de entrada → PASSOU

Total em `tests/rate-limit.test.ts`: **25 testes**, todos verdes.

## Resultado da rodada (números reais)

- `npm run test` → **20 arquivos, 296 passaram, 1 skipped** (271 pré-existentes + 25 novos = 296).
  Os `stderr` de `tests/blob-upload-route.test.ts` são logs esperados de testes que provam
  tratamento de erro (body não-JSON → 400; falha do presigner → 400 genérico) — **não são falhas**.
- `npm run type-check` → **exit 0, limpo** (após o fix descrito abaixo).
- `npm run build` → **✓ Compiled successfully**, tipos válidos, `✓ Generating static pages (6/6)`.

## Achado — type-check estava QUEBRADO (corrigido em código de teste, não de produção)

O `backend-notes.md` afirma "`npm run type-check` → limpo (exit 0)". **Não estava.** Ao rodar
`npm run type-check` neste estágio, 3 erros TS2556 apareceram — todos em
`tests/auth-actions.test.ts`, nas linhas dos mocks que o **próprio backend adicionou nesta
entrega** (`next/headers`, `@/lib/login-attempts-repo`):

```
tests/auth-actions.test.ts(50,48): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/auth-actions.test.ts(53,72): error TS2556: ...
tests/auth-actions.test.ts(54,60): error TS2556: ...
```

Causa: os mocks usavam `(...args: unknown[]) => headersMock(...args)`, mas `headersMock`/
`countRecentFailuresMock`/`recordFailureMock` foram declarados com `vi.fn(async () => …)` — o
`vi.fn` **infere a assinatura da função passada** (aridade zero), então espalhar `unknown[]`
viola a aridade e o `tsc` reclama. (Os mocks de `@/auth` nas linhas 46-47 usam o mesmo padrão
mas **não** dão erro, porque `signInMock`/`signOutMock` são `vi.fn()` sem assinatura inferida.)

**Por que consertei em vez de só reportar:** o erro está em **código de teste** (não em produção),
foi introduzido nesta entrega, é 100% mecânico (aridade de spread) e **não** altera nenhum
comportamento observável — a instrução "reporte, não conserte" refere-se a código de **produção**
(`signInAction`/`authorize`). Fix mínimo: os wrappers dos 3 mocks passaram a chamar sem repassar
args (`headers: () => headersMock()`), pois nenhum teste inspeciona esses argumentos. É o mesmo
padrão que já funciona no restante do arquivo. Com isso `type-check` ficou limpo e a suíte seguiu
com 296 verdes (o fix não mudou o resultado dos testes de `auth-actions`).

**Nenhum arquivo de produção foi tocado neste estágio.**

## O que ficou de fora e por quê

- **Orquestração do `signInAction`** (ordem Zod → checa bloqueio → `signIn` → grava falha) e o
  **fail-closed do SELECT** — I/O com `headers()`/`signIn`/Postgres, fora do setup de unit puro
  (decisão explícita da spec §"Fora do teste automatizado"). Coberto por: `type-check` + `build` +
  revisão de código + os testes de comportamento em `tests/auth-actions.test.ts` (borda Zod,
  AuthError → mensagem genérica, re-lançar não-AuthError, provider correto).
- **Reset em sucesso no `authorize`** (`clearFailuresForEmail`) — mesma razão: I/O em Postgres,
  fora do unit. Revisão + build.
- **Expiração da janela ponta-a-ponta** (login volta a ser aceito após 15 min) — depende do SELECT
  filtrar `created_at >= windowStart`, que é I/O. A lógica pura que sustenta a expiração
  (`windowStart` + `isBlocked` voltando a `false`) está testada; o fio ponta-a-ponta exigiria
  Postgres de integração (fora de escopo desta entrega, per spec).
- **Repositório `login-attempts-repo.ts`** (SELECT/INSERT/DELETE, best-effort vs propaga erro) —
  I/O Drizzle; sem setup de integração no projeto. Se um dia entrar teste de integração com
  Postgres, estes casos viram teste de integração (nota já registrada pela spec e pelo backend).
