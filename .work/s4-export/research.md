# Research — S4 Export do Carrossel Studio

## Pedido (como recebido)
1. Gerar PNG de TODOS os slides do carrossel, cada um exatamente 1080×1350.
2. Baixar como ZIP e permitir baixar um slide individual.
3. Garantir nitidez (devicePixelRatio) e nomeação ordenada dos arquivos.

Contexto: Next.js 15 (App Router) + TS strict. S1 entregou motor de render + export único; S2 o editor; S3 persistência/auth/Blob. Export multi-slide + ZIP ainda não existe.

## Arquivos relevantes

- `src/lib/export-png.ts:24-39` — `renderSlideToPng(node)`: aguarda `document.fonts.ready`, chama `toPng(node, { width: 1080, height: 1350, pixelRatio: 1, cacheBust: true })`, converte data-URL → Blob e devolve `{ blob, dataUrl, width, height }`. **É o único ponto de captura hoje.** Reusável direto para N slides (basta chamar N vezes).
- `src/lib/export-png.ts:45-52` — `exportSlideToPng(node, fileName)`: renderiza + dispara download único. Base para "baixar 1 slide individual".
- `src/lib/export-png.ts:55-58` — `dataUrlToBlob`: `fetch(dataUrl).then(r => r.blob())`. Já produz o `Blob` que o ZIP precisará.
- `src/lib/export-png.ts:61-68` — `triggerDownload(dataUrl, fileName)`: cria `<a download>` temporário. Para ZIP será preciso versão que aceite `Blob` via `URL.createObjectURL` (data-URL de ZIP grande é ruim).
- `src/components/slide/slide.tsx:53-200` — `<Slide data={SlideData}>`: markup puro 1080×1350, determinístico. É o "motor de render" reusado por preview e export. Renderiza `<img src={avatarUrl}>` (linha 103) e `<img src={imageUrl}>` (linha 185) **sem `crossOrigin`** — ponto crítico do tainted canvas.
- `src/components/slide/slide-tokens.ts:5-6` — `CANVAS_W = 1080`, `CANVAS_H = 1350`. Fonte única das dimensões.
- `src/lib/editor-state.ts:24-51` — `EditorSlide { id, body, imageUrl? }` e `EditorState { identity, theme, slides[], selectedSlideId, carouselId?, title? }`. A **ordem do array `slides`** é a ordem do carrossel (reordenável por `MOVE_SLIDE`) → base da nomeação ordenada.
- `src/lib/editor-state.ts:285-299` — `toSlideData(identity, slide, theme)`: monta o `SlideData` para o `<Slide>`. É o adaptador que o export multi-slide usará para cada slide.
- `src/app/editor/editor-client.tsx:42-211` — dono do `useReducer(editorReducer, initialState)`. Tem o `state.slides` completo em memória e o header com botão Salvar (`editor-client.tsx:146-168`). **É aqui que plugam o botão "Exportar" / "Baixar ZIP"** (ao lado de Salvar). Só renderiza UM `<Slide>` (via `ThemePreview`, o selecionado) — não há nós dos outros slides no DOM.
- `src/app/editor/theme-preview.tsx:80-98` — renderiza o `<Slide>` do slide **selecionado**, escalado por CSS transform (nó real segue 1080×1350). O preview escalado NÃO serve de nó de captura (ver render-test para o padrão correto).
- `src/app/render-test/page.tsx:93-112` — **padrão de captura de referência**: nó em 1080×1350 REAIS posicionado fora da viewport (`position:absolute; left:-99999`), com `ref` próprio, capturado por `exportSlideToPng`. Para S4 será preciso reproduzir isso para os N slides (renderizar todos os nós de captura off-screen, ou renderizar/capturar sequencialmente).
- `src/app/render-test/page.tsx:29-44` — `handleExport`: já trata estados `loading/success/error` e mostra dimensão gerada. Padrão de UX de export a seguir.
- `src/lib/blob-upload.ts:19-38` — upload retorna `blob.url` (https, domínio `*.public.blob.vercel-storage.com`, **cross-origin**). É essa URL que entra em `imageUrl` do slide desde a S3 → causa raiz do tainted canvas.
- `src/app/api/blob/upload/route.ts:13,22-32` — handler do upload; aceita `image/png|jpeg|webp`, exige sessão. Não configura CORS de leitura (o Blob público é servido pelo CDN da Vercel).
- `src/lib/image-upload.ts:30-45` — `readFileAsDataUrl(file)`: converte File→data-URL via FileReader. Precedente do padrão data-URL same-origin. Útil de referência, mas o problema da S4 é o inverso (URL https remota → data-URL antes do canvas).
- `scripts/generate-fixtures.mjs:8-40` — gera os 4 PNGs de prova via Playwright (Edge) no caminho real de export. Provável ponto a estender para provar os N slides / ZIP.
- `tests/png-dimensions.test.ts:18-34` — mede com `sharp` que cada PNG é exatamente 1080×1350. É o teste-guardião do critério dimensional; a S4 deve manter/estender.

