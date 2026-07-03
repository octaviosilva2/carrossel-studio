# Spec — Rate limit no login

> Story: `.work/rate-limit-login/story.md` (aprovada). Restrições fixadas no gate:
> `.work/rate-limit-login/STATUS.md` §"Gate da story — APROVADO" (7 decisões — tratadas
> aqui como contrato, não reabertas). Origem: ADR 0003 §2.1.

## Resumo da abordagem

Persistir cada tentativa de login **com falha** numa tabela nova `login_attempts` (Postgres,
via Drizzle — sem vendor externo, conforme ADR 0001/0003). Antes de chamar `signIn`, o
`signInAction` conta as falhas dos últimos 15 min por **e-mail** e por **IP** (janela
deslizante); se qualquer um atingir 5, recusa com a mensagem genérica sem validar a senha.
Toda decisão de contagem/limite vive em **funções puras** (`src/lib/rate-limit.ts`) que
recebem números e retornam booleano — o I/O (SELECT/INSERT/DELETE) fica em um **repositório
fino** (`src/lib/login-attempts-repo.ts`) e a orquestração no `signInAction`. Isso mantém a
lógica testável por unit (padrão atual do projeto: `vitest`, testes puros) sem exigir Postgres
de integração.

Por quê: é a solução mais simples que cumpre a story — reusa o stack existente (Drizzle, Zod,
`headers()` do Next), não introduz dependência, e a separação pura/impura espelha o que o
projeto já faz (`image-upload.ts`/`editor-state.ts` puros, testados; I/O nas actions).

---

## Contrato de API/backend

Não há endpoint REST novo. O único ponto de entrada continua a **server action**
`signInAction` (`src/lib/actions/auth.ts`), consumida pelo form de `/login` via
`useActionState`. O contrato de saída **não muda** (compatível com o form atual):

```ts
interface SignInResult { error: string }
```

- **Sucesso:** `signIn` lança o redirect para `/carousels` (código após não roda) — inalterado.
- **Qualquer recusa** (Zod inválido, bloqueio por rate limit, senha errada, e-mail inexistente,
  ou falha de checagem no Postgres): `{ error: "E-mail ou senha inválidos" }`. **Mensagem única,
  idêntica em todos os casos** (AC "Não vazar informação" + decisão 6 fail-closed). O form já
  renderiza `result.error` inline — nenhuma mudança de frontend necessária.

### Fluxo interno do `signInAction` (ordem fixada — decisão 2)

1. **Lê o IP** via `headers()` do `next/headers`, cabeçalho `x-forwarded-for`, **primeiro IP da
   cadeia** (split por `,`, `trim`). Se ausente/vazio → sentinel `"unknown"` (decisão 1).
   Nunca lança: falha ao ler header vira `"unknown"`.
2. **Valida com Zod** (`signInSchema` atual). Se inválido:
   - Registra tentativa falha **sempre para o IP**; para o e-mail **só se o valor de `email`
     for uma string sintaticamente válida** (reusa `z.email()` isolado — se não passar, grava só
     o IP com `email = null`) (decisão 5).
   - Retorna o erro genérico. **Não** chama `signIn`.
3. **Checa bloqueio** (e-mail OU IP) via repositório:
   - Conta falhas do e-mail (normalizado) nos últimos 15 min **e** falhas do IP nos últimos 15
     min. Se **qualquer** contagem `>= 5` → retorna erro genérico **sem chamar `signIn`**
     (não valida senha — AC "recusada sem chegar a validar a senha").
   - **Fail-closed (decisão 6):** se o SELECT lançar (Postgres indisponível), trata como
     bloqueado → retorna erro genérico. Loga o erro no servidor (sem PII: só a mensagem técnica,
     nunca a senha).
4. **Chama** `signIn("credentials", { email, password, redirectTo: "/carousels" })`.
5. **Em `AuthError`** (credencial errada / e-mail inexistente): registra tentativa falha
   (e-mail normalizado + IP) — **best-effort (decisão 6):** se o INSERT lançar, loga e segue;
   retorna o erro genérico ao usuário de qualquer forma. Re-lança qualquer erro que **não** seja
   `AuthError` (inclui o redirect que o Next propaga como throw — comportamento atual preservado).
