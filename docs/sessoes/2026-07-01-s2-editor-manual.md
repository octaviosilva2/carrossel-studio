# Sessão S2 — Editor manual de carrossel — 2026-07-01

## Objetivo
Entregar o editor manual (estado local, SEM banco): montar carrossel slide a slide, editar
identidade + corpo + imagem, add/remover/reordenar/navegar slides, preview ao vivo reusando o
`<Slide>` da S1 e toggle de tema claro/escuro. Conduzida pela esteira `dev-agents`.

## Como foi conduzido
- Esteira completa: research (01) → story (02) → spec (03) → **[pulou 04 backend: sem servidor/banco]**
  → frontend (05) → testes (06) → validação independente (07).
- Estado do pipeline em `.work/s2-editor-manual/` (research, story, spec, tests, validation, STATUS).
- CEO decidiu os pontos abertos no gate pré-story e autorizou seguir a implementação ("Escreva").

## Decisões-chave (fixadas pelo CEO)
- **Identidade única compartilhada** por carrossel (name, @handle, avatar, selo): editada uma vez,
  reflete em todos os slides. Corpo e imagem são **por slide**.
- **Reorder por botões ↑/↓** (sem drag-and-drop nesta fatia — zero dependência nova).
- **Sem export** no S2 — PNG/ZIP fica 100% na S4; `export-png.ts` não é acionado.
- **Tema = toggle global** do carrossel (claro/escuro), aplicado a todos os slides.
- **Upload local via `FileReader → data-URL`** (alinhado à S1 e ao `cacheBust`), sem storage remoto.
- **Rota `/editor`** (home ganhou link). **Validação de upload:** só imagem + limite **6 MB**.

## Arquitetura (spec §03)
- `useReducer` com **reducer puro extraído** para `src/lib/editor-state.ts` (testável sem DOM):
  estado = `identity` única + `theme` global + `slides[]` (`{id, body, imageUrl?}`) + `selectedSlideId`.
  Invariantes garantidas no reducer (seleção sempre válida; avatar nunca `""`; reorder/remover não
  tocam identidade/tema; no-op nas pontas retorna a mesma referência).
- **Contrato `SlideData` intocado** — composição por cima via `toSlideData(identity, slide, theme)`.
- **Preview** reusa `<Slide>` como caixa-preta, escalado por `transform: scale(420/1080)` (padrão da
  S1 em `render-test`), sem `zoom` nem alterar width/height do nó.
- **Validação de upload** por função pura em `src/lib/image-upload.ts` (sem Zod — 2 regras triviais).
- **Placeholder de avatar** = data-URL SVG inline (`DEFAULT_AVATAR_DATA_URL`), evita `<img src="">`.

## Entregue (arquivos)
- Lógica pura: `src/lib/editor-state.ts`, `src/lib/image-upload.ts`.
- UI (co-locada): `src/app/editor/{page,identity-panel,slide-nav,slide-editor,theme-preview}.tsx`.
- shadcn/ui (via CLI): `src/components/ui/{input,textarea,label,switch}.tsx` (+ deps Radix
  `react-label`, `react-switch`).
- Editado: `src/app/page.tsx` (link para `/editor`).
- Testes: `tests/editor-reducer.test.ts` (43), `tests/image-upload.test.ts` (7),
  `tests/editor-page.test.tsx` (5).

## Resultado da validação (estágio 07 — auditor independente)
- `npm run type-check`: **limpo** (strict + `noUncheckedIndexedAccess`).
- `npm run test`: **70/70** (55 novos S2 + 15 da S1 sem regressão).
- `npm run build`: compilou; `/editor` no build (página estática ~9.5 kB).
- **26 critérios de aceite + 8 edge cases: todos ATENDEM** com evidência `arquivo:linha`.
- Isolamento da S1 provado por `git diff` vazio em `src/components/slide/*` e `export-png.ts`.
- **Veredito: APROVADO** — zero achado bloqueante (2 achados 🟢 de baixo impacto em testes).

## Follow-ups / notas (fora do escopo S2)
- **Fonte woff2 não embarcada** → preview fiel só no Windows. Pendência de infra pré-deploy Linux
  (herdada da S1) — não bloqueia o editor.
- Persistência/recarregar perde o estado — por design; entra na S3.
- ESLint ainda `ignoreDuringBuilds: true` (herdado da S1).

## Próximo passo
Sessão 3 — Persistência + Auth + Storage (Auth.js, Drizzle + schema no Neon, upload real no Vercel
Blob, salvar/abrir carrossel). **Depende do CEO:** Neon + Vercel/Blob. Prompt em `docs/PROMPTS-SESSOES.md`.
