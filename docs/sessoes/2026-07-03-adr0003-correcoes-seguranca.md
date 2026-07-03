# Sessão 2026-07-03 — ADR 0003: Correções de segurança pós-auditoria

## Objetivo
Executar os 3 itens definidos na ADR 0003 (`docs/adr/0003-correcoes-seguranca-mvp.md`),
origem numa auditoria de segurança rodada logo após o cutover da ADR 0002, com o produto já
em produção (`carrosselstudio.evoiatecnologia.com`).

## Item 1 — CORS do MinIO (conduzido, sem código)
Octavio confirmou no painel EasyPanel: `MINIO_API_CORS_ALLOW_ORIGIN` já estava exatamente
`https://carrosselstudio.evoiatecnologia.com`. Nenhuma correção necessária.

## Item 2 — Headers de segurança HTTP (código pequeno e isolado)
`next.config.mjs` ganhou `headers()` aplicando a todas as rotas: `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Strict-Transport-Security: max-age=63072000; includeSubDomains` (sem `preload`, por
decisão da ADR — difícil de reverter). `npm run test` (271 passed) e `npm run build` verdes.
Diff mostrado, commit (`a4528c5`) e push confirmados explicitamente pelo Octavio.

## Item 3 — Rate limit no login (esteira dev-agents:feature completa)
Conduzido via `.work/rate-limit-login/`, story → spec → backend → testes → validação.

**Gate da story:** Octavio aprovou em bloco ("Aprovo tudo, pode finalizar tudo quando acabar
já da commit e push") e delegou ao CTO a resolução das 7 perguntas técnicas abertas pela
story (fonte do IP, onde checar/registrar, parâmetros exatos, reset em sucesso, entrada
inválida, fail-closed vs. fail-open, limpeza de registros). Decisões registradas em
`.work/rate-limit-login/STATUS.md`. A partir daí o pipeline seguiu sem pausas adicionais
(spec pré-aprovada), conforme a instrução.

**Entrega:**
- Tabela nova `login_attempts` (Postgres via Drizzle) — migration aditiva não destrutiva
  (`drizzle/0001_loose_cable.sql`), aplicada na VPS de produção via `npm run db:migrate`.
- Bloqueio temporário por **e-mail e por IP**, 5 falhas em 15 minutos, janela deslizante.
  Lógica de decisão pura em `src/lib/rate-limit.ts` (`isBlocked`, `normalizeEmail`,
  `parseClientIp`, `windowStart`); I/O fino em `src/lib/login-attempts-repo.ts`.
- `signInAction` (`src/lib/actions/auth.ts`) reescrita: lê IP via `headers()` (nunca lança),
  valida com Zod, checa bloqueio **fail-closed** (falha do SELECT = tratado como bloqueado),
  chama `signIn`, grava falha **best-effort** em `AuthError`.
- Reset das falhas do e-mail no `authorize` (`src/auth.ts`), após confirmar a senha — único
  ponto que sabe que o login deu certo (`signIn` redireciona/lança, então a limpeza não
  cabia na action).
- Mensagem de erro sempre genérica ("E-mail ou senha inválidos"), idêntica em todos os
  casos de recusa (Zod inválido, bloqueio, falha do Postgres, senha errada, e-mail
  inexistente) — sem oráculo de enumeração de conta.
- **296 testes passando** (271 baseline + 25 novos em `tests/rate-limit.test.ts`), type-check
  e build limpos.

**Validação independente:** aprovado, sem achado 🔴. Duas ressalvas não bloqueantes,
aceitas como dívida registrada (recomendação do validador, endossada):
- 🟡 Timing side-channel — resposta de "bloqueado" retorna mais rápido que "senha errada"
  (bloqueio não roda bcrypt). Não revela existência de conta nem senha; só sinaliza bloqueio,
  que é o efeito desejado. Endurecimento futuro.
- 🟢 ESLint não configurado no projeto — dívida pré-existente da fundação (S1), não desta
  entrega; `type-check` cobre corretude de tipos.

Commit(s) e push desta entrega feitos com aprovação em bloco do Octavio, ao final de todo o
pipeline.

## Resultado
ADR 0003 **Implementada**. Os 3 itens da auditoria de segurança priorizados para o MVP
estão concluídos: CORS confirmado, headers de segurança no ar, rate limit no login
protegendo a fronteira de autenticação contra força bruta. `docs/STATUS.md` e o Status da
ADR atualizados.

## Pendências deixadas para o Octavio
Itens deferidos da própria ADR (§4, não bloqueiam o MVP): validação de magic bytes no
upload de imagem; `avatarUrl` aceitando qualquer HTTPS externo; comentário desatualizado em
`carousels.ts:244`. Mais as duas ressalvas da validação do rate limit (timing side-channel,
ESLint). Nenhum é urgente; ficam como candidatos a uma fatia futura de endurecimento.