6. **Em sucesso:** o `signIn` redireciona, então a limpeza acontece **antes** da chamada de
   `signIn` não é possível (não sabemos ainda se vai dar certo) e **depois** é inatingível.
   → **Solução:** a limpeza das falhas do e-mail é feita **dentro do `authorize`** de `src/auth.ts`,
   no ponto em que a senha bateu e o usuário será retornado (é o único lugar que sabe que o login
   foi bem-sucedido). Ver "Reset em sucesso" abaixo.

### Reset em sucesso (decisão 4 — limpa só o e-mail)

O `authorize` (`src/auth.ts`) já é o ponto que confirma a senha correta. Após `passwordOk` e
antes de `return { id, email, name }`, dispara a limpeza: `DELETE FROM login_attempts WHERE
email = <normalizado>`. **Não** toca nas linhas de IP (pode haver outros e-mails legítimos atrás
do mesmo NAT — decisão 2e/4).

- A limpeza é **best-effort**: se o DELETE falhar, loga e **não** impede o login (o usuário já
  provou a senha; não penalizar por um write secundário). As falhas antigas saem sozinhas da
  janela em ≤15 min de qualquer forma.
- Normalização do e-mail: mesma função usada na contagem/gravação (ver abaixo) — a chave tem de
  bater exatamente, senão o reset não zera nada.

> **Nota de acoplamento (justificada):** a checagem/gravação por IP fica no `signInAction`
> (único lugar com acesso ao `x-forwarded-for`); a limpeza em sucesso fica no `authorize` (único
> lugar que sabe que a senha bateu). É a divisão que a própria story antecipou nas perguntas
> abertas e o gate confirmou. Ambos chamam o **mesmo** repositório (`login-attempts-repo.ts`),
> então não há lógica duplicada — só dois call sites.

### Normalização da chave de e-mail

`email.trim().toLowerCase()`. Aplicada **na gravação, na contagem e na limpeza** — as três têm
de usar a mesma normalização, senão `User@x.com` e `user@x.com` viram chaves distintas e o
atacante contorna o limite alternando maiúsculas. Encapsular numa função
`normalizeEmail(raw: string): string` em `src/lib/rate-limit.ts`.

---

## Mudanças de dados

### Nova tabela `login_attempts`

Adicionar ao `src/db/schema.ts`, seguindo o padrão existente (PK `uuid defaultRandom`,
`timestamptz`, índices explícitos). A migration é **gerada** por `drizzle-kit generate` (não
escrita à mão — é o fluxo do projeto: `npm run db:generate` lê o schema e emite o `.sql` em
`drizzle/`).

Definição Drizzle (contrato que o backend implementa):

```ts
// --- login_attempts — tentativas de login com FALHA (rate limit) -------------
// So falhas sao gravadas. Sucesso NAO gera linha (gera DELETE do email, ver spec).
// Janela deslizante: a consulta filtra por created_at >= now() - 15min.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // email normalizado (trim+lowercase). NULL quando a entrada nao tinha email
    // sintaticamente valido (conta so pro IP — decisao 5).
    email: text("email"),
    // IP de origem (primeiro do x-forwarded-for) ou "unknown" (sentinel). NOT NULL.
    ipAddress: text("ip_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Consulta por e-mail dentro da janela: WHERE email = ? AND created_at >= ?
    index("login_attempts_email_created_at_idx").on(table.email, table.createdAt),
    // Consulta por IP dentro da janela: WHERE ip_address = ? AND created_at >= ?
    index("login_attempts_ip_created_at_idx").on(table.ipAddress, table.createdAt),
  ],
);
```

Também exportar o tipo inferido, no mesmo estilo do arquivo:
```ts
export type LoginAttemptRow = typeof loginAttempts.$inferSelect;
```

**Colunas / decisões de modelagem:**
- `email` **nullable** — a decisão 5 grava tentativas de entrada inválida só pelo IP, sem chave
  de e-mail. `NULL` significa "sem e-mail associado".
- `ip_address` **NOT NULL** — sempre há valor (sentinel `"unknown"` quando o header falta). Isso
  garante que o índice por IP nunca precisa lidar com `NULL` e que o bloqueio por e-mail nunca
  depende do IP existir (decisão 1).
- `created_at` `timestamptz DEFAULT now()` — a janela deslizante compara contra `now()`. Sem
  `updated_at` (linha é imutável: cada falha é um evento, nunca se atualiza).
