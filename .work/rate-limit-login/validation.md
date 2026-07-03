# Validação — Rate limit no login

> Auditoria independente da entrega contra a story aprovada (`story.md`), a spec
> (`spec.md`) e as 7 decisões do gate (`STATUS.md`). Build/type-check/test rodados
> por mim (validador), saída real colada abaixo. Nada foi editado nesta auditoria.
> Data: 2026-07-03.

---

## Critérios de aceite

### Bloqueio por excesso de tentativas

- [x] **< 5 falhas na janela → login permitido, redireciona /carousels** — CUMPRIDO.
  Evidência: `auth.ts:99-103` conta e-mail+IP na janela; `isBlocked` só bloqueia em
  `>= 5` (`rate-limit.ts:45-47`). Abaixo do limite o fluxo cai no `signIn(..., redirectTo: "/carousels")`
  (`auth.ts:117-121`). Teste `isBlocked(4,0)`/`isBlocked(0,4)` → false (`rate-limit.test.ts:20-28`).
  Teste `auth-actions.test.ts:116-130` prova que com contagem zero o `signIn` é chamado
  com provider `"credentials"` e `redirectTo: "/carousels"`.

- [x] **5 falhas por e-mail em 15 min → recusa SEM validar a senha, mensagem genérica** —
  CUMPRIDO. Evidência: `auth.ts:100-103` — se `isBlocked` retorna true, `return { error: GENERIC_ERROR }`
  **antes** de chamar `signIn` (a validação de senha vive no `authorize`, que nem é
  atingido). `GENERIC_ERROR === "E-mail ou senha inválidos"` (`auth.ts:36`). Teste
  `isBlocked(5,0)` → true (`rate-limit.test.ts:30-33`).

- [x] **5 falhas por IP → recusa mesmo com e-mail livre** — CUMPRIDO. `isBlocked` é
  `emailFailCount >= MAX || ipFailCount >= MAX` (`rate-limit.ts:46`) — o ramo de IP é
  independente do de e-mail. `countRecentFailures` sempre conta o IP, mesmo com
  `email = null` (`login-attempts-repo.ts:38-46`). Teste `isBlocked(0,5)` → true
  (`rate-limit.test.ts:35-39`).

- [x] **Janela expira → login volta a ser aceito** — CUMPRIDO (lógica) / parcialmente
  provado por unit. A janela é deslizante: `windowStart(now) = now - 15min`
  (`rate-limit.ts:53-55`) e a contagem filtra `gte(createdAt, windowStart)`
  (`login-attempts-repo.ts:32,44`). Passados 15 min, as falhas antigas saem do filtro,
  a contagem cai < 5 e `isBlocked` volta a false. Teste `windowStart` determinístico
  (`rate-limit.test.ts:81-103`). 🟡 **A expiração ponta-a-ponta (SELECT com o filtro
  temporal real) não tem teste** — é I/O, fora do unit por decisão da spec. Ver
  "Escopo/testes".

### Contabilização das tentativas

- [x] **Falha (senha errada / e-mail inexistente / entrada inválida) é registrada
  com e-mail + IP** — CUMPRIDO. Três caminhos gravam:
  (a) Zod inválido → `recordFailure(emailKey, ip)` (`auth.ts:90`);
  (b) `AuthError` (senha errada / e-mail inexistente) → `recordFailure(email, ip)` (`auth.ts:128`).
  `recordFailure` faz um `INSERT` na `login_attempts` (`login-attempts-repo.ts:65`).

- [x] **Sucesso zera o contador daquele e-mail** — CUMPRIDO. `authorize`, após
  `passwordOk`, chama `clearFailuresForEmail(normalizeEmail(email))` (`auth.ts:57` de
  `src/auth.ts`) → `DELETE WHERE email = ?` (`login-attempts-repo.ts:84`). Não toca IP
  (decisão 4). É o único ponto que sabe que a senha bateu — `signIn` redireciona/lança
  e o código após na action é inatingível (`auth.ts:122`, comentado como tal).

### Não vazar informação ao atacante

- [x] **Mensagem idêntica em toda recusa** — CUMPRIDO. Rastreei os 5 casos e todos
  retornam a **mesma** constante `GENERIC_ERROR = "E-mail ou senha inválidos"`:
  | Caso de recusa | Local | Retorno |
  |---|---|---|
  | Zod inválido | `auth.ts:91` | `{ error: GENERIC_ERROR }` |
  | Bloqueio (rate limit) | `auth.ts:102` | `{ error: GENERIC_ERROR }` |
  | Falha do SELECT (fail-closed) | `auth.ts:111` | `{ error: GENERIC_ERROR }` |
  | Senha errada / e-mail inexistente (`AuthError`) | `auth.ts:129` | `{ error: GENERIC_ERROR }` |
  Nenhum caminho constrói string diferente. A UI (`login-form.tsx:62-66`) só renderiza
  `state.error` inline — não há campo "bloqueado"/"tentativas restantes" (contrato
  `SignInResult { error: string }` inalterado, `auth.ts:39-41`). Teste
  `auth-actions.test.ts:111-113`: mensagem não casa `/email|senha incorreta|não existe/i`.

