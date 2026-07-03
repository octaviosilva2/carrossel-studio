# Validação — S1: Fundação + Motor de render (slide → PNG 1080×1350)

> Auditoria independente (estágio 07). Verificações rodadas pelo validador, saída colada.
> Data: 2026-06-30. Slug: `s1-fundacao-render`.

---

## Testes / build (rodados por mim)

| Comando | Resultado | Saída |
|---|---|---|
| `npm run type-check` (`tsc --noEmit`) | **PASSOU** | Sem nenhum erro emitido. |
| `npm run build` (`next build`) | **PASSOU** | `✓ Compiled successfully in 1214ms`; `✓ Generating static pages (5/5)`; rotas `/` e `/render-test` geradas (Static). "Skipping linting" (ESLint desativado no build — decisão consciente). |
| `npm test` (`vitest run`) | **PASSOU — 15/15** | `Test Files 2 passed (2)` · `Tests 15 passed (15)`. `png-dimensions.test.ts` 4 testes; `slide.test.tsx` 11 testes. |
| `sharp` direto nos 4 PNGs (independente do teste) | **1080×1350 nos 4** | `slide-light-noimage 1080x1350 png 117KB` · `slide-light-image 1080x1350 png 503KB` · `slide-dark-noimage 1080x1350 png 109KB` · `slide-dark-image 1080x1350 png 499KB`. Pesos realistas (não placeholders vazios). |

Fixtures datados de 2026-06-30 21:19, coerentes com a sessão de build; gerados pelo caminho REAL de export (`scripts/generate-fixtures.mjs` → Playwright/Edge → clica "Exportar PNG" → `exportSlideToPng`/`html-to-image`).

---

## Critérios de aceite

### Scaffold da app

- [x] **App Next.js 15 (App Router) sobe e serve rota** — CUMPRIDO. `next build` gera `/` e `/render-test` como estáticas (saída acima). Home em `src/app/page.tsx:5` com link para `/render-test`. Next 15.5.19 confirmado no build.
- [x] **type-check + build de produção sem erros (TS strict)** — CUMPRIDO. Ambos rodados por mim, saída limpa. `tsconfig.json:8` `"strict": true`. *Ressalva de spec:* `noUncheckedIndexedAccess` (previsto na spec §Arquivos a tocar, linha 305) NÃO está no tsconfig — ver Escopo/🟡.
- [x] **TypeScript + Tailwind + shadcn/ui presentes e utilizáveis, UI minimalista** — CUMPRIDO. `package.json` traz `typescript`, `tailwindcss`, `@radix-ui/react-slot`, `class-variance-authority`, `tailwind-merge`, `lucide-react`. shadcn real em uso: `Button` (`src/components/ui/button.tsx`) e `Card` na rota de teste (`render-test/page.tsx:8-15,47-91`). `components.json` presente. UI da plataforma minimalista (home e render-test com tokens shadcn/slate, sem hardcode de cor).

### Componente do slide (fidelidade visual)