- **Sem FK para `users`** — de propósito. O e-mail pode não existir na base (e-mail inexistente
  martelado ainda conta; um FK impediria gravar). Guardamos o **texto** do e-mail tentado, não
  uma referência. Isso também evita virar oráculo de enumeração (gravar independe de o user
  existir).
- **Índices compostos `(coluna, created_at)`** — servem exatamente às duas consultas de contagem
  (igualdade na 1ª coluna + range na 2ª: ordem correta para o índice cobrir o filtro). Um índice
  para o caminho por e-mail, outro para o caminho por IP.

**Migration DESTRUTIVA? NÃO.** É `CREATE TABLE` + `CREATE INDEX` numa tabela nova, sem dados
existentes e sem tocar tabelas atuais. Não há backfill, não há coluna `NOT NULL` adicionada a
tabela populada, não há drop/rename. Reversível trivialmente (`DROP TABLE login_attempts`).
Segue o padrão de migração aditiva segura.

**Como gerar/aplicar (backend):**
1. Editar `src/db/schema.ts` (adicionar `loginAttempts` + tipo).
2. `npm run db:generate` → cria `drizzle/0001_<nome>.sql` + atualiza `drizzle/meta/`.
3. Conferir o `.sql` gerado (deve ser só `CREATE TABLE "login_attempts"` + os 2 `CREATE INDEX`).
4. `npm run db:migrate` aplica na base (conexão direta `DATABASE_URL_UNPOOLED`, ver `drizzle.config.ts`).

### RLS / permissões

**Não se aplica RLS neste projeto.** O acesso ao Postgres é **server-only** (`src/db/index.ts`
tem `import "server-only"`; o cliente nunca fala direto com o banco — diferente de Supabase). A
autorização vive na aplicação: só o `signInAction`/`authorize` (server actions, runtime Node)
tocam `login_attempts`. Não há papel `anon`/`authenticated` no Postgres. Portanto o baseline de
segurança aqui é:
- **Entrada validada na borda** (Zod já valida; o IP é tratado como texto opaco, nunca
  interpolado — Drizzle parametriza tudo, zero concatenação de SQL).
- **Falha fechado** na checagem (decisão 6).
- **Sem PII em log/erro:** nunca logar a senha nem o hash; e-mail em log de erro interno é
  aceitável (não é segredo), mas a mensagem **ao usuário** é sempre genérica.
- A tabela guarda e-mail tentado + IP — nenhum segredo. Sem hash de senha, sem token.

---

## UI/frontend

**Nenhuma mudança de frontend.** O contrato `SignInResult { error: string }` é o mesmo; o form
de `/login` (via `useActionState`) já renderiza a mensagem inline. Estados do form, do ponto de
vista do usuário:

| Estado | Gatilho | O que consome / exibe |
|---|---|---|
| Ocioso | primeira carga | form vazio, sem erro |
| Enviando | submit | `pending` do `useActionState` (comportamento atual) |
| Sucesso | credencial válida e não bloqueado | redirect para `/carousels` (server) |
| Erro (qualquer recusa) | Zod inválido, bloqueado, senha errada, e-mail inexistente, ou Postgres indisponível | `result.error === "E-mail ou senha inválidos"` inline — **indistinguível entre os casos** (AC anti-enumeração) |

> Confirmação para o backend: **não** adicionar campo novo ao `SignInResult` (ex.: "bloqueado",
> "tenteMaisTarde", contador de tentativas restantes). Qualquer sinal específico de bloqueio
> quebra o AC "mensagem idêntica / não virar oráculo". A UI não deve saber que rate limit existe.

---

## Arquivos a tocar

**CRIAR:**
- `src/lib/rate-limit.ts` — lógica **pura** (sem I/O): constantes `MAX_ATTEMPTS = 5`,
  `WINDOW_MINUTES = 15`; `normalizeEmail(raw: string): string`;
  `isBlocked(emailFailCount: number, ipFailCount: number): boolean` (retorna
  `emailFailCount >= MAX_ATTEMPTS || ipFailCount >= MAX_ATTEMPTS`);
  `windowStart(now: Date): Date` (retorna `now - 15min`, o corte da janela deslizante). **Alvo
  principal dos testes unitários.**
