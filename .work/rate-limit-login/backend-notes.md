# Backend — Rate limit no login

Implementação da fatia de backend da spec `.work/rate-limit-login/spec.md` (aprovada).
Sem desvios de contrato. Todos os pontos "Arquivos a tocar" da spec executados.

## O que foi implementado

**CRIADO:**
- `src/lib/rate-limit.ts` — lógica **pura** (sem I/O), alvo dos testes unitários:
  - `MAX_ATTEMPTS = 5`, `WINDOW_MINUTES = 15`, `UNKNOWN_IP = "unknown"` (sentinel).
  - `normalizeEmail(raw): string` — `trim().toLowerCase()`. Idempotente.
  - `parseClientIp(headerValue: string | null): string` — primeiro IP da cadeia
    `x-forwarded-for` (split `,` + trim); `null`/`""`/sem IP → `"unknown"`. **Extraída
    como pura** (a spec recomendou; é a fonte de mais um edge case da story).
  - `isBlocked(emailFailCount, ipFailCount): boolean` — `>= MAX_ATTEMPTS` em qualquer
    uma das duas contagens (e-mail OU IP).
  - `windowStart(now: Date): Date` — `now - 15min` (corte da janela deslizante).
- `src/lib/login-attempts-repo.ts` — repositório **fino** sobre Drizzle
  (`import "server-only"`):
  - `countRecentFailures(email | null, ip, windowStart)` — dois `SELECT count(*)`
    (usa `count()` do drizzle-orm). Se `email` é `null`, retorna `email: 0` sem
    consultar. **Propaga o erro** (call site decide fail-closed).
  - `recordFailure(email | null, ip)` — um `INSERT`. **Best-effort**: try/catch, loga
    a mensagem técnica e **não lança**.
  - `clearFailuresForEmail(email)` — `DELETE WHERE email = ?`. **Best-effort** (loga,
    não lança). O e-mail já chega normalizado do call site.
- `drizzle/0001_loose_cable.sql` + `drizzle/meta/*` — **gerados** por
  `npm run db:generate` (não editados à mão).

**EDITADO:**
- `src/db/schema.ts` — adicionada `loginAttempts` (PK uuid defaultRandom, `email` text
  nullable, `ip_address` text NOT NULL, `created_at` timestamptz defaultNow) + os dois
  índices compostos `(email, created_at)` e `(ip_address, created_at)` + tipo
  `LoginAttemptRow`. Exatamente como a seção "Mudanças de dados" da spec.
- `src/lib/actions/auth.ts` — `signInAction` reescrita na ordem fixada:
  1. lê o IP via `headers()` numa função `readClientIp()` que **nunca lança**
     (try/catch → `parseClientIp(null)` = `"unknown"`);
  2. valida com Zod; se inválido, grava falha (IP sempre; e-mail só se
     `emailSchema` = `z.email()` isolado passar → `normalizeEmail`, senão `null`) e
     retorna genérico **sem** `signIn`;
  3. checa bloqueio **fail-closed** (se o SELECT lançar, loga e trata como bloqueado);
  4. chama `signIn("credentials", { email, password, redirectTo: "/carousels" })`;
  5. em `AuthError`, grava falha (best-effort) e retorna genérico; re-lança qualquer
     erro que não seja `AuthError` (inclui o redirect do Next).
  - Assinatura e retorno **inalterados**: `SignInResult { error: string }`. Mensagem
    única `"E-mail ou senha inválidos"` (constante `GENERIC_ERROR`) em toda recusa.
- `src/auth.ts` — no `authorize`, após `passwordOk` e antes do `return`, chama
  `clearFailuresForEmail(normalizeEmail(email))` (best-effort). Único ponto que sabe
  que a senha bateu (`signIn` redireciona/lança; código após a action é inatingível).

## Contrato real entregue (o que o Frontend consome)

**Inalterado.** Não há endpoint novo. A server action continua:
```ts
interface SignInResult { error: string }
```
- Sucesso → `signIn` redireciona para `/carousels` (throw do Next; código após não roda).
- Qualquer recusa (Zod inválido, bloqueio por rate limit, senha errada, e-mail
  inexistente, Postgres indisponível) → `{ error: "E-mail ou senha inválidos" }`,
  **idêntico em todos os casos** (anti-enumeração). Nenhum campo novo. O form de
  `/login` não muda.

## Migrations / dados

