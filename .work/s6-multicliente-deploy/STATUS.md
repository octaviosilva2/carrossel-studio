# S6 — Multi-cliente + hardening — STATUS (handoff)

## Estado: CONCLUÍDA (deploy adiado pelo CEO)
Esteira conduzida com research pulado (código já mapeado). Gates: triagem de escopo
(3 decisões YAGNI) + aprovação de story/spec. Deploy NÃO executado nesta sessão
(decisão do CEO: "não iremos dar deploy ainda"); o guia `docs/DEPLOY.md` foi cancelado.

## Entregue
- **Config de identidade padrão** — tela `/settings` (page + form) editando o `client`
  do dono (nome, handle, avatar via Blob, selo, tema). Backend: `getClientSettings`/
  `updateClientSettings` (`src/lib/actions/settings.ts` + `settings-types.ts`), padrão
  S3 (requireUser + Zod + UPDATE WHERE id AND ownerId). `getDefaultClient` extraído
  para `src/lib/client-repo.ts` (reuso por carousels.ts e settings.ts).
- **Isolamento** — auditado (todas as queries filtram por ownerId; sem IDOR). Ver
  `security-review.md`.
- **Hardening** — `toExportSafeUrl` com allowlist de host (`isAllowedBlobHost`, só
  `*.public.blob.vercel-storage.com`). Análise de segurança rodada: 0 achado 🔴/🟡,
  1 🟢 (avatarUrl aceita https arbitrário — não explorável, fatia futura).
- **Provisionamento** — `npm run client:create` (`scripts/create-client.mjs`): cria
  user + client, idempotente por e-mail, bcrypt 12, nunca imprime senha.
- **Fonte embarcada** — Selawik Regular/Bold woff2 (SIL OFL 1.1, `src/fonts/`) via
  `next/font/local` (`src/app/fonts.ts`), var `--font-selawik` no `<html>`,
  `SLIDE_FONT_STACK` atualizada (Segoe UI → Selawik embarcada → system-ui). Resolve o
  follow-up crítico da fonte no Linux.

## Testes
- **250 passed / 1 skip (herdado S1) / 0 falha.** +20 novos: `tests/settings-action.test.ts`
  (11), `tests/export-safe-url.test.ts` (9). Type-check + build de produção limpos.

## Pendências / próximos passos
- **Deploy** (adiado pelo CEO): quando for, embutir as env vars na Vercel, rodar
  `drizzle-kit migrate` + `client:create`, e decidir Hobby→Pro antes do 1º pagante.
- **Smokes manuais herdados** (S3/S4/S5) seguem pendentes de navegador.
- Smoke novo S6: editar identidade em `/settings`, criar carrossel novo e conferir a
  herança; exportar com imagem do Blob (allowlist).
