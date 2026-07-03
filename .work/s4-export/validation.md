# Validação — Export do carrossel (S4)

Auditor independente. Não editei código de produção. Vereditos ancorados em
evidência (arquivo:linha, teste, saída rodada por mim).

## Testes/build (rodados por mim)

**`npm test` (vitest run)** — rodado por mim:
```
Test Files  12 passed (12)
     Tests  171 passed | 1 skipped (172)
```
`export-naming.test.ts` (19) · `export-zip.test.ts` (14) · `png-dimensions.test.ts`
(6, 1 skipped) — todos verdes. Baseline S1–S3 (137) intacto, sem regressão.

**`npm run type-check` (tsc --noEmit)** — rodado por mim: **limpo**, zero erro.

**`npm run build` (Next 15.5.19)** — rodado por mim: `✓ Compiled successfully`,
`✓ Generating static pages (6/6)`. Rota `/editor` = 35.6 kB (inclui jszip). Build
reporta **"Skipping linting"**; o projeto **não tem script `lint`** (`npm run lint`
→ "Missing script"). Sem gate de lint no repo — 🟢, não bloqueia, mas registro
que nenhum linter roda nesta esteira.

**`jszip`** — presente em `dependencies`, fixada `^3.10.1` (package.json:30). Traz
tipos próprios (type-check limpo confirma). Justificada na spec.

---

## Critérios de aceite

### Export de todos os slides (ZIP)

- [x] **N slides → ZIP com exatamente N PNGs** — CUMPRIDO. `export-png.ts:145-153`
  monta um `zip.file(name, blob)` por resultado; `export-zip.test.ts:113-127`
  prova 3 nós → 3 entradas. Handler pareia `nodes`↔`fileNames` por posição
  (`editor-client.tsx:205-206`).

- [~] **Cada PNG mede exatamente 1080×1350** — CUMPRIDO POR CONTRATO, NÃO PROVADO
  EM BROWSER. O motor usa `pixelRatio: 1` e captura o nó físico 1080×1350
  (`export-png.ts:38-41`, `CANVAS_W/H` em `export-capture.tsx:64-65,78`). O
  guardião **multi-slide** (`png-dimensions.test.ts:56-77`) está **SKIPPED**: só
  roda com `tests/fixtures/carousel-multi.zip`, que exige browser+dev server+sessão
  para gerar — ambiente headless não produz. Os 4 fixtures **single-slide** reais
  medem 1080×1350 com `sharp` e passam (`png-dimensions.test.ts:21-37`), o que prova
  o motor na dimensão-alvo. **Falta apenas o smoke manual multi-slide** (ver
  Pendência A). O tester não inventou fixture sintético — decisão correta.

- [x] **Nomeação `slide-NN.png` zero-pad, mesma ordem (inclusive após reordenar)**
  — CUMPRIDO. `slidePngName` (`export-png.ts:265-267`) faz
  `padStart(2,"0")`; `export-naming.test.ts:13-38` cobre 0→01, 8→09, 9→10, 19→20
  e ordenação lexicográfica de 12 nomes. `export-zip.test.ts:156-171` prova ordem
  preservada em 5 slides reordenados. Handler recalcula por posição do array
  (`editor-client.tsx:205`), então reordenar no editor reflete no ZIP.

- [x] **ZIP `<titulo-slug>.zip` / sem título → `carrossel.zip`** — CUMPRIDO.
  `zipFileName` (`export-png.ts:286-289`) + `slugifyTitle` (274-281);
  `export-naming.test.ts:76-99` cobre título comum, acento, undefined, vazio,
  só-símbolos, só-espaços → todos no fallback correto. Handler chama
  `zipFileName(state.title)` (`editor-client.tsx:206`).

- [~] **Imagem cross-origin do Blob sem SecurityError/tainted + imagem aparece** —
  MITIGAÇÃO CORRETA E COBERTA NA FRONTEIRA LÓGICA; PROVA DE PIXEL PENDENTE DE
  BROWSER. `toExportSafeUrl` (`export-png.ts:173-213`) detecta cross-origin via
  `parsed.origin !== location.origin` (190) e faz `fetch → blob → FileReader
  data-URL` (199-204) **antes** do canvas; `toSlideDataForExport` (237-257)
  injeta as data-URLs só no `SlideData` de captura, sem tocar o `<Slide>`.
  `export-zip.test.ts:226-247` prova o caminho fetch→data-URL para uma URL
  `*.public.blob.vercel-storage.com`. **O que NÃO está provado:** que o pixel da
  imagem aparece no PNG real e que o CDN do Blob responde `fetch()` com CORS
  permissivo (risco 🔴 herdado). Isso só cai em browser real com rede — ver
  Pendência B. Se o CORS reprovar, o plano B (proxy `/api/blob/proxy`) está
  desenhado na spec e não foi implementado (correto por YAGNI).

### Download de slide individual

