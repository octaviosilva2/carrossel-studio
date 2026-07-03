# Testes (auditoria independente) — Migração de infra (Bloco 2, código)

Papel: auditar de forma independente se a cobertura de teste realmente prova os edge cases da story,
e fechar lacunas reais **sem** duplicar o que já existe e **sem** tocar código de produção.

Baseline recebida do backend: **255 passed / 1 skipped**. Confirmada localmente antes de mexer.

## Edge cases da story → coberto / lacuna

| Edge case | Situação | Arquivo:teste |
|---|---|---|
| Upload sem sessão → 401, nenhuma presigned | **Coberto (já existia)** | `blob-upload-route.test.ts` › "SEM sessão: responde 401 e não emite presigned" |
| Content-type não permitido (`image/gif`, `application/pdf`) → rejeitado no server | **Coberto + reforçado agora** | `blob-upload-route.test.ts` › "content-type não permitido (%s) => 400" — antes só `image/gif`; adicionei `application/pdf` via `it.each` (a story cita os dois) |
| Arquivo acima de 6 MB → rejeitado no server | **Coberto (já existia)** | `blob-upload-route.test.ts` › "size acima do limite (6 MB + 1) => 400" + assert `MAX_IMAGE_BYTES === 6*1024*1024`; e "size no limite exato (6 MB) => 200" |
| URL cross-origin de host não confiável no export → lança antes de qualquer fetch | **Coberto (já existia)** | `export-safe-url.test.ts` › "cross-origin fora do allowlist é RECUSADO antes de qualquer fetch" (`fetchSpy` não chamado) |
| Falha de rede/CORS em host permitido → erro legível, comportamento idêntico ao atual | **Lacuna fechada agora** | `export-safe-url.test.ts` › "falha de rede/CORS em host permitido => erro LEGIVEL" — o teste que existia só provava `.rejects.toThrow()` genérico; adicionei assert da **mensagem legível** (`/nao foi possivel carregar a imagem para o export/i`) |
| TLS Postgres self-signed sem SAN → aceito só via CA pinado + bypass `checkServerIdentity`; cadeia que não bate é recusada | **Lacuna consciente — fora do escopo automatizável** | É config do driver `pg` (`ssl: { ca, rejectUnauthorized: true, checkServerIdentity }`). Provado empiricamente pelo backend contra a VPS real (`SELECT 1 → { ok: 1 }` via CA pinado; ver `04-backend.md` Desvios §1). Reproduzir na suíte exigiria subir um Postgres TLS real — é smoke, não unit. |
| `certs/db-ca.pem` (ou `db-ca-migrate.pem`) ausente → falha clara no boot, nunca conexão sem TLS | **Lacuna consciente — não automatizado (ver justificativa abaixo)** | Comportamento é `readFileSync(...)` lançar `ENOENT` na carga de `src/db/index.ts` / `drizzle.config.ts`. Provado na prática pelo backend (o driver conectou só com o cert presente). Ver "O que ficou de fora". |
| Variável `S3_*` ausente → boot falha fechado em `env.ts` com o nome da chave | **Lacuna fechada agora** | `env-validation.test.ts` (arquivo novo) — 6 casos, um por `S3_*`, provando que o boot lança citando **o nome** da chave; + não vaza valor de secret; + múltiplas faltantes; + `S3_ENDPOINT` não-URL; + `BLOB_READ_WRITE_TOKEN` removido não bloqueia boot |
| `db.transaction()` com erro no meio do replace-all → rollback atômico (sem slides parciais) | **Lacuna fechada agora** | `carousel-actions.test.ts` › "erro no meio do replace-all => transação propaga (rollback), sem retorno de sucesso" — o teste que existia só provava `transactionCalled === true`; este prova que uma falha dentro da transação **propaga** (não retorna `{ ok:true }`, sem estado parcial) |

## Testes adicionados/alterados (nenhum código de produção tocado)

- **`tests/env-validation.test.ts`** (NOVO, 11 testes) — cobre o AC de `env.ts` + edge "S3_* ausente".
  Neutraliza o marcador `server-only` com `vi.mock("server-only", () => ({}))` (não toca produção) e
  reavalia o parse por caso via `vi.resetModules()` + import dinâmico manipulando `process.env`.
- **`tests/carousel-actions.test.ts`** (19→20) — adicionado flag `transactionError` ao mock de
  `db.transaction` (default inalterado, não afeta os 19 testes existentes) + 1 teste de rollback.
- **`tests/blob-upload-route.test.ts`** (8→9) — `image/gif` virou `it.each(["image/gif","application/pdf"])`.
- **`tests/export-safe-url.test.ts`** (10→11) — 1 teste novo afirmando a mensagem legível na falha de rede.

## Resultado da rodada

`npm run test` → **269 passed, 1 skipped** (19 arquivos). Zero falhas.
- O único skip é o herdado da S1 (`png-dimensions.test.ts`) — como esperado.
- Os 2 `stderr` visíveis são `console.error` **esperados** dos testes de erro do handler (body
  malformado + falha do SDK) — provam que o detalhe fica só no log server-side, não no body. Não são falhas.
- Contagem: 255 (baseline) + 11 (env) + 1 (rollback) + 1 (`application/pdf`) + 1 (rede legível) = 269.

Verificação por arquivo dos alterados: `npx vitest run tests/env-validation.test.ts
tests/export-safe-url.test.ts` → 22 passed (11 + 11).

## O que ficou de fora e por quê

- **`certs/db-ca.pem` ausente (ENOENT no boot):** não automatizado por decisão de custo/valor.
  Reproduzir na suíte exigiria mockar `server-only` + `@/lib/env` + `pg` + `drizzle-orm/node-postgres`
  e ainda assim o teste só provaria que `readFileSync` de um caminho inexistente lança ENOENT
  (comportamento do Node), acoplado ao **caminho literal** do arquivo — teste frágil que quebra a
  cada refactor sem valor de verdade. O comportamento desejado (falha clara no boot, nunca conexão
  sem TLS) está garantido pela leitura síncrona não-capturada em `src/db/index.ts` (comentada como
  intencional) e foi provado na prática pelo backend (o driver `pg` só conectou na VPS **com** o cert
  presente; ver `04-backend.md`). Registrado como lacuna consciente, não omissão.
- **TLS self-signed sem SAN / cadeia recusada pelo CA pinado:** é comportamento do handshake TLS do
  driver contra um Postgres real — smoke, não unit. Já validado contra a VPS real no Estágio A
  (`SELECT 1 → { ok: 1 }`).
- **CORS real do MinIO / TLS do proxy no PUT direto do browser:** explicitamente fora de escopo
  (Bloco 3 / smoke), como a story e o spec (Riscos R5) já documentam.

## Veredito

Todos os edge cases automatizáveis da story têm teste real e determinístico passando. As 3 lacunas
reais que encontrei (env `S3_*`, rollback de transação, mensagem legível na falha de rede) foram
fechadas sem duplicação e sem tocar produção. As 2 lacunas restantes (CA ausente, TLS/CORS reais)
são conscientes e fora do escopo automatizável da suíte — pertencem ao smoke do Bloco 3. **Nenhum bug
de produção encontrado.**
