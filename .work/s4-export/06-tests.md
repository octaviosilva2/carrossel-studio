# Testes — Export do carrossel (S4)

Suíte: Vitest (jsdom) + sharp (medição PNG) + jszip (reabrir ZIP).
Arquivos novos: `tests/export-naming.test.ts`, `tests/export-zip.test.ts`.
Arquivos estendidos: `tests/png-dimensions.test.ts`, `scripts/generate-fixtures.mjs`.

## Critérios de aceite → testes

### Export de todos os slides (ZIP)
- [x] ZIP contém exatamente N PNGs, um por slide → `export-zip.ts:gera um ZIP com exatamente N PNGs, nomeados na ordem dada` — PASSOU
- [x] Nomeação `slide-01.png…` zero-pad 2 dígitos → `export-naming.ts:slidePngName` (5 testes: 0→01, 8→09, 9→10, 19→20, ordenável) — PASSOU
- [x] Mesma ordem do array (inclusive após reordenar) → `export-zip.ts:preserva a ordem apos reordenar` + `export-naming.ts:gera nomes lexicograficamente ordenaveis` — PASSOU
- [x] ZIP `<titulo-slug>.zip` / sem título → `carrossel.zip` → `export-naming.ts:zipFileName` (6 testes) — PASSOU
- [x] Cada PNG mede exatamente 1080×1350 (multi-slide) → `png-dimensions.ts:todo PNG extraido do carousel-multi.zip mede 1080x1350` — **SKIPPED** (fixture real de browser ausente neste ambiente; ver "Fora").
- [~] Imagem cross-origin do Blob renderiza sem tainted canvas → coberta na fronteira lógica por `export-zip.ts:cross-origin (Blob) e convertida via fetch -> data-URL` (prova a conversão fetch→data-URL que evita o taint). A prova de pixel renderizado exige browser real (ver "Fora").

### Download de slide individual
- [x] Nome `slide-NN.png` conforme posição → `export-naming.ts:slidePngName` (mesma lógica usada pelo handler `handleExportSlide`) — PASSOU
- [~] PNG 1080×1350 do slide selecionado → dimensão coberta pelos 4 fixtures single-slide reais (`png-dimensions.ts`, PASSOU); a seleção específica no editor é caminho de UI/E2E (ver "Fora").

### Feedback e estados
- [~] Loading/sucesso/erro com `aria-live`; erro legível e editor utilizável → testado na camada de lógica: `export-zip.ts:cross-origin com fetch !ok/rejeitado lanca erro legivel` (garante que a falha vira Error com mensagem, que o handler traduz para o estado de erro). O render dos estados no `editor-client.tsx` é component/E2E (ver "Fora").

### Nitidez / dimensão
- [x] `pixelRatio: 1`, sem 2× → o motor `renderSlideToPng` usa `pixelRatio: 1` e os fixtures reais medem 1080×1350 exatos → `png-dimensions.ts` (4 cenários) — PASSOU. Guardião permanece verde.

## Edge cases cobertos
- 0 slides bloqueia export (2ª linha de defesa) → `export-zip.ts:lanca quando nao ha nenhum no (0 slides)` — PASSOU
- Contagem de nomes ≠ nós → `export-zip.ts:lanca quando a contagem de nomes difere da de nos` — PASSOU
- Título com acentos/símbolos → slug seguro → `export-naming.ts:remove acentos`, `colapsa simbolos`, `apara pontas` — PASSOU
- Título só de símbolos/acento isolado → slug vazio → fallback `carrossel.zip` → `export-naming.ts:titulo apenas com simbolos`, `titulo apenas com acento`, `zipFileName titulo so de simbolos` — PASSOU
- Imagem do Blob indisponível / fetch falha → erro legível (não loop infinito) → `export-zip.ts:cross-origin com fetch !ok/rejeitado lanca erro legivel` — PASSOU
- Avatar/imagem default (data-URL SVG same-origin) não taint-a → `export-zip.ts:data-URL passa inalterada` + `same-origin passa inalterada` + `caminho relativo passa inalterado` — PASSOU
- PNGs na raiz do ZIP (sem subpasta) → `export-zip.ts:PNGs ficam na raiz do ZIP` — PASSOU
- Bytes reais de PNG dentro do ZIP (assinatura) → `export-zip.ts:cada entrada do ZIP contem bytes de um PNG valido` — PASSOU
- Slide com body vazio exporta em branco → **não coberto por teste automatizado** (exige render real; a lógica de export não ramifica por body vazio — ver "Fora").