## Features similares
- **Export único já resolvido** — `render-test/page.tsx` + `export-png.ts`. O padrão inteiro (nó off-screen 1080×1350 → `toPng` pixelRatio 1 → download) é o que a S4 generaliza para N slides. **Reusar `renderSlideToPng`, não reescrever.**
- **Nó de captura off-screen** — `render-test/page.tsx:93-112`. Padrão a replicar no editor para capturar slides não-selecionados sem poluir a UI visível.
- **UX de export com estados loading/success/error + dimensão** — `render-test/page.tsx:24-91`. Modelo de feedback para o botão de export do editor.
- **Feedback de ação assíncrona no editor** — botão Salvar com union `SaveState` idle/saving/saved/error + `startTransition` + `aria-live` (`editor-client.tsx:25-29,100-183`). Padrão a seguir para o botão de export.

## O que já está quebrado
- **Tainted canvas NÃO tratado** — `slide.tsx:103,185`: os `<img>` de avatar e imagem usam `src` direto, sem `crossOrigin`. Desde a S3, `imageUrl` pode ser URL https do Vercel Blob (cross-origin). Ao exportar via `html-to-image`, isso **taint-a o canvas** e `toPng` lança `SecurityError`. Documentado como pendência herdada em `.work/s4-export/STATUS.md:14`, `docs/STATUS.md:64`, `.work/s3-.../story.md:43`, `docs/ROADMAP.md:50` — **ainda não implementado**. É o bloqueador nº 1 da S4.
- **`pixelRatio: 1` fixo** — `export-png.ts:33`. Hoje ignora `devicePixelRatio`. O nó é 1080×1350 CSS e sai 1080×1350 físico (critério "exato" cumprido), mas o pedido 3 fala em "nitidez (devicePixelRatio)". Ver §Riscos: aumentar pixelRatio quebra o "exatamente 1080×1350". Tensão de requisito a resolver na spec.
- **Editor só tem 1 `<Slide>` no DOM** — `theme-preview.tsx:95` renderiza apenas o selecionado. Não há nós dos outros slides para capturar → a S4 precisa criar esses nós (off-screen) a partir de `state.slides`.
- **`jszip` não está instalado** — ausente de `package.json:18-59`. Nenhum código referencia ZIP hoje (confirmado por busca).