- [x] **E-mail inexistente martelado é indistinguível de e-mail que existe** — CUMPRIDO.
  A tabela `login_attempts` **não** tem FK para `users` (`schema.ts:105-124`) — grava o
  texto do e-mail tentado independentemente de o user existir. O `authorize` retorna
  `null` tanto para user inexistente quanto para senha errada (`auth.ts:47,50` de
  `src/auth.ts`), e o Auth.js converte ambos no mesmo `AuthError`. Mesma contagem, mesmo
  bloqueio, mesma mensagem. Não vira oráculo de enumeração.
  🟡 Ressalva de timing — ver Segurança (achado 🟡-1).

### Persistência e correção sob serverless

- [x] **Contagem consistente entre instâncias (vive no Postgres)** — CUMPRIDO. Todo o
  estado está na tabela `login_attempts` (Postgres), lido/escrito via `@/db`
  (`login-attempts-repo.ts:9`). Zero estado em memória de processo. `count(*)` é
  atômico no SELECT e cada falha é um `INSERT` independente — sem read-modify-write, a
  contagem não "escapa" sob concorrência (edge case "corrida" da story tratado por
  design; `spec.md:279-284`).

- [x] **Migration Drizzle cria `login_attempts` no padrão do schema** — CUMPRIDO.
  `drizzle/0001_loose_cable.sql`: PK `uuid DEFAULT gen_random_uuid()`, `created_at
  timestamptz DEFAULT now()`, e **2 índices compostos** `(email, created_at)` e
  `(ip_address, created_at)` que servem exatamente as consultas por e-mail e por IP na
  janela. Só `CREATE TABLE` + `CREATE INDEX` — **não destrutiva**. Schema em
  `schema.ts:105-124` bate com o `.sql` gerado. STATUS registra que foi aplicada no
  Postgres real via `db:migrate`.

### Testes e build

- [x] **Cobertura (a)–(e)** — CUMPRIDO para a lógica pura; (c) parcial. `rate-limit.test.ts`
  (25 testes): (a) `isBlocked(4,0)`/`(0,4)`; (b) `isBlocked(5,0)`; (d) mensagem — coberta
  em `auth-actions.test.ts`; (e) e-mail vs IP isolados `(5,0)` vs `(0,5)`. (c) "libera após
  expirar" coberto **indiretamente** (windowStart + isBlocked), não ponta-a-ponta (I/O).
- [x] **`npm run test` e `npm run build` verdes** — CUMPRIDO (rodados por mim, abaixo).

---

## Edge cases

| Edge case (story) | Tratado? | Evidência |
|---|---|---|
| IP ausente/irreconhecível | ✅ | `parseClientIp(null\|"")` → `"unknown"` (`rate-limit.ts:31-38`); `readClientIp` try/catch nunca lança (`auth.ts:48-56`). A falta de IP não desliga o bloqueio por e-mail (chaves independentes). Testes `rate-limit.test.ts:137-162`. |
| Múltiplos usuários atrás do mesmo IP (NAT) | ✅ (aceito) | Bloqueia por IP (segurança > conveniência, decisão da story); reset em sucesso limpa **só** o e-mail, não o IP (`auth.ts:57` de src/auth.ts), pra não penalizar outros e-mails legítimos no NAT. |
| Entrada inválida no form | ✅ | Zod inválido conta como falha (IP sempre; e-mail só se sintaticamente válido) e retorna genérico, nunca erro técnico (`auth.ts:83-92`). |
| Banco indisponível (checagem) | ✅ | Fail-closed: SELECT lança → `catch` → `return GENERIC_ERROR` (`auth.ts:104-112`). Não libera às cegas. |
| Banco indisponível (gravação/limpeza) | ✅ | Best-effort: `recordFailure`/`clearFailuresForEmail` try/catch, logam e não lançam (`login-attempts-repo.ts:64-72, 83-91`). Um write secundário não derruba a resposta. |
| Corrida (2 tentativas simultâneas) | ✅ | `count(*)` atômico + INSERTs independentes; sem RMW frágil (`spec.md:279-284`). |
| Crescimento infinito da tabela | 🟢 fora de escopo | Decisão 7: a consulta sempre filtra por janela, correção não depende de limpar. Volume baixo. Limpeza é fatia futura. |
| Sucesso após falhas (< limite) | ✅ | Entra normalmente e o reset zera o e-mail (`auth.ts:57` de src/auth.ts) — sem penalidade carregada. |