## Resultado da rodada

Comando: `npm test` (`vitest run`)

```
Test Files  12 passed (12)
     Tests  171 passed | 1 skipped (172)
```

- Baseline pré-existente: **137 → intactos** (nenhuma regressão).
- Novos verdes: `export-naming` 19 + `export-zip` 14 = **33**.
- `png-dimensions`: 4 (single-slide) → 5 (adicionado marcador "pendente de fixture"), 1 skipped (guardião multi-slide condicional).
- Type-check (`tsc --noEmit`) dos arquivos novos/editados: **limpo**.

Sem falhas. Sem `stderr` de ruído (o click do `<a download>` foi silenciado no stub para não emitir "navigation not implemented" do jsdom).

## Notas de mock (fronteiras de browser, justificadas)
- `html-to-image.toPng`: mockado para devolver uma data-URL de PNG determinística. Objetivo dos testes de ZIP é provar **montagem/ordem/nomeação do ZIP e as guardas**, não a rasterização DOM→canvas (impossível em jsdom sem canvas real). O caminho real de produção (`renderSlideToPng`→`dataUrlToBlob`→`zip.file(blob)`→`generateAsync`) roda de verdade com Blobs reais.
- `URL.createObjectURL`/`revokeObjectURL`: ausentes no jsdom; adicionados só como captura do Blob do ZIP para reabri-lo e inspecionar. `triggerBlobDownload` (objectURL + click) é caminho de browser puro, fora do alcance unit (não testado o download em si, conforme instrução).
- `fetch`: stub por-teste — para a data-URL do PNG mockado (ZIP) e para a URL cross-origin do Blob (`toExportSafeUrl`). É a fronteira externa (rede) legítima para mock.

## O que ficou de fora e por quê

1. **Guardião dimensional MULTI-SLIDE real (ZIP `carousel-multi.zip`)** — SKIPPED.
   A geração exige o caminho real do browser: dev server no ar + sessão autenticada (S3) + carrossel persistido + clique "Baixar ZIP" (html-to-image em msedge). Este ambiente é **headless, sem dev server/DB/display** — não é viável gerar o ZIP real aqui. **Não inventei fixture sintético** (mascararia o critério 1080×1350). Em vez disso:
   - O teste multi-slide roda condicionalmente (`it.runIf`) quando `tests/fixtures/carousel-multi.zip` existir; enquanto ausente, fica visível como skip + um teste-marcador "pendente de fixture".
   - `scripts/generate-fixtures.mjs` foi estendido com um bloco `GEN_MULTI=1` + `EDITOR_URL` para o validador gerar o ZIP real no ambiente com browser/sessão.
   - **Sinal ao validador:** rodar `GEN_MULTI=1 EDITOR_URL=<editor-com-2+-slides> npm run gen:fixtures` num ambiente com dev server + login, depois `npm test` — o guardião multi-slide então mede cada PNG do ZIP em 1080×1350.

2. **Prova de pixel da imagem cross-origin renderizada nos PNGs** (AC "a imagem aparece"). A *lógica* de mitigação (fetch cross-origin → data-URL, sem taint) está coberta; a prova visual de que o pixel aparece no PNG exige captura real de canvas — mesmo ambiente de browser do item 1. Risco 🔴 herdado (CORS do CDN do Blob) só se confirma com o fetch real ao `*.public.blob.vercel-storage.com`; deve ser exercitado na validação com rede.

3. **Estados de UI (loading/done/erro, `aria-live`, botões `disabled` com 0 slides)** — component/E2E no `editor-client.tsx`, não unit. A lógica subjacente (export lança Error legível em falha; guarda de 0 slides lança) está coberta. O render dos estados é candidato a teste de componente (Testing Library) ou E2E — fora do escopo desta rodada unit/integração.

4. **Slide com `body` vazio exporta em branco** — o motor de export não ramifica por body vazio (é o `<Slide>` que renderiza determinístico), então não há lógica pura a testar; a prova é dimensional (PNG gerado, não pulado), coberta quando o fixture multi-slide real incluir um slide vazio. Sem browser aqui, não automatizado.

## Bugs encontrados no código de produção
Nenhum. Todas as falhas durante a escrita foram **do harness de teste** (stub de `URL` malformado quebrando `fetch`; incompatibilidade jsdom-Blob ↔ FileReader do jszip) e foram corrigidas nos testes — **nenhuma linha de produção foi alterada**. O contrato de `export-png.ts` (nomeação, guardas de ZIP, conversão cross-origin) comportou-se exatamente como especificado.