- **Migration gerada** por `npm run db:generate` → `drizzle/0001_loose_cable.sql`.
- Conteúdo conferido: só `CREATE TABLE "login_attempts"` + 2 `CREATE INDEX`. **Não
  destrutiva** — nenhum drop/alter/rename, tabela nova sem dados, sem backfill.
- **Aplicada** contra o Postgres real da VPS via `npm run db:migrate` (conexão direta
  `DATABASE_URL_UNPOOLED`, env de `.env.local`) — sucesso.
- Nenhuma confirmação humana adicional exigida (aditiva/segura; pipeline pré-aprovado
  em bloco pelo operador).
- **Sem RLS** — o projeto não usa Supabase; acesso ao Postgres é server-only
  (`@/db` tem `import "server-only"`). Autorização vive na aplicação. Drizzle
  parametriza tudo (IP/e-mail são texto opaco, zero concatenação de SQL).

## Comandos rodados (resultado real)

- `npm run db:generate` → `[✓] drizzle/0001_loose_cable.sql` (5 tabelas, `login_attempts`
  4 colunas / 2 índices / 0 FKs).
- `npm run db:migrate` → `[✓] migrations applied successfully!`.
- `npm run type-check` → limpo (exit 0, sem output de erro).
- `npm run test` → **19 arquivos, 271 testes passando, 1 skipped**. (Os `stderr` em
  `blob-upload-route.test.ts` são logs esperados de testes que provam tratamento de
  erro — não são falhas.)
- `npm run build` → `✓ Compiled successfully`, `✓ Generating static pages (6/6)`,
  types válidos.

## Desvios da spec

Nenhum desvio de contrato ou de arquitetura. Uma correção **fora do escopo estrito de
implementação, mas necessária para o critério de aceite** `npm run test` verde:

- **`tests/auth-actions.test.ts` (pré-existente, do estágio S3) quebrou** ao importar,
  porque a nova `signInAction` passou a importar `@/lib/login-attempts-repo` →
  `@/db` → `server-only`, que explode no ambiente de teste (jsdom = client). O teste
  antigo só mockava `@/auth` e `next-auth`.
- **Correção mínima aplicada** (mesma estratégia de mocking-estratégico já usada em
  `carousel-actions.test.ts` para `@/db`): adicionei ao teste os mocks de
  `@/lib/login-attempts-repo`, `next/headers` e reset no `beforeEach`. Por padrão o
  mock devolve contagem zero (não bloqueado) → o fluxo chega ao `signIn` e os asserts
  existentes continuam válidos. **Não** escrevi testes de rate limit — só mantive verde
  um teste existente que passou a puxar uma dependência nova.

## O que o próximo estágio (06-tester) precisa saber

- **`tests/rate-limit.test.ts` é seu** — não foi escrito aqui (conforme instrução). A
  spec §"Plano de teste" lista os casos exatos: `isBlocked` (4/0, 0/4 → false; 5/0,
  0/5, 5/5, 6/0 → true), `MAX_ATTEMPTS===5`, `WINDOW_MINUTES===15`,
  `windowStart(fixedNow) === fixedNow - 15min`, `normalizeEmail("  User@X.COM ") ===
  "user@x.com"` e idempotência.
- **`parseClientIp` foi extraída como pura** (a spec pediu se trivial — foi). Casos a
  cobrir: `"1.2.3.4, 5.6.7.8"` → `"1.2.3.4"`; `null`/`""` → `"unknown"`;
  `" 1.2.3.4 "` → `"1.2.3.4"`. Exportada de `src/lib/rate-limit.ts`.
- **Toda a lógica testável por unit puro vive em `src/lib/rate-limit.ts`** — sem I/O,
  sem `headers()`, sem Postgres. Não precisa de banco.
- **Orquestração/I/O (`signInAction`, repo) fica fora do teste automatizado** por
  decisão da spec (sem setup de integração com Postgres). Se quiser cobrir a ordem/
  fail-closed do `signInAction`, use os mocks já montados em `tests/auth-actions.test.ts`
  (`countRecentFailuresMock`, `recordFailureMock`, `headersMock`) como base — o padrão
  já está lá.
- **Constantes exportadas** de `src/lib/rate-limit.ts`: `MAX_ATTEMPTS`,
  `WINDOW_MINUTES`, `UNKNOWN_IP` — os testes podem importá-las em vez de hardcodear.
- **Nada de dado real de cliente** nos fixtures de teste (regra do projeto). E-mails/IPs
  de teste são sintéticos.
