# ROADMAP — Construção do Carrossel Studio

> Plano de execução fatiado em sessões. Aprovado pelo CEO em 2026-06-30.
> Cada sessão = 1 fatia vertical fechada de ponta a ponta pela esteira `dev-agents`
> (research → story → spec → backend → frontend → testes → validação), parando nos
> gates humanos. Ao fim de cada sessão, `STATUS.md` e `.work/` são atualizados para a
> próxima sessão retomar pelo resumo (contexto persistente, economia de token).

## Decisões fechadas
- **Render:** HTML → PNG no browser (mesma stack TS, sem runtime Python na Vercel).
  Validado com o primeiro PNG real da S1. Encerra a decisão em aberto HTML × Python.

## Ordem otimizada (S1, S2 e S4 não dependem de credencial do CEO)

| Sessão | Entrega fechada | Depende do CEO |
|---|---|---|
| **S1 — Fundação + Motor de render** | Scaffold Next.js 15 (App Router) + Tailwind/shadcn. Componente do slide (header centralizado, selo azul `#1D9BF0`, imagem radius 28, temas claro/escuro) → **PNG 1080×1350 real**. | nada |
| **S2 — Editor manual** | Montar carrossel slide a slide: header, texto, upload de imagem, reordenar, **preview ao vivo** com o motor. Estado local. | nada |
| **S3 — Persistência + Auth + Storage** | Auth.js (login por senha), Drizzle + schema (users, clients, carousels, slides) no Neon, upload real no Vercel Blob, salvar/abrir carrossel. | Neon + Vercel/Blob |
| **S4 — Export** | Todos os slides → PNGs → download (ZIP). Carrossel pronto pro Instagram. | nada |
| **S5 — Geração com IA** | Entrada de intenção → Claude monta os slides (server-side) → cai no editor pra ajustar/regenerar. | Claude API ativa |
| **S6 — Multi-cliente + deploy + hardening** | Config por cliente (identidade/tema padrão), isolamento de dados, segurança baseline, deploy produção. Pronto pro 1º cliente. | — |

## Estratégia de eficiência de token
- **Fatia fechada + handoff:** ao fim de cada sessão, atualizar `STATUS.md` e `.work/`;
  a próxima sessão lê o resumo, não o histórico.
- **Subagents `dev-agents` no fan-out:** research/spec rodam isolados e devolvem só o
  destilado — o thread principal fica leve.
- **Gates curtos:** resumo + pergunta objetiva (skill `conduzir-gate`), sem despejar o
  artefato inteiro.

## Estado atual
- ✅ **S1 CONCLUÍDA e validada** (2026-06-30) — scaffold Next.js 15 + `<Slide>` fiel ao modelo +
  export HTML→PNG 1080×1350 provado com 4 PNGs reais e 15/15 testes. Motor de render pronto para
  S2/S4/S5 reusarem (componente `src/components/slide/` + `src/lib/export-png.ts`).
  Follow-up: embarcar a fonte woff2 antes do deploy (ver `docs/STATUS.md`).
- ✅ **S2 CONCLUÍDA e validada** (2026-07-01) — editor manual em `/editor`: `useReducer` com reducer
  puro (`src/lib/editor-state.ts`), identidade única + tema global + slides, add/remover/reordenar
  (↑/↓)/navegar, upload local (data-URL, validação tipo + 6 MB), preview ao vivo reusando o `<Slide>`
  escalado (contrato `SlideData` intocado). 70/70 testes verdes, build/type-check limpos. Estado local
  sem banco (persistência é S3).
- ✅ **S3 CONCLUÍDA e validada** (2026-07-01) — Auth.js v5 (Credentials + **JWT**, bcryptjs), Drizzle +
  Neon (schema `users/clients/carousels/slides`, migration + seed aplicados), Vercel Blob (client
  upload, sessão + 6 MB, smoke real PASS). Editor ligado à persistência: `/login`, `/carousels`,
  salvar/listar/reabrir por dono, reordenação persistida, identidade fixa por cliente + override.
  Zod nas bordas, authz por dono em toda query. **137/137 testes verdes**, type-check + build limpos.
  Aprovada com ressalva de smoke manual (10 ACs de runtime no navegador — ver `validation.md`).
  Decisão de gate: sessão **JWT** no lugar de database (obrigatório p/ Credentials no Auth.js v5).