---

## Testes/build (rodados por mim)

**`npm run type-check`** → **exit 0, limpo**:
```
> tsc --noEmit
=== EXIT: 0 ===
```

**`npm run test`** → **20 arquivos, 296 passaram, 1 skipped, exit 0**:
```
 ✓ tests/rate-limit.test.ts  (implícito nos 296; 25 casos)
 ✓ tests/auth-actions.test.ts (6 tests)
 Test Files  20 passed (20)
      Tests  296 passed | 1 skipped (297)
=== EXIT: 0 ===
```
Os `stderr` em `tests/blob-upload-route.test.ts` são logs esperados de testes que
provam tratamento de erro (body não-JSON → 400; falha do presigner → 400 genérico) —
**não são falhas**. Confirmei: o resumo final é "20 passed", exit 0.

**`npm run build`** → **compilou, 6/6 páginas, exit 0**:
```
 ✓ Compiled successfully in 2.9s
   Skipping linting
 ✓ Generating static pages (6/6)
=== EXIT: 0 ===
```

**Nota sobre "Skipping linting":** o build **não** roda ESLint
(`next.config.mjs`: `eslint.ignoreDuringBuilds: true`). Tentei rodar lint por fora —
o projeto **não tem ESLint configurado** (`npx eslint` v10 não achou `eslint.config.js`;
`next lint` foi descontinuado no Next 15). Isso é **dívida pré-existente da fundação**
(`next.config.mjs:4`: "Config de lint entra numa fatia futura"), **não** introduzida por
esta story. Registro como observação, não bloqueio — "build verde" aqui não prova
ausência de problemas de estilo, mas o `type-check` (que roda o `tsc` real) cobre
corretude de tipos e passou limpo.

---

## Segurança

**🟢 SQL injection — sem vetor.** Todo I/O passa por Drizzle com `eq()`/`gte()`/`and()`
parametrizados (`login-attempts-repo.ts:29-46, 65, 84`). E-mail e IP são texto opaco,
zero concatenação de string em SQL. Confirmado lendo os 3 métodos do repo. Acesso é
server-only (`login-attempts-repo.ts:7`, `db/index.ts:6`).

**🟢 PII em log — controlado.** Os `console.error` logam só `error.message`
técnico (`login-attempts-repo.ts:69-71, 87-90`; `auth.ts:107-110`), **nunca** a senha
nem o hash. O e-mail pode aparecer na mensagem de erro do Postgres em log de servidor
interno — aceitável (não é segredo), e não vaza ao cliente (mensagem ao usuário é sempre
genérica). Alinhado à spec `spec.md:171-178`.

**🟡-1 Oráculo de timing (bloqueado vs. senha-errada).** Achado condicional, **não
bloqueia**. Quando bloqueado, a action retorna **antes** do `signIn` → não roda bcrypt
(`auth.ts:100-103`). Quando a senha está errada, o `authorize` roda `compare()` do
bcrypt (~250 ms, `src/auth.ts:49`). Logo a resposta "bloqueado" volta **mais rápido** que
"senha errada" — um atacante que cronometra pode inferir que um e-mail/IP está bloqueado.
Impacto real **baixo**: (a) saber que está bloqueado não revela se a conta existe nem a
senha; (b) o bloqueio é justamente o sinal que já se quer que o atacante encontre (ele
para de tentar); (c) a story pede indistinguibilidade da **mensagem** e do
**comportamento de enumeração de contas** — isso está cumprido (e-mail inexistente e
existente têm timing idêntico entre si, pois ambos passam pelo mesmo caminho). A story
não exige defesa contra timing side-channel. Recomendo registrar como endurecimento
futuro (🟢), não corrigir agora. **Não é motivo de devolução.**

**🟢 Autorização.** N/A no sentido clássico — é o próprio fluxo de autenticação. A tabela
não guarda segredo (só e-mail tentado + IP). Sem RLS porque o Postgres é server-only
(não é Supabase; não há papel `anon`). Consistente com `spec.md:166-178`.

**🟢 Fail-closed real.** O default nega: SELECT falha → recusa (`auth.ts:104-112`). O
caminho de erro não deixa porta aberta. Confirmado.

Nenhum achado 🔴 de segurança.

---

## Escopo

