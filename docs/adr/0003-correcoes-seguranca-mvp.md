# ADR 0003 — Correções de segurança para o MVP

- **Data:** 2026-07-03
- **Status:** Implementada (2026-07-03)
- **Decisor:** CTO (Claude), delegado pelo CEO (Octavio)
- **Origem:** auditoria de segurança (`dev-agents:analise-seguranca`) rodada logo após o
  cutover da ADR 0002, com a plataforma já em produção (`carrosselstudio.evoiatecnologia.com`).

---

## 1. Contexto

Com o produto em produção e prestes a receber o 1º cliente pagante, rodamos uma auditoria de
segurança cobrindo a plataforma inteira, com foco no que a migração de infra (ADR 0002)
mudou. Resultado: **nenhum achado 🔴 (crítico)**, 2 achados 🟡 (risco condicional) e 4 achados
🟢 (endurecimento). Os fundamentos estão sólidos — zero SQL injection, zero IDOR, segredos
nunca vazam, TLS pinado corretamente, prompt injection mitigado.

Desta lista, o CEO e o CTO definiram **3 itens como necessários antes do MVP** (dado real de
cliente em jogo); os demais ficam deferidos (ver §4).

---

## 2. Decisão — o que corrigir

### 2.1 Rate limit no login 🟡
**Onde:** [src/lib/actions/auth.ts](../../src/lib/actions/auth.ts) (`signInAction`) — é o
único caminho que o form de `/login` usa (chama `signIn("credentials", …)` do Auth.js por
dentro; não há chamada direta do client a `/api/auth/callback/credentials`).

**Problema:** nenhum limite de tentativas. O único freio hoje é o custo do bcrypt
(~250 ms/tentativa) — insuficiente contra um ataque distribuído. É a porta de entrada que
protege dado real de cliente.

**Decisão técnica:** rate limit **persistido no Postgres** (tabela nova, ex.
`login_attempts`), não um serviço externo (Upstash/Redis) — consistente com a decisão da ADR
0001 de controlar o backend inteiro sem dependência de BaaS/vendor extra, e evita
inconsistência entre instâncias serverless da Vercel que um rate limit em memória teria.

**Parâmetro sugerido (a confirmar na spec):** bloqueio temporário após 5 tentativas falhas
em 15 minutos, por e-mail **e** por IP (cobre tanto o atacante mirando 1 conta quanto o que
rotaciona e-mails a partir do mesmo IP). Mensagem de erro permanece genérica (não revela se
o bloqueio é por excesso de tentativas ou senha errada — evita dar pista ao atacante).

### 2.2 Confirmar/corrigir CORS do MinIO 🟡
**Onde:** VPS/EasyPanel — variável `MINIO_API_CORS_ALLOW_ORIGIN` do serviço MinIO (global,
não por bucket — limitação do MinIO Community Edition, ver
`docs/sessoes/2026-07-02-adr0002-bloco1-infra-vps.md`).

**Problema:** o valor real configurado no Bloco 1 não está documentado/verificável a partir
do código. Se for wildcard (`*`), qualquer site pode usar uma presigned URL vazada/roubada.

**Ação:** conduzida (sem código) — confirmar o valor real (painel EasyPanel ou
`mc admin config get <alias> api` via terminal da VPS). Se não for exatamente
`https://carrosselstudio.evoiatecnologia.com`, corrigir e reiniciar o serviço MinIO.

### 2.3 Headers de segurança HTTP 🟢
**Onde:** [next.config.mjs](../../next.config.mjs) — hoje sem função `headers()`.

**Adicionar** (aplicado a todas as rotas):
- `X-Content-Type-Options: nosniff` — impede o browser de "adivinhar" o tipo de um arquivo
  servido pelo MinIO com Content-Type divergente (mitiga a maior parte do achado 🟢 #4 da
  auditoria — upload confia no Content-Type declarado, sem checar os bytes).
- `X-Frame-Options: DENY` — o produto não precisa ser embutido em iframe de terceiros.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — **sem `preload`** (é
  difícil de reverter; não vale o risco agora).

---

## 3. Plano de execução

| Item | Tipo | Conduzido por |
|---|---|---|
| 2.1 Rate limit no login | 💻 código (afeta a fronteira de auth — passa pela esteira `dev-agents:feature`, com gates de story/spec) | Sonnet, sessão nova |
| 2.2 CORS do MinIO | 🔧 ops, conduzido (sem código) | Sonnet guia, Octavio executa no painel |
| 2.3 Headers de segurança | 💻 código pequeno e isolado (mesmo padrão do fix `DB_CA_CERT` da ADR 0002 Bloco 3: diff mostrado, testes + build antes de commitar, sem esteira completa dado o tamanho) | Sonnet, sessão nova |

Critério de aceite: `npm run test` + `npm run build` verdes ao final; commit + push só com
confirmação explícita do Octavio (branch `main` sem PR).

---

## 4. Fora de escopo desta ADR (deferido, não bloqueia o MVP)

