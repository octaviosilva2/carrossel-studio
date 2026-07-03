# Sessão 2026-07-02 — S6: Multi-cliente + hardening

## Objetivo
Deixar o produto pronto para configurar o 1º cliente: configuração de identidade
padrão, isolamento de dados, hardening de segurança. (Deploy adiado pelo CEO durante
a sessão.)

## Condução da esteira
Autonomia dada pelo CEO para pular estágios. **Research pulado** (código já mapeado na
própria sessão). Dois gates humanos:
1. **Triagem de escopo** — 3 decisões YAGNI travadas: provisionamento por script (não
   admin UI), uma identidade por cliente, deploy preparado→executado pelo CEO.
2. **Story + spec** aprovadas antes de qualquer código.

## Decisões
- **Provisionamento via script** (`client:create`) em vez de área de admin com UI —
  suficiente para o modelo done-for-you; corta over-engineering.
- **Uma identidade por cliente** — sem mudança de schema; multi-identidade fica para
  quando um cliente real pedir.
- **`getDefaultClient` extraído** para `src/lib/client-repo.ts` (reuso sem duplicar).
- **Fonte:** Selawik (SIL **OFL 1.1**, não MIT como a spec supôs) — o release oficial
  da Microsoft traz woff2 prontos; embarcados via `next/font/local`. Segoe UI segue 1ª
  na cascata (fidelidade máxima no Windows local), Selawik garante o Linux.
- **Allowlist de host** no export (`isAllowedBlobHost`) — só o CDN do Blob; não viramos
  proxy de fetch de host arbitrário.
- **Deploy adiado** pelo CEO no fim da sessão → `docs/DEPLOY.md` cancelado.

## Entregue (arquivos)
- Novos: `src/lib/client-repo.ts`, `src/lib/actions/settings-types.ts`,
  `src/lib/actions/settings.ts`, `src/app/settings/page.tsx`,
  `src/app/settings/settings-form.tsx`, `src/app/fonts.ts`,
  `src/fonts/Selawik-{Regular,Bold}.woff2` + `Selawik-LICENSE.txt`,
  `scripts/create-client.mjs`, `tests/settings-action.test.ts`,
  `tests/export-safe-url.test.ts`.
- Editados: `src/lib/actions/carousels.ts` (importa client-repo),
  `src/lib/export-png.ts` (allowlist), `src/components/slide/slide-tokens.ts`
  (font stack), `src/app/layout.tsx` (font var), `src/app/carousels/page.tsx`
  (link /settings), `package.json` (script), `.env.example` (vars client:create).

## Segurança
Auditoria ativa (OWASP) sobre o diff — `.work/s6-multicliente-deploy/security-review.md`.
0 achado 🔴/🟡; 1 🟢 (avatarUrl aceita https arbitrário — não explorável, dono edita a
própria marca, export já recusa host fora do Blob). Isolamento por ownerId íntegro na
superfície nova e herdada.

## Testes
250 passed / 1 skip (herdado S1) / 0 falha. Type-check + build de produção limpos.
+20 novos (settings 11, export-safe-url 9).

## Pendências
- Deploy (adiado): env vars na Vercel, `drizzle-kit migrate` + `client:create`,
  decisão Hobby→Pro antes do 1º pagante.
- Smokes manuais de navegador (herdados S3/S4/S5 + o da S6: editar `/settings` →
  herança em carrossel novo; export com imagem do Blob).
