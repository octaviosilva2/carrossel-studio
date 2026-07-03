# Sessão S1 — Fundação + Motor de render — 2026-06-30

## Objetivo
Entregar a primeira fatia de código: scaffold da app + componente do slide (modelo Octavio) +
motor de render HTML→PNG **1080×1350** no browser. Conduzida pela esteira `dev-agents`.

## Como foi conduzido
- Entrada pela **STORY** (research já pronto em `.work/s1-fundacao-render/research.md`).
- Esteira: story (02) → spec (03) → build → testes (06) → validação independente (07).
- CEO autorizou seguir os gates pelas recomendações; gates registrados em `.work/s1-fundacao-render/STATUS.md`.

## Decisões-chave
- **Render:** `html-to-image` (`toPng`), nó em **1080×1350 px reais** + `pixelRatio: 1` → PNG
  1:1 exato (elimina erro de DPR, o critério central). `satori`/server fica como fallback (S4).
- **Fonte:** stack `'Segoe UI','Selawik',system-ui,…`. Na S1, a Segoe UI real do Windows dá
  fidelidade máxima (os PNGs de prova foram gerados aqui). Embarcar woff2 (Selawik) via
  `next/font/local` é **follow-up crítico antes do deploy Linux**.
- **Tokens do slide** em CSS vars inline por tema (escopados ao `.slide`), separados do tema
  Tailwind/shadcn da plataforma. Números portados 1:1 de `docs/REFERENCIA-VISUAL.md`.
- **Auto-fit de texto (overflow):** fora da S1 (decisão do gate da story).
- **Testes:** Vitest + `sharp` (dimensão real dos 4 PNGs) + `@testing-library/react` (contrato).
  Fixtures gerados pelo caminho real de export via Playwright usando o **Edge do sistema**
  (`channel: 'msedge'`, sem baixar Chromium).

## Entregue (arquivos)
- Scaffold: `package.json`, `tsconfig.json` (strict + `noUncheckedIndexedAccess`), `next.config.mjs`,
  `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `src/app/globals.css`.
- Slide (motor de render): `src/components/slide/{slide,verified-badge,types,slide-tokens,layout}.*`
  + `slide-tokens.css` (doc canônica dos hexes).
- Export: `src/lib/export-png.ts`. UI base: `src/components/ui/{button,card}.tsx`, `src/lib/utils.ts`.
- App: `src/app/{layout,page}.tsx` + `src/app/render-test/{page,fixtures}.tsx`.
- Testes: `tests/{slide.test.tsx,png-dimensions.test.ts,setup.ts}`, `vitest.config.ts`.
- Prova: 4 PNGs reais em `tests/fixtures/` (1080×1350) + `scripts/generate-fixtures.mjs`.

## Resultado da validação (estágio 07 — auditor independente)
- `npm run build` + type-check: **limpos**.
- `npm test`: **15/15** (4 dimensão + 11 contrato).
- 4 PNGs conferidos a olho: batem o modelo Octavio (selo azul com check, header centralizado,
  temas corretos, imagem radius/borda, sem barra de engajamento/logo/emoji). Diacríticos OK.
- **Veredito: APROVAR** — zero achado bloqueante.

## Follow-ups agendados (fora do escopo S1)
- Embarcar woff2 (Selawik/Segoe UI) antes de deploy — **crítico** (S6/deploy).
- Configurar ESLint (hoje `ignoreDuringBuilds: true`).
- Auto-fit de texto por overflow — S2/editor.

## Próximo passo
Sessão 2 — Editor manual. Reusar `<Slide>` e `export-png` (não recriar). Prompt pronto em
`docs/PROMPTS-SESSOES.md`.