- [x] **PNG 1080×1350 do slide selecionado, nome `slide-NN.png` pela posição** —
  CUMPRIDO. `handleExportSlide` (`editor-client.tsx:220-247`) acha o índice do
  selecionado (222), monta captura de 1 nó, lê `getNodeAt(0)` (236) e chama
  `exportSlideToPng(node, slidePngName(index))` (240) — nome pela **posição no
  carrossel**, não pela seleção. Dimensão herda o mesmo motor `pixelRatio:1`
  (mesma ressalva de browser do critério dimensional; single-slide real já mede
  1080×1350).

### Feedback e estados

- [~] **Loading/sucesso/erro com `aria-live`** — IMPLEMENTADO, COBERTO SÓ NA
  LÓGICA. `ExportState` union (`editor-client.tsx:43-47`); botões mostram
  "Gerando ZIP…"/"Gerando…"/"Baixado"+`Check` (287-325); região
  `aria-live="polite"` "Exportado." e `role="alert"` de erro (359-370). A
  **lógica** de erro→mensagem está testada (`export-zip.test.ts:249-275`); o
  **render** dos estados no editor é component/E2E, não coberto por teste
  automatizado nesta rodada (declarado no 06). Inspeção do código confere o
  padrão do Salvar.

- [x] **Erro → mensagem legível + editor utilizável** — CUMPRIDO. `catch` em
  ambos handlers loga detalhe só no console e chama `failExport`
  (`editor-client.tsx:172-175,209-213,243-246`), que desmonta a captura
  (`setCaptureData(null)`) e mostra `EXPORT_ERROR_MESSAGE` genérica (50) — não
  vaza detalhe técnico (seguranca-baseline OK). Estado volta habilitável (sem
  `working`), editor segue vivo. `toExportSafeUrl` transforma falha de
  fetch/CORS em Error legível (`export-png.ts:205-212`), provado em
  `export-zip.test.ts:249-275`.

### Nitidez / dimensão

- [x] **`pixelRatio: 1`, sem 2×, guardião verde** — CUMPRIDO. `renderSlideToPng`
  usa `pixelRatio: 1` (`export-png.ts:40`), reusado por `renderSlidesToPngs`
  (117). Nenhum export em 2×. Guardião single-slide verde (medido por mim).
  Guardião multi-slide skipped (Pendência A) — não é regressão, é fixture ausente.

---

## Edge cases

- **0 slides bloqueia export** — CUMPRIDO. Botão ZIP `disabled` com
  `slides.length === 0` (`editor-client.tsx:292`); "Baixar slide" `disabled` com
  `selectedSlide === null` (313). 2ª linha: `exportCarouselToZip` lança com 0 nós
  (`export-png.ts:135-137`), provado em `export-zip.test.ts:175-181` (e nada é
  baixado). Falha fechado. ✅

- **Body vazio exporta em branco (não pula)** — CUMPRIDO POR DESIGN, não
  automatizado. O export não ramifica por `body` — captura o nó determinístico do
  `<Slide>` como qualquer outro. Não há lógica pura a testar; prova é dimensional,
  vem junto do fixture multi-slide (Pendência A). Coerente.

- **Imagem do Blob indisponível / fetch falha → erro legível, sem loop infinito**
  — CUMPRIDO. `toExportSafeUrl` lança em `!ok` e em rejeição
  (`export-png.ts:200-212`); handler cai no `catch`→`failExport` sem ficar em
  `working`. Provado em `export-zip.test.ts:249-275`. ✅

- **Carrossel longo (10–20 slides) sequencial** — CUMPRIDO no código.
  `renderSlidesToPngs` usa `for…of` com `await` por nó, comentário explícito "Nao
  usar Promise.all" (`export-png.ts:114-120`). Não há teste de carga de 20 slides
  (exige browser); a estratégia anti-OOM está no código. Validar consumo real é
  smoke manual (Pendência A cobre junto).

- **Avatar/imagem default (data-URL SVG same-origin) não taint-a** — CUMPRIDO.
  `toExportSafeUrl` retorna data-URL inalterada (`export-png.ts:178`) e same-origin
  inalterada (191-194). Provado em `export-zip.test.ts:203-224`. ✅

- **Título com especiais/acentos → slug seguro; vazio → fallback** — CUMPRIDO,
  ver critério do nome do ZIP. `export-naming.test.ts:41-99`. ✅

---

## Segurança (percorrida)

- **Segredos** — nenhum no diff. Sem token/chave. ✅
- **Não vaza detalhe técnico** — erro ao usuário é genérico
  (`EXPORT_ERROR_MESSAGE`, `editor-client.tsx:50`); stack só no `console.error`
  (211,244). Segue seguranca-baseline. ✅