## Riscos sinalizados
- 🔴 **Tainted canvas com imagem do Blob** — `slide.tsx:185` + `blob-upload.ts:33`. Imagem cross-origin sem `crossOrigin="anonymous"` quebra `toPng`. Impacto: export falha em QUALQUER carrossel que tenha imagem enviada pós-S3. Mitigações a decidir na spec: **(A)** pré-buscar cada `imageUrl` https (`fetch` → `blob()` → `FileReader`/`URL.createObjectURL` ou data-URL) e injetar no nó ANTES de `toPng` — abordagem já eleita nos docs herdados; depende do CDN do Blob responder com CORS permissivo ao `fetch` do browser `[PRECISA CLARIFICAR]`. **(B)** CORS liberado no Blob + `crossOrigin="anonymous"` nos `<img>`. `html-to-image` também tem `fetchRequestInit`/opção de embed — avaliar. Avatar default é data-URL SVG same-origin (`editor-state.ts:85`), só a imagem de slide e um avatar customizado (se vier do Blob) são o risco.
- 🟡 **devicePixelRatio × "exatamente 1080×1350"** — `export-png.ts:33`, `tests/png-dimensions.test.ts:29-32`. Se aumentar `pixelRatio` para "nitidez", o PNG vira 2160×2700 e o teste dimensional quebra. Como o nó já é 1080×1350 físicos, `pixelRatio:1` produz 1 px de canvas por 1 px CSS = nitidez máxima na resolução alvo. Decidir na spec: manter `pixelRatio:1` (dimensão exata, provavelmente o certo) e documentar por que "nitidez" já está satisfeita, OU redefinir o requisito. Não decidir aqui.
- 🟡 **Fontes por slide** — `export-png.ts:26-28` aguarda `document.fonts.ready` uma vez. Ao capturar N nós em sequência, garantir que as fontes já estão prontas (o `ready` global cobre; risco baixo). Sem Segoe UI no ambiente, cai em fallback e muda métricas (herança S1) — relevante só no deploy.
- 🟡 **Performance / memória com muitos slides** — capturar N nós 1080×1350 gera N canvases grandes + N data-URLs em memória no browser. Carrossel longo (10-20 slides) pode travar/estourar em máquina fraca. Capturar sequencialmente (não em paralelo) e liberar objectURLs mitiga.
- 🟡 **Slides sem conteúdo / carrossel vazio** — `editor-state.ts:190-191` permite 0 slides (`selectedSlideId: null`). Export precisa tratar "0 slides" (desabilitar/avisar) e slides com body vazio (exporta em branco? decidir na story/spec).
- 🟢 **Nomeação ordenada** — a ordem é `state.slides` (já reordenável). Zero-pad no índice (`slide-01.png`) para ordenação lexicográfica correta em >9 slides. Baixo risco, só convenção a fixar.
- 🟢 **ZIP no browser** — sem `jszip` hoje. Recomendação: **adicionar `jszip`** (padrão de mercado, client-side, gera Blob de ZIP; combina com `URL.createObjectURL` + `<a download>`). Alternativa server-side não recomendada (todo o pipeline de captura é client, e enviar N imagens ao server seria desperdício).

## Dependências afetadas
- **`package.json`** — adicionar `jszip` (+ `@types/jszip` se necessário; jszip já traz tipos). Nova dep de produção.
- **`src/lib/export-png.ts`** — provável novo `exportCarouselToZip(nodes[], names[])` e/ou `renderSlidesToPngs`. `triggerDownload` pode ganhar variante que aceita `Blob` (objectURL) para o ZIP. Mudança aditiva; export único atual não deve regredir.
- **`src/components/slide/slide.tsx:103,185`** — se a mitigação escolhida for `crossOrigin`, altera os `<img>` (afeta TODO uso do `<Slide>`: preview, render-test, export). Se a mitigação for pré-buscar e injetar data-URL, o `<Slide>` pode ficar intocado (recebe `imageUrl` já como data-URL só no fluxo de export). **Preferir a via que não toca o `<Slide>` compartilhado** para não arriscar o preview.
- **`src/app/editor/editor-client.tsx`** — novo botão + nós de captura off-screen + estado de export. Ponto de maior mudança de UI.
- **`tests/png-dimensions.test.ts` / `scripts/generate-fixtures.mjs`** — estender para provar N slides e o ZIP, mantendo o guardião de 1080×1350.
- **Vercel Blob (infra)** — se a mitigação depender de CORS de leitura, pode exigir config no lado do Blob/CDN `[PRECISA CLARIFICAR]`.

## Perguntas abertas
- [PRECISA CLARIFICAR: o CDN do Vercel Blob (`*.public.blob.vercel-storage.com`) responde a `fetch()` do browser com header CORS que permita ler o blob como bytes (para converter em data-URL sem taint)? Se sim, a mitigação (A) é direta; se não, precisa de `crossOrigin` + CORS configurado, o que pode exigir ação de infra.]
- [PRECISA CLARIFICAR: "nitidez (devicePixelRatio)" do pedido 3 conflita com "exatamente 1080×1350" do pedido 1. Confirmar com o CEO/spec: manter 1080×1350 exatos (pixelRatio 1) é o comportamento correto? Ou querem uma opção de export em 2× para alta resolução?]
- [PRECISA CLARIFICAR: onde plugar o gatilho de export — só no editor (`editor-client.tsx`), ou também em `/carousels` (lista) para exportar um carrossel salvo sem abrir o editor? A lista está em `src/app/carousels/`.]
- [PRECISA CLARIFICAR: convenção de nomeação exata dos arquivos dentro do ZIP e do próprio ZIP (ex.: `<titulo-slug>/slide-01.png` + `<titulo-slug>.zip`)? Decisão de produto, não respondida pelo código.]
- [PRECISA CLARIFICAR: slide com body vazio deve ser exportado (PNG em branco) ou pulado/bloqueado? O reducer permite body vazio.]