- `src/lib/login-attempts-repo.ts` — repositório **fino** sobre Drizzle (`import "server-only"`).
  Funções:
  - `countRecentFailures(email: string | null, ip: string, windowStart: Date): Promise<{ email: number; ip: number }>`
    — dois `SELECT count(*)` (um por chave) filtrando `created_at >= windowStart`. Se `email` é
    `null`, retorna `email: 0` sem consultar. **Propaga o erro** (o call site decide fail-closed).
  - `recordFailure(email: string | null, ip: string): Promise<void>` — um `INSERT`. **Captura e
    loga** o erro internamente (best-effort, decisão 6) — nunca lança para o call site.
  - `clearFailuresForEmail(email: string): Promise<void>` — `DELETE WHERE email = ?`.
    Best-effort (loga, não lança).
- `tests/rate-limit.test.ts` — testes unitários da lógica pura (ver Plano de teste).

**EDITAR:**
- `src/db/schema.ts` — adicionar `loginAttempts` + `LoginAttemptRow` (ver Mudanças de dados).
- `src/lib/actions/auth.ts` — reescrever `signInAction`: ler IP via `headers()`, orquestrar a
  ordem fixada (Zod → checa bloqueio fail-closed → `signIn` → em `AuthError` grava falha). Reusa
  `rate-limit.ts` (puro) + `login-attempts-repo.ts` (I/O). Mantém a assinatura e o retorno atuais.
- `src/auth.ts` — no `authorize`, após `passwordOk`, chamar `clearFailuresForEmail(normalizeEmail(email))`
  (best-effort) antes do `return`.
- `drizzle/0001_<nome>.sql` + `drizzle/meta/*` — **gerados** por `npm run db:generate` (não
  editar à mão).

**NÃO tocar:** o form de `/login`, nenhum componente React, `next.config.mjs`, nenhuma outra
tabela.

---

## Plano de teste

Nível: **unit puro** (padrão do projeto — `vitest`, `tests/**/*.test.ts`, sem Postgres de
integração; testar I/O de Drizzle contra banco real está fora do setup atual e fora de escopo
desta entrega). A estratégia é concentrar a **decisão** em `rate-limit.ts` (puro) e cobri-la
exaustivamente; o repositório e a orquestração ficam finos o bastante para revisão manual +
`build`/`type-check`.

`tests/rate-limit.test.ts` cobre, ligado aos ACs:

| Caso de teste | Critério de aceite coberto |
|---|---|
| `isBlocked(4, 0)` → `false`; `isBlocked(0, 4)` → `false` | "menos de 5 → login permitido" |
| `isBlocked(5, 0)` → `true` (bloqueio por **e-mail** no 5º) | "5 falhas por e-mail → recusa" |
| `isBlocked(0, 5)` → `true` (bloqueio por **IP** independente do e-mail) | "IP atingiu 5 → recusa mesmo com e-mail livre" |
| `isBlocked(5, 5)` → `true`; `isBlocked(6, 0)` → `true` | limite é `>= 5`, não `== 5` |
| `MAX_ATTEMPTS === 5` e `WINDOW_MINUTES === 15` | parâmetros fixados (decisão 3) |
| `windowStart(fixedNow)` = `fixedNow - 15min` (data determinística) | janela deslizante correta |
| `normalizeEmail("  User@X.COM ")` === `"user@x.com"` | chave consistente (anti-bypass por caixa) |
| `normalizeEmail` idempotente (`f(f(x)) === f(x)`) | robustez da normalização |

**Fora do teste automatizado (revisão + build cobrem):**
- Ordem exata no `signInAction` (Zod → checa → signIn → grava) e o fail-closed do SELECT — são
  orquestração com I/O; validados por leitura de código no code-review e pelo `build`/`type-check`
  verdes. Se no futuro entrar setup de teste de integração com Postgres, viram teste de integração.
- Leitura do `x-forwarded-for` — depende de `headers()` do Next (contexto de request). Se for
  trivial extrair `parseClientIp(headerValue: string | null): string` como função pura, **fazer**
  e testar aqui (cadeia `"1.2.3.4, 5.6.7.8"` → `"1.2.3.4"`; `null`/`""` → `"unknown"`;
  `" 1.2.3.4 "` → `"1.2.3.4"`). Recomendado: extrair, porque é a fonte de mais um edge case da story.

