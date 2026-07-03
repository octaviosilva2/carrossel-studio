# ADR 0002 — Bloco 2 (código) — STATUS (handoff)

## Triagem
Escopo: refactor de infra — troca de driver de banco (Neon serverless → `pg` sobre
Postgres na VPS) e de storage (Vercel Blob → MinIO/S3 via presigned PUT). Cruza só a
camada de backend/infra; sem mudança de UI. **Research pulado** — `docs/adr/0002-migracao-vps-easypanel.md`
já mapeou exaustivamente arquivos, linhas, riscos e decisões técnicas (equivalente ao
01-research.md). Entrando direto no estágio **02 (story)**.

Pré-requisitos confirmados antes de iniciar (ver conversa da sessão):
- `.env.local`: `DATABASE_URL` (PgBouncer :6432) e `DATABASE_URL_UNPOOLED` (:5432) já
  apontam pra VPS (`72.60.6.238`, `carrossel_studio`).
- `.env.local`: as 6 vars `S3_*` (MinIO) presentes com valores reais.
- Cert TLS do Postgres: self-signed, **sem SAN** (confirmado via `openssl s_client`).
  Decisão do CEO: **pinning** do cert exato — salvo em `certs/db-ca.pem` (`.gitignore`
  já cobre `certs/`) — com bypass do `checkServerIdentity` (não há SAN pra checar).
  Não reemitir o cert.

## Estágio atual
**CONCLUÍDA.** Aprovada pelo CEO no gate final. Documentação fechada: docs/STATUS.md,
docs/ROADMAP.md e docs/sessoes/2026-07-02-adr0002-bloco2-codigo.md atualizados.

## Gates aprovados
- [x] Story (02) — aprovada como está (1 story, 2 estágios internos)
- [x] Spec (03) — aprovada como está (inclui: migrar scripts/seed.mjs e create-client.mjs pra pg;
      ws transitivo legítimo não viola AC; mock de @/lib/env no teste; URL path-style)
- [x] Validação (07) — veredito do validador: ✅ APROVAR. Aprovado pelo CEO.
