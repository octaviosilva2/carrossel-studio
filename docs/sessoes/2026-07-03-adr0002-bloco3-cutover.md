# Sessão 2026-07-03 — ADR 0002 Bloco 3: Cutover (Fase 7)

## Objetivo
Conduzir o corte de produção: env vars na Vercel, deploy, smoke test manual, conforme
`docs/adr/0002-migracao-vps-easypanel.md` (Fase 7). Conduzido passo a passo — Octavio
executou no painel da Vercel, Claude guiou e validou.

## Achado bloqueante #1 — código nunca commitado
Antes de qualquer coisa: `git status` mostrou que **todo o código da aplicação estava
untracked** — `src/`, `package.json`, `tests/`, `drizzle/` etc. Só a documentação (ADRs,
roadmap, fundação) tinha sido commitada nos 3 dias anteriores (S1–S6 + ADR 0002 Bloco 1/2
inteiros, feitos e validados, mas nunca versionados). O pré-requisito do Bloco 3 ("PR do
Bloco 2 mergeado") não podia ser satisfeito.

Resolvido com aprovação do Octavio: 269 testes + build confirmados verdes localmente,
segredos auditados (grep por padrões de chave/senha — só matches de teste/placeholder),
um arquivo estranho (PNG mal-nomeado, artefato de sessão anterior) excluído do commit,
commit único (`4fa4cc7`) + push pra `main` (confirmação explícita do Octavio antes do push,
por ser ação em branch default sem PR).

## Achado bloqueante #2 — CA pinado não sobrevive a deploy serverless
Ao revisar o pré-requisito de TLS antes de mexer nas envs: `src/db/index.ts` lê o CA do
Postgres de `certs/db-ca.pem`, arquivo local fora do git (`.gitignore` cobre `certs/`).
Esse arquivo não existe no ambiente de build/runtime da Vercel — o app cairia com `ENOENT`
em toda requisição que tocasse o banco.

Fix aplicado (aprovado pelo Octavio, escopo pequeno e isolado, fora da esteira completa
dev-agents dado o tamanho): `DB_CA_CERT` — nova env opcional em `src/lib/env.ts` com o
conteúdo do PEM; `src/db/index.ts` usa `Buffer.from(env.DB_CA_CERT)` quando presente,
cai pro arquivo local quando ausente (dev local intocado). Validado **localmente** com um
script descartável que conecta de verdade no Postgres da VPS usando o caminho via env
(prova antes de gastar ciclo de build na Vercel) — `CONNECT_OK`. 271 testes + build verdes.
Commit `a16494a`, push confirmado explicitamente.

## Cutover na Vercel — passo a passo
1. **Env vars:** as 10 chaves (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DB_CA_CERT`,
   `AUTH_SECRET`, `S3_ENDPOINT`, `S3_PUBLIC_HOST`, `S3_BUCKET`, `S3_REGION`,
   `S3_ACCESS_KEY`, `S3_SECRET_KEY`) setadas no painel, escopo Production.
2. **Erro #1 (build):** faltavam as 8 vars obrigatórias no build — causa: escopo
   Production não estava marcado ao adicionar. Corrigido pelo Octavio.
3. **Erro #2 (build):** `ENOENT certs/db-ca.pem` — `DB_CA_CERT` especificamente não tinha
   chegado (variável não salva/escopo errado). Corrigido; validado local antes do redeploy
   (ver achado #2 acima).
4. **Erro #3 (build):** `No Output Directory named "public"` — o projeto Vercel tinha sido
   criado/linkado quando o repo só tinha documentação (sem `package.json`), então o
   **Framework Preset** ficou como "Other" (site estático) em vez de "Next.js". Corrigido
   em Settings → Build and Development Settings.
5. **Deploy Ready**, ambiente Production **Current**, domínio
   `carrosselstudio.evoiatecnologia.com` atrelado.
6. **Schema na VPS:** confirmado direto (script de leitura descartável, sem alterar nada) —
   tabelas `carousels`, `clients`, `slides`, `users` existem; 1 usuário (admin do seed).

## Smoke test (Fase 7d) — PASS em tudo
- **a) Login:** OK.
- **b) Criar carrossel + salvar:** OK — prova banco na VPS + `db.transaction()`.
- **c) Upload de avatar e imagem de slide:** OK — prova MinIO + presigned PUT.
- **d) Export PNG:** OK — avatar e imagem do slide renderizados no PNG, prova a allowlist
  nova (`isAllowedBlobHost` reconhecendo o host do MinIO).

## Limpeza
- `tsconfig.tsbuildinfo` (artefato de build) tinha entrado no commit do código por engano —
  removido do índice e adicionado ao `.gitignore`.

## Pendências deixadas para o Octavio
- **Manter as contas Neon e Vercel Blob vivas (free tier) por alguns dias** antes de
  desligar — são o rollback do cutover.
- Decisão Hobby→Pro da Vercel antes do 1º cliente pagante (`docs/RESTRICOES.md`).
- Smokes ainda não cobertos por este bloco: geração via `/generate` (Claude API real) e
  herança de identidade em `/settings` (herdados de S5/S6, não fazem parte do escopo do
  ADR 0002).

## Resultado
ADR 0002 **Implementada**. Produto em produção em `carrosselstudio.evoiatecnologia.com`,
banco e storage self-hosted na VPS Hostinger (EasyPanel), app na Vercel. Pronto para
configurar o 1º cliente, sujeito às pendências acima.