- ✅ **S4 CONCLUÍDA e validada** (2026-07-01) — export em `/editor`: todos os slides → PNGs
  **1080×1350 exatos** (pixelRatio 1) → **ZIP** (`jszip`) + download individual do slide. Motor
  aditivo em `src/lib/export-png.ts` (`renderSlidesToPngs`, `exportCarouselToZip`, `toExportSafeUrl`
  resolvendo o tainted canvas do Blob via data-URL antes do canvas, helpers de nomeação zero-pad),
  captura off-screen sob demanda (`export-capture.tsx`), 2 botões no header. **171/171 testes verdes**
  (1 skip: guardião multi-slide aguarda fixture de browser), type-check + build limpos. Decisão de
  gate: imagem do Blob via **fetch direto**; proxy `/api/blob/proxy` desenhado como plano B não
  implementado. Aprovada com ressalva de smoke manual (fixture multi-slide + imagem do Blob/CORS —
  ver `.work/s4-export/validation.md`).
- ✅ **S5 CONCLUÍDA e validada** (2026-07-02) — geração com IA: tela de intenção em `/generate` →
  server action `generateCarousel` (padrão S3: `requireUser` + Zod) chamando a Claude API com
  **`claude-sonnet-4-6`** (decisão do CEO), structured output via `zodOutputFormat`, `thinking`
  adaptive, sem temperature, checando `refusal`. Defesa em 3 camadas (schema API → Zod → sanitização
  de emoji/markdown); AC-5 = dica textual de imagem no body sem tocar `SlideData`. Persiste carrossel
  **novo** do dono (`createGeneratedCarousel`, transação) → `redirect /editor?id=`. Chave **lazy**
  (app sobe sem ela), sem cota. **230/230 testes verdes** (1 skip herdado S1), type-check + build
  limpos, validador 10/10 ACs sem achados de segurança. Ressalva: smoke manual da chamada real à
  Claude API no navegador.
- ✅ **S6 CONCLUÍDA** (2026-07-02, deploy adiado pelo CEO) — multi-cliente + hardening. Tela
  `/settings` editando a identidade padrão do `client` do dono (nome/handle/avatar/selo/tema);
  backend `getClientSettings`/`updateClientSettings` (padrão S3: requireUser + Zod + WHERE
  ownerId), `getDefaultClient` extraído p/ `client-repo.ts`. Isolamento por ownerId auditado
  (sem IDOR). Análise de segurança: 0 achado 🔴/🟡; endurecimento `toExportSafeUrl` com allowlist
  de host do Blob. Provisionamento por script (`npm run client:create`). **Fonte Selawik woff2
  embarcada** (SIL OFL 1.1, `next/font/local`) — follow-up crítico resolvido. **250 testes
  verdes** (1 skip herdado), type-check + build de produção limpos. Decisões YAGNI: script (não
  admin UI), 1 identidade por cliente. **Deploy adiado** pelo CEO — quando for: env vars Vercel,
  `drizzle-kit migrate` + `client:create`, decisão Hobby→Pro.

## Produto pronto para o 1º cliente
As 6 sessões do roadmap estão entregues. Falta apenas o **deploy de produção** (adiado pelo
CEO) e os **smokes manuais** de navegador para liberar a configuração do 1º cliente.

## ADR 0002 — Migração de infra (Neon/Vercel Blob → VPS Hostinger)
Fora do roadmap original das 6 sessões — decisão posterior do CEO de sair de serviços
gerenciados. Ver `docs/adr/0002-migracao-vps-easypanel.md` e `docs/STATUS.md`.

- ✅ **Bloco 1 — Infra na VPS** (2026-07-02): Postgres + PgBouncer + MinIO provisionados
  no EasyPanel, TLS, backup, firewall.
- ✅ **Bloco 2 — Código** (2026-07-02): driver de banco (`pg`) e storage (MinIO via
  presigned PUT) trocados pela esteira `dev-agents`. 269 testes verdes, validado.
- ✅ **Bloco 3 — Cutover** (2026-07-03): env vars na Vercel, deploy de produção, domínio
  `carrosselstudio.evoiatecnologia.com` no ar, smoke test completo (login, salvar carrossel,
  upload MinIO, export PNG com allowlist nova) PASS. Detalhe:
  `docs/sessoes/2026-07-03-adr0002-bloco3-cutover.md`.

## Produto em produção
O Carrossel Studio está no ar em `carrosselstudio.evoiatecnologia.com`, banco e storage
self-hosted na VPS. Pronto para configurar o 1º cliente pagante (decisão Hobby→Pro da
Vercel ainda pendente do CEO — ver `docs/RESTRICOES.md`).