**Critério de aceite final da entrega (ADR 0003 §3):** `npm run test` e `npm run build` verdes.
Rodar também `npm run type-check`.

---

## Decisões e trade-offs

- **Funções puras (`rate-limit.ts`) + repositório fino (`login-attempts-repo.ts`), em vez de tudo
  inline no `signInAction`.** Alternativa descartada: escrever toda a lógica direto na action.
  Descartada porque a action toca `headers()` + `signIn` + DB — intestável no setup atual (unit
  puro). Extrair a decisão para função pura é o que torna os ACs de contagem/limite cobríveis por
  teste, e espelha o padrão já usado no projeto (`image-upload.ts` puro/testado). Custo: dois
  arquivos novos pequenos — aceitável.
- **`count(*)` no banco em vez de read-modify-write.** Alternativa descartada: ler linhas, contar
  no app, decidir. Descartada porque a story exige contagem correta sob concorrência (edge case
  "corrida"): `count(*)` é atômico no SELECT e o `INSERT` de cada falha é independente — sem
  race de leitura-e-escrita. Não precisa de lock nem transação: no pior caso duas tentativas
  simultâneas gravam duas linhas e a próxima leitura vê as duas (a contagem nunca "escapa" pra
  menos). Simples e correto.
- **Sem `updated_at` / sem coluna de "tipo de falha".** YAGNI (gate de simplicidade): cada linha
  é um evento imutável; a janela deslizante só precisa de `created_at`. Distinguir causa da falha
  não serve a nenhum AC.
- **Sem FK para `users`.** Descartado FK porque impediria gravar e-mail inexistente (que precisa
  contar) e reintroduziria acoplamento à existência do usuário — justo o que a story quer evitar
  para não virar oráculo de enumeração.
- **Limpeza em sucesso no `authorize`, não no `signInAction`.** Alternativa descartada: limpar na
  action após `signIn`. Impossível — `signIn` redireciona (lança), o código após não roda. O
  `authorize` é o único ponto que sabe que a senha bateu. Trade-off: acoplamento leve (a action
  cuida do IP, o authorize cuida do reset por e-mail), mitigado por ambos usarem o mesmo repo.
- **Limpeza de registros antigos fora de escopo (decisão 7).** A tabela cresce, mas a consulta
  sempre filtra por janela (`created_at >= now()-15min`), então correção nunca depende de limpar.
  Volume atual é baixíssimo (operador é quase o único usuário). Fatia futura.

---

## Riscos para implementação

- **Custo de latência:** o caminho feliz agora faz 2 `SELECT count(*)` antes do `signIn`. Com os
  índices compostos `(chave, created_at)` é uma varredura de índice mínima e a tabela é pequena —
  desprezível. Se quiser, dá pra fundir num único `SELECT ... GROUP BY` no futuro (não necessário
  agora).
- **Fail-closed pode travar o operador se o Postgres oscilar.** É intencional (decisão 6) e o
  impacto real é baixo: se o Postgres cai, o `authorize` também falha (a auth depende dele), então
  o login já não funcionaria de qualquer jeito. A mensagem ao usuário é a mesma genérica.
- **Consistência da normalização entre os 3 pontos** (gravar / contar / limpar). Se divergirem, o
  reset em sucesso não zera e o operador pode ficar bloqueado após acertar a senha. Mitigação:
  `normalizeEmail` é uma função única importada nos três lugares — o code-review deve confirmar
  que os três call sites a usam.
- **`headers()` fora de contexto de request** (ex.: se o `signInAction` for chamado de um contexto
  sem request) lança. Envolver a leitura do IP em try/catch e cair para `"unknown"` — nunca deixar
  a leitura do IP derrubar o login.
- **IP compartilhado (NAT) pode gerar falso positivo por IP.** Aceito pela story (segurança >
  conveniência nesta fase; operador é quase o único usuário). Sem mitigação nesta entrega; o reset
  por sucesso é só do e-mail justamente para não penalizar outros e-mails legítimos no mesmo IP.

---

## Gate da spec

Pré-aprovado pelo operador ("aprovo tudo") — sem pausa adicional. O backend pode implementar sem
ambiguidade: schema, migration (gerada), onde cada função vive, contrato de saída inalterado,
ordem do fluxo e plano de teste estão definidos acima.