Da mesma auditoria, ficam para depois — sem ação nesta sessão:
- Validação de magic bytes no upload de imagem (🟢 #4) — maior esforço; a maior parte do
  risco já cai com o item 2.3 feito.
- `avatarUrl` aceita qualquer HTTPS externo (🟢 #5, herdado do S6) — não explorável hoje (o
  export já recusa host fora da allowlist do MinIO).
- Comentário desatualizado em `carousels.ts:244` citando "Neon serverless" (🟢 #6) — cosmético,
  sem risco de segurança.

---

## 5. Prompt de execução (para o Sonnet)

> **Como usar:** abra uma conversa **nova** do Claude Code (Sonnet) com o projeto aberto e
> cole o prompt abaixo. Cobre os 3 itens em ordem de risco. Pare nos gates que o prompt pedir.

```text
Correções de segurança para o MVP — ADR 0003. Leia docs/adr/0003-correcoes-seguranca-mvp.md
INTEIRO antes de agir (contexto: auditoria de segurança rodada após o cutover da ADR 0002,
produto já em produção em carrosselstudio.evoiatecnologia.com). Três itens, nesta ordem:

ITEM 1 — CORS do MinIO (conduzido, sem código):
Me conduza a confirmar o valor real de MINIO_API_CORS_ALLOW_ORIGIN configurado no serviço
MinIO (painel EasyPanel ou `mc admin config get <alias> api` no terminal da VPS). Se não for
exatamente `https://carrosselstudio.evoiatecnologia.com`, me guie a corrigir e reiniciar o
serviço. Não avance pro item 2 sem eu confirmar o resultado.

ITEM 2 — Headers de segurança (código pequeno e isolado):
Edite next.config.mjs adicionando headers() com, para todas as rotas: X-Content-Type-Options:
nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin,
Strict-Transport-Security: max-age=63072000; includeSubDomains (SEM preload). Rode npm run
test + npm run build, me mostre o diff, e só commite com minha confirmação explícita (branch
main, sem PR — mesmo padrão do fix DB_CA_CERT da ADR 0002 Bloco 3).

ITEM 3 — Rate limit no login (esteira dev-agents:feature, com gates):
Trate como mudança na fronteira de autenticação — passe pela esteira dev-agents:feature
(story → spec → backend → testes → validação), parando nos gates humanos. Escopo: bloquear
tentativas repetidas de login em src/lib/actions/auth.ts (signInAction), que é o único
caminho que o form de /login usa. Decisão técnica já fixada na ADR (não reabrir): rate limit
PERSISTIDO NO POSTGRES (tabela nova, ex. login_attempts) — SEM Redis/Upstash/vendor externo,
por consistência com a ADR 0001 (backend 100% nosso). Parâmetro sugerido pra validar na spec:
bloqueio temporário após 5 tentativas falhas em 15 min, por e-mail E por IP. Mensagem de erro
continua genérica (nunca revela se foi bloqueio por tentativas ou senha errada).

Critério de aceite dos 3 itens: npm run test + npm run build verdes. Commit(s) e push só com
minha confirmação explícita a cada vez (branch main sem PR, mesma regra da ADR 0002).

Ao fim: atualize docs/STATUS.md e o Status desta ADR (Proposta -> Implementada), registre a
sessão em docs/sessoes/.
```

## 6. Execução — resultado (2026-07-03)

- **Item 2.2 (CORS do MinIO):** confirmado no painel EasyPanel —
  `MINIO_API_CORS_ALLOW_ORIGIN=https://carrosselstudio.evoiatecnologia.com`, já correto.
  Nenhuma correção necessária.
- **Item 2.3 (Headers de segurança):** `next.config.mjs` com `headers()` cobrindo todas as
  rotas (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Strict-Transport-Security` sem preload). `npm run test` (271 passed) e `npm run build`
  verdes. Commit `a4528c5`, push confirmado.
- **Item 2.1 (Rate limit no login):** esteira `dev-agents:feature` completa (story → spec →
  backend → testes → validação), gate da story aprovado em bloco pelo operador (delegando a
  resolução das perguntas técnicas ao CTO). Entrega: tabela `login_attempts` (Postgres,
  migration aditiva não destrutiva), bloqueio por e-mail **e** IP a 5 falhas/15 min (janela
  deslizante), fail-closed na checagem, best-effort na gravação/limpeza, mensagem de erro
  sempre genérica. 296 testes passando (296 passed / 1 skip), type-check e build limpos.
  Validação independente: **aprovado**, sem achado 🔴. Duas ressalvas 🟡/🟢 (timing
  side-channel do bloqueio; ESLint não configurado no projeto — dívida pré-existente)
  registradas como endurecimento futuro, não bloqueiam. Detalhe completo em
  `.work/rate-limit-login/` e `docs/sessoes/2026-07-03-adr0003-correcoes-seguranca.md`.

Critério de aceite da ADR cumprido: `npm run test` + `npm run build` verdes em todos os
itens de código.