- **SSRF / input vira requisição** — 🟡 CONDICIONAL. `toExportSafeUrl` faz `fetch`
  **direto de qualquer URL cross-origin http(s)** (`export-png.ts:189-199`), não só
  do host `*.public.blob.vercel-storage.com`. Na S4 a URL vem do `state`/banco
  (não é input livre do atacante no momento do export), então o risco é baixo hoje.
  **Mas:** se um `imageUrl` malicioso persistir no carrossel, o browser do operador
  buscaria essa URL no export. A spec previa allowlist de host **só para o proxy
  plano B** (spec:31-34); o caminho direto atual não a aplica. Recomendo, quando/se
  o proxy entrar, ou mesmo antes, restringir o `fetch` de conversão ao host do Blob
  (allowlist por regex de host). Não bloqueia a entrega (dado é de origem
  confiável hoje), mas fica como endurecimento.
- **Sem backend novo** — nenhum endpoint, schema ou migration (confirmado: só
  `export-png.ts`, `export-capture.tsx`, `editor-client.tsx`, testes, package.json).
  Superfície de ataque servidor = zero adicional. ✅

---

## Escopo

- **`<Slide>` compartilhado intocado** — CONFIRMADO. `git diff`/status não mostram
  alteração em `src/components/slide/` como parte da mudança S4; a mitigação vive
  toda na fronteira do export (`toExportSafeUrl`/`toSlideDataForExport`/
  `export-capture.tsx`), que recebe `SlideData` já resolvido
  (`export-capture.tsx:23-26,80`). Regra dura da story respeitada. Preview não
  regride (nenhum caminho de preview foi tocado). ✅
- **Sem extra fora de escopo** — proxy `/api/blob/proxy` **não** foi implementado
  (correto, é plano B). Sem export 2×, sem JPG/PDF, sem export da lista
  `/carousels`. Gatilho só no `/editor`. Nada além do pedido. ✅
- **Sem falta dentro do escopo** — todos os ACs têm implementação; as duas lacunas
  (dimensão multi-slide e pixel do Blob) são de **prova em browser**, não de
  código faltando.

---

## Riscos do research

- 🔴 **CORS do CDN do Blob** — DE PÉ (não resolvido, por natureza). Só o `fetch`
  real ao `*.public.blob.vercel-storage.com` confirma se o CDN responde com
  `Access-Control-Allow-Origin`. Código assume que sim (fetch direto); se não,
  export com imagem de Blob quebra e cai no `catch` com erro legível (não trava),
  e o plano B (proxy) precisará ser ativado. **Ponto de smoke obrigatório**
  (Pendência B).
- 🟡 **Timing de paint** — MITIGADO. `waitForPaint` faz duplo `requestAnimationFrame`
  antes de ler os refs (`editor-client.tsx:52-58,199,235`); handler ainda valida
  `nodes.length === slides.length` e lança se faltar nó (202-204). Não provado em
  browser, mas a mitigação prevista na spec está no código.
- 🟡 **Memória em carrossel longo** — MITIGADO por captura sequencial + revogação
  de objectURL (`export-png.ts:96`). Validar 20 slides = smoke manual.
- 🟢 **Revogar objectURL** — FEITO (`export-png.ts:96`, `setTimeout(…revoke, 0)`).

---

## Pendências de prova em browser (não são furos de código — são o que só o navegador prova)

- **A — Guardião dimensional multi-slide.** Rodar
  `GEN_MULTI=1 EDITOR_URL=<editor-com-2+-slides-inclua-1-vazio> npm run gen:fixtures`
  num ambiente com dev server + sessão S3, depois `npm test`. O teste
  `png-dimensions.test.ts:56-77` mede cada PNG do ZIP real em 1080×1350 e cobre de
  uma vez: dimensão multi-slide, body vazio exportado, e carrossel longo.
- **B — Pixel do Blob + CORS.** Com um slide usando imagem real do Vercel Blob,
  clicar "Baixar ZIP" no browser e confirmar: (1) sem `SecurityError` no console,
  (2) a imagem aparece no PNG. Isso resolve o risco 🔴 herdado. Se falhar por CORS,
  ativar o plano B (proxy) da spec.

---

## Veredito

**APROVAR COM RESSALVA → segue para GATE humano** (não devolver estágio).

Justificativa em uma linha: build/type-check/171 testes verdes rodados por mim, todo
AC implementado com evidência e o `<Slide>` intocado; as duas únicas lacunas
(dimensão multi-slide e pixel/CORS do Blob) são **provas que só o navegador com
rede pode dar** — o tester as sinalizou honestamente e deixou o caminho pronto
(Pendências A e B). Nada a corrigir no código para aprovar o mérito.

Achados abertos (nenhum bloqueia, decisão é do humano):
- 🟡 `fetch` de conversão sem allowlist de host (endurecimento SSRF) — `export-png.ts:189-199`.
- 🟡 Pendências A e B são smoke de aceitação antes de considerar 100% provado em produção.
- 🟢 Repo sem script de lint na esteira.

> GATE humano: recomendo aprovar o código e condicionar o "pronto para cliente" à
> execução das Pendências A e B no ambiente com browser/rede. Se o CORS do Blob
> reprovar em B, o plano B (proxy) entra sem retrabalho de arquitetura.