- [x] **Tokens de layout fiéis (canvas 1080×1350, margem 80, largura 920, centralização vertical com/sem imagem)** — CUMPRIDO. `slide-tokens.ts:5-9` porta `CANVAS_W=1080, CANVAS_H=1350, MARGIN=80, CONTENT_W=920, VERT_PAD=60` — batem `REFERENCIA-VISUAL.md`. Centralização vertical via flex `justify-content:center` (`slide.tsx:88-97`) com o ajuste `−20` do caso sem imagem aplicado como `translateY(-20px)` (`slide.tsx:96`, `NOIMG_CENTER_SHIFT=20`). Conferido a olho nos 4 PNGs: bloco centralizado, sem imagem levemente acima do centro (o −20). Opção A da spec confirmada suficiente — não precisou cair no fallback `layout.ts`.
- [x] **Tema claro (#FFFFFF / #14171A / #536471 / #CFD9DE)** — CUMPRIDO. `slide.tsx:32-38` e `slide-tokens.css:5-11`. Teste `slide.test.tsx:82-90` assere os hexes resolvidos. PNG claro conferido por mim (fundo branco, texto quase-preto, handle cinza).
- [x] **Tema escuro (#000000 / #FFFFFF / #71767B / #2F3336)** — CUMPRIDO. `slide.tsx:39-45` e `slide-tokens.css:13-19`. Teste `slide.test.tsx:92-100`. PNG escuro conferido por mim (fundo preto real, texto branco, handle cinza, borda de imagem escura).
- [x] **Header: avatar 88, nome Bold 42, handle Regular 36, selo azul com check (nunca estrela), on/off, bloco único** — CUMPRIDO. `slide.tsx:100-149`: avatar 88 circular, nome `fontSize:42 fontWeight:700`, handle `fontSize:36 fontWeight:400` prefixado `@`. Selo = `verified-badge.tsx`: `<circle fill="var(--slide-badge)"/>` + `<path fill="#ffffff">` (check), **sem estrela**. `verified && <VerifiedBadge/>` (`slide.tsx:135`) → on/off sem buraco. Confirmado nos 4 PNGs: círculo azul com check branco ao lado do nome.
- [x] **Imagem: escala por 920, radius 28 + borda 2px, corpo 46; sem imagem corpo 52; line-height ×1.52; `\n\n` com gap de parágrafo** — CUMPRIDO. `slide.tsx:56-57` `bodySize = hasImage ? 46 : 52`. Imagem `width:920, borderRadius: IMG_RADIUS+IMG_BORDER (30 externo / 28 interno na `<img>`), border 2px token` (`slide.tsx:172-195`). `lineHeight: BODY_LINE_MULT (1.52)` (`slide.tsx:161`); split por `/\n{2,}/` em `<p>` com `marginBottom = size*0.65` (`slide.tsx:58,61-64,158`). Testes `slide.test.tsx:53-68` cobrem 52/46 e a separação em parágrafos. PNG com imagem conferido: cantos arredondados + borda visível.
- [x] **Sem barra de engajamento / logo do X / emojis** — CUMPRIDO. Nenhum markup de engajamento no componente. Teste `slide.test.tsx:104-108` assere ausência de curtidas/retweets/views. `slide.test.tsx:36-51` garante **exatamente 1 svg** com `verified=true` (só o selo) e **0 svg** com `verified=false` — nenhum passarinho. Conferido a olho nos 4 PNGs.
- [x] **Props cobrem todos os campos (nome, handle, avatar, selo, texto, imagem opcional, tema)** — CUMPRIDO. `types.ts:6-21` `SlideData` com os 7 campos; contrato documentado como herdado por S2/S4/S5. Teste de contrato exercita todos.

### Render para PNG (critério central)

- [x] **PNG com dados fixos = exatamente 1080×1350 (verificável)** — CUMPRIDO. `sharp` rodado por mim nos 4 fixtures: todos 1080×1350 (saída acima). Estratégia: nó em 1080×1350 CSS reais + `pixelRatio:1` (`export-png.ts:30-35`) — sem fator de escala. Teste `png-dimensions.test.ts` re-verifica os 4 e passa.
- [x] **PNG visualmente fiel ao modelo (cores, posições, fonte, arredondamentos), sem fallback indevido** — CUMPRIDO. Conferido por mim abrindo os 4 PNGs diretamente. Fonte é a Segoe UI real do Windows (corte característico das letras; gerada via Edge no Windows). `export-png.ts:26-28` aguarda `document.fonts.ready` antes de rasterizar. Cores/posições/radius batem. *Observação (não falha):* o texto dos fixtures foi escrito **sem acentuação** ("nao", "informacao") — isso vem dos dados de entrada (`fixtures.ts:32-36`), não do render; o componente é fiel ao input. Sem impacto no motor.
- [x] **PNG 1080×1350 fiel nos DOIS temas (claro e escuro, com PNG real)** — CUMPRIDO. `slide-light-*` e `slide-dark-*` gerados e conferidos (dimensão via sharp + fidelidade a olho). Ambos os temas corretos.
- [x] **Rota/página de teste dispara export e obtém PNG (base do preview S2)** — CUMPRIDO. `src/app/render-test/page.tsx`: 4 cenários lado a lado, botão "Exportar PNG" por cenário, nó de captura em 1080×1350 fora da viewport (`left:-99999`), preview reduzido por `transform:scale` separado do nó capturado. Estados idle/loading/success/error implementados (`page.tsx:22,29-44,71-91`).

---

## Edge cases

| Edge case | Tratado? | Testado? | Evidência |
|---|---|---|---|
| **Slide sem imagem** (layout "sem imagem", corpo 52, PNG 1080×1350) | Sim | Sim | `slide.tsx:56-57,96`; PNG `slide-light-noimage`/`slide-dark-noimage` conferidos = 1080×1350; teste 52px `slide.test.tsx:53-57`. |
| **Selo desligado** (sem buraco/offset) | Sim | Sim | `slide.tsx:135` render condicional (não reserva espaço); teste `slide.test.tsx:45-51` confirma 0 svg. |
| **Texto longo** (fora da S1 — usar texto fixo que cabe) | Sim (por escopo) | N/A | Fixtures usam texto que comprovadamente cabe; auto-fit é fatia futura (decisão do gate). Todos os PNGs couberam sem overflow visível. |
| **Asset que não carrega → falha visível, não PNG corrompido** | Sim (código) | **Não (sem teste automatizado)** | `export-png.ts` propaga erro do `toPng`; `render-test/page.tsx:39-43` captura e exibe mensagem no estado "error". Caminho existe, mas nenhum teste força a falha. 🟢 — ver achados. |
| **Export antes das fontes carregarem → sem fallback** | Sim | Indireto | `export-png.ts:26-28` `await document.fonts.ready`; `generate-fixtures.mjs:25-27` também aguarda. PNGs saíram com Segoe UI real (não fallback) — evidência de que funcionou. |

---

## Segurança (baseline + auditoria ativa)

Percorridos os vetores OWASP comuns contra a superfície real da fatia (100% client-side, sem API/DB/auth/segredo):

- **Segredos:** nenhum. Grep por `api_key|secret|token|password|private key|sk-ant|Bearer` em `src/` → só matches de constantes de design (`CANVAS_*`, "token" em comentários). `.gitignore` cobre `.env` e `.env.*` (com exceção de `.env.example`). 🟢
- **Injeção / XSS:** nenhum `dangerouslySetInnerHTML`, `eval`, `new Function` ou `innerHTML` em `src/` (grep vazio). Sem input de usuário nesta fatia — dados são fixos no código. Sem borda externa → Zod corretamente ausente (spec §Decisões). 🟢
- **CORS / canvas tainted:** avatar e imagem são data-URL SVG same-origin (`fixtures.ts:7-30`), selo é SVG inline — não "tingem" o canvas. Risco de CORS externo é de S2/S3, fora daqui. 🟢
- **Authz / IDOR / SSRF:** não aplicável — sem rotas de servidor, sem recursos por usuário, sem URL controlada por usuário buscada no servidor.

**Nenhum achado de segurança nesta fatia.** A superfície de ataque é mínima e coerente com o escopo.

---

## Escopo

**Faltou (vs. spec) — não bloqueia:**
- 🟡 **`noUncheckedIndexedAccess:true` ausente do `tsconfig.json`.** A spec (§Arquivos a tocar, linha 305) pediu explicitamente essa flag junto de `strict`. `strict:true` está; a flag extra não. Impacto: menos rigor em acesso a índice/array (ex.: `arr[i]` não vira `T | undefined`). Não afeta os critérios de aceite da S1, mas é dívida de rigor de tipos que convém fechar antes de S2 (haverá arrays de slides). Recomendação: ligar e rodar type-check.
- 🟢 **Assets `public/test/*.png` da spec substituídos por data-URL SVG inline** (`fixtures.ts`). Divergência consciente e melhor: same-origin garantido, zero request, sem CORS. Não é falha — registro para o handoff (a spec citava arquivos em `public/`, a entrega usou data-URL; efeito equivalente ou superior).
- 🟢 **Fonte:** stack `'Segoe UI','Selawik',system-ui,...` em vez de embarcar woff2 via `next/font/local` (spec §5). Divergência consciente documentada — ver Riscos.

**Entregou além do pedido?** Não em excesso. `scripts/generate-fixtures.mjs` e `layout.ts` (fallback B) são infra de apoio prevista/útil, não escopo inflado. `layout.ts` está pronto mas não usado no caminho principal (documentado como fallback) — aceitável.

**"Fora de escopo" virou furo?** Não. Auto-fit, persistência, IA, export em lote, deploy — todos ausentes como esperado.

---

## Riscos do research / spec

| Risco | Status | Evidência |
|---|---|---|
| **Fonte fallback no canvas quebra fidelidade** | **Mitigado nesta sessão, DE PÉ para deploy Linux** | Os PNGs foram gerados no Windows/Edge com Segoe UI real → fidelidade máxima local (conferido). Mas a app **não embarca woff2** (spec §5 previa Selawik via `next/font/local`); depende da Segoe UI do SO. Em deploy Vercel/Linux, cairá para `system-ui`/`Selawik` **se não instalada** → a fidelidade tipográfica NÃO está garantida fora do Windows. Follow-up conhecido. 🟡 |
| **Divergência do −20 / centralização (opção A flex)** | Tratado | Opção A (flex + translateY −20) bateu o modelo nos 4 PNGs; não precisou do fallback B. `layout.ts` fica pronto se um caso futuro divergir. |
| **Teste de dimensão sem browser real** | Tratado | Resolvido pela opção A do gate: fixture PNG real (caminho de export de verdade) + `sharp`. Roda de fato, não é inspeção. |
| **`html-to-image` + fonte como `@font-face` aplicado** | Tratado (para o cenário Windows) | PNGs saíram com a fonte certa. Reavaliar quando embarcar woff2. |

---

## Follow-ups conhecidos (fora do escopo S1, para as próximas fatias)

1. 🟡 **Embarcar woff2 (Selawik) via `next/font/local`** antes de qualquer deploy — hoje a fidelidade tipográfica só é garantida no Windows onde os PNGs foram gerados. Sem isso, o PNG em produção (Vercel/Linux) pode sair com fonte diferente. Este é o follow-up mais importante.
2. 🟡 **Ligar `noUncheckedIndexedAccess:true`** no tsconfig (fechar a divergência da spec) — de preferência antes de S2, que introduz arrays de slides.
3. 🟢 **Reativar ESLint no build** (`next.config.mjs` hoje com `ignoreDuringBuilds:true`) numa fatia de tooling.
4. 🟢 **Teste automatizado do caminho de erro** (asset ausente → falha visível): hoje o código trata, mas não há teste que force a falha.
5. 🟢 **Acentuação dos textos** de exemplo (dado de fixture, não código) — usar acentos corretos quando forem dados reais em S2+.
6. Auto-fit de texto por overflow — já previsto como fatia futura.

---

## Veredito

**Recomendação: APROVAR** (com ressalvas não-bloqueantes registradas).

Justificativa (1 linha): todos os critérios de aceite da story estão CUMPRIDOS com evidência — build/type-check/testes verdes rodados por mim, os 4 PNGs medidos em 1080×1350 exatos por `sharp` e conferidos visualmente batendo o modelo Octavio — sem nenhum achado 🔴; as divergências (woff2 para deploy, `noUncheckedIndexedAccess`, ESLint no build) são follow-ups conscientes fora do escopo da S1.

**Achados por severidade:** 🔴 nenhum · 🟡 2 (woff2 para deploy; `noUncheckedIndexedAccess` ausente) · 🟢 4 (ESLint no build, teste do caminho de erro, acentuação de fixture, assets data-URL vs public).

> **GATE humano:** este veredito é recomendação, não decisão final. O CEO decide se aprova a fatia como está (com os follow-ups agendados) ou se exige fechar algum 🟡 antes de marcar a S1 como concluída.
