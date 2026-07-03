# STATUS — S3 Persistência + Auth + Storage

- **Slug:** s3-persistencia-auth-storage
- **Ponto de entrada:** 01-researcher (feature nova, cruza todas as camadas)
- **Estágio atual:** 04-backend (em andamento)
- **Gates aprovados:** GATE 1 (story) e GATE 2 (spec) aprovados em 2026-07-01
- **Modo:** autônomo — CEO delegou atravessar gates com as opções recomendadas e concluir a S3.

## Decisão do gate 2 (spec)
- Sessão **JWT** (Opção A da spec), NÃO database — obrigatório para login por senha no Auth.js v5
  (Credentials + database session é oficialmente incompatível). Usuário/senha ficam no Postgres;
  sessão stateless assinada com AUTH_SECRET. Sem @auth/drizzle-adapter (simplificação YAGNI).

## Refinamentos aprovados no gate 1
- Campo `title` no carrossel: SIM (editável no editor).
- Estado: só `createdAt`/`updatedAt` (sem campo status nesta fase).
- Seed: cria user admin + 1 client com identidade default (placeholders editáveis).

## Decisões do CEO (2026-07-01)
- **Acesso:** só admin (Octavio) nesta fase. 1 usuário real; queries já filtram por dono (prep S6).
- **Identidade:** fixa por cliente com **override opcional** por carrossel (campo nulo herda do cliente).
- **Contas:** criadas por script/seed (sem signup/tela de admin nesta fase).

## Decisões técnicas (CTO)
- Hash: bcryptjs. Sessão: strategy `database` (Postgres) + proteção via `auth()` no server.
- Driver: Neon serverless p/ app; conexão direta p/ migrations.
- Export/CORS: converter imagem do Blob p/ data-URL antes do canvas (evita tainted canvas na S4).

## Escopo
1. Auth.js (NextAuth v5) — login por senha (hash), sessões no Postgres.
2. Drizzle ORM + schema (users, clients, carousels, slides) + migrations no Neon.
3. Upload real de imagem no Vercel Blob (client upload, validação 6 MB).
4. Salvar/listar/reabrir carrosséis por usuário; ligar editor da S2 à persistência.

Baseline de segurança: Zod nas bordas, authz por usuário, sem segredo no código.

## Credenciais (confirmadas)
- DATABASE_URL — Neon Postgres 18.4, conexão testada OK (host direto `.c-4.`, ajustar pooled na spec).
- BLOB_READ_WRITE_TOKEN — Vercel Blob store `carrossel-studio-blob` (público).
- AUTH_SECRET — gerado.

## Log de estágios
- [x] 01-research
- [x] 02-story (GATE 1 aprovado)
- [x] 03-spec (GATE 2 aprovado — sessão JWT)
- [x] 04-backend — migration + seed aplicados no Neon; type-check limpo; 70 testes S2 verdes; build ok
- [x] 05-frontend — /login, /carousels, editor ligado à persistência + upload real; 70 verdes; build ok
- [x] 06-tester — 137/137 verdes (70 S2 + 67 novos); nenhum bug de produção
- [x] 07-validator (GATE 3) — APROVAR COM RESSALVAS; 137/137, type-check+build ok, segurança sem furos
- [x] smoke Blob real — put→GET 200→del PASS (token ponta a ponta)

## Fechamento
- CEO delegou concluir a S3 e aprovar gates com o recomendado. Esteira completa.
- Ressalva: 10 ACs de runtime (login/save/reabrir fim-a-fim no navegador) = roteiro de smoke manual
  para o Octavio (ver `validation.md`). Migração, seed e upload já provados na infra real.