**Sem extra indevido.** Os arquivos tocados batem exatamente com a spec §"Arquivos a
tocar": criados `rate-limit.ts`, `login-attempts-repo.ts`, `rate-limit.test.ts`;
editados `schema.ts`, `auth.ts` (actions), `src/auth.ts`, migration gerada. `parseClientIp`
foi extraída como função pura — a spec **recomendou** isso (`spec.md:263-264`), não é
scope creep. Nenhum componente React tocado (contrato do form inalterado).

**Fora de escopo respeitado.** Sem CAPTCHA, sem notificação por e-mail, sem desbloqueio
manual, sem lockout progressivo, sem Redis/vendor externo, sem rate limit em outras rotas.
Conferido contra `story.md:89-102`.

**Nada de "fora de escopo" virou furo.** A limpeza de registros antigos (decisão 7, fora
de escopo) não compromete a correção — a consulta sempre filtra por janela.

**Consistência da normalização (ponto crítico da auditoria) — CONFIRMADA.** Rastreei os
4 pontos que tocam a chave de e-mail; todos passam por `normalizeEmail`:
1. Contar: `email = normalizeEmail(parsed.data.email)` (`auth.ts:94`) → `countRecentFailures(email,...)` (`auth.ts:99`).
2. Gravar (AuthError): `recordFailure(email, ip)` mesmo `email` normalizado (`auth.ts:128`).
3. Gravar (Zod inválido): `normalizeEmail(rawEmail)` (`auth.ts:88`).
4. Limpar (sucesso): `clearFailuresForEmail(normalizeEmail(email))` (`src/auth.ts:57`).
As chaves batem exatamente → o reset em sucesso zera a mesma linha que a contagem
enxerga. Risco da spec `spec.md:310-313` (divergência de normalização) **mitigado**.

**Observação 🟢 (pré-existente, não desta story):** o `authorize` busca o user com
`eq(users.email, email)` usando o e-mail **cru** de `signIn` (`src/auth.ts:43`), não
normalizado. Se o operador digitar o e-mail em caixa diferente da cadastrada, a
autenticação falha (não acha o user) — mas isso é comportamento de auth pré-existente,
**ortogonal** ao rate limit, e não afeta nenhum AC desta story (a chave de rate limit é
sempre normalizada). Registro só como nota; fora do escopo desta entrega.

---

## Riscos do research (ADR 0003 / story)

| Risco / perguntas abertas | Situação |
|---|---|
| Fonte do IP (decisão 1) | ✅ Tratado: `headers()` → `x-forwarded-for` → 1º IP; sentinel `"unknown"`; nunca lança (`auth.ts:48-56`, `rate-limit.ts:31-38`). |
| Onde checar/registrar (decisão 2) | ✅ Tratado: check+IP no `signInAction`, reset por e-mail no `authorize` (divisão justificada; mesmo repo, sem duplicação). |
| Parâmetros 5/15min, janela deslizante (decisão 3) | ✅ Tratado: `MAX_ATTEMPTS=5`, `WINDOW_MINUTES=15`, `windowStart` (`rate-limit.ts:8,11,53`); testes fixam os valores. |
| Reset em sucesso só do e-mail (decisão 4) | ✅ Tratado: `clearFailuresForEmail` só DELETE por e-mail (`login-attempts-repo.ts:84`). |
| Entrada inválida conta (decisão 5) | ✅ Tratado: IP sempre, e-mail só se `z.email()` isolado passar (`auth.ts:86-90`). |
| Fail-closed na checagem / best-effort na gravação (decisão 6) | ✅ Tratado: SELECT propaga → recusa; INSERT/DELETE engolem erro (`auth.ts:104-112`, `login-attempts-repo.ts:64-72,83-91`). |
| Limpeza de antigos (decisão 7) | 🟢 De pé por escolha: fora de escopo, não compromete correção. Fatia futura. |
| Timing side-channel | 🟡 De pé: ver Segurança 🟡-1. Endurecimento futuro, não bloqueia. |

---

## Veredito

**APROVAR** — todos os critérios de aceite cumpridos com evidência; type-check, test
(296 passaram) e build rodados por mim, verdes; consistência de normalização, fail-closed
e best-effort confirmados no código; nenhum achado 🔴. Ressalvas 🟡 (timing side-channel)
e 🟢 (lint não configurado / normalização de e-mail no authorize) são pré-existentes ou
fora de escopo e ficam como endurecimento futuro — não bloqueiam.

> **GATE humano.** Este veredito é recomendação, não decisão final. As duas ressalvas
> 🟡/🟢 (timing e lint) merecem uma linha de decisão do CEO: aceitar como dívida
> registrada e seguir, ou abrir fatia de endurecimento. Recomendação do validador:
> **aceitar e seguir** — nenhuma delas abre buraco de segurança nem quebra AC.
