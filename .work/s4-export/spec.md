# Spec — Export do carrossel (PNG por slide + ZIP)

## Resumo da abordagem
Generalizar o motor de export único (S1) para os N slides do carrossel aberto no
`/editor`, 100% client-side. O editor monta um container de captura **off-screen**
com um `<Slide>` por slide em 1080×1350 reais (padrão do `render-test`), captura
sequencialmente com `renderSlideToPng` já existente (`pixelRatio: 1`), empacota
os PNGs com **jszip** e dispara o download via objectURL. O tainted canvas do
Blob é resolvido **antes** da captura: cada `imageUrl`/`avatarUrl` cross-origin
(https) é pré-convertida em data-URL e injetada só no `SlideData` de captura —
o `<Slide>` compartilhado e o preview ficam intocados. Solução mais simples que
cumpre a story; proxy same-origin fica documentado como plano B (não implementado).

Não há backend novo: nenhuma rota, nenhum schema, nenhuma migration. O único
toque de servidor possível (proxy) é plano B condicional.

---

## Contrato de API/backend
**Nenhum endpoint novo.** Toda a S4 é client-side.

### Plano B condicional (NÃO implementar agora — YAGNI)
Só se a validação provar que o CDN do Blob (`*.public.blob.vercel-storage.com`)
**não** responde `fetch()` com CORS permissivo (sem header
`Access-Control-Allow-Origin`), o browser bloqueia a leitura dos bytes e a
conversão para data-URL falha. Nesse caso, e só nesse caso, cria-se:

- `GET /api/blob/proxy?url=<encoded-blob-url>` → Route Handler same-origin que
  faz `fetch` server-side do blob e retorna os bytes com `Content-Type` original.
  - **Autorização:** exige sessão (mesmo padrão de `api/blob/upload/route.ts`).
  - **Validação de entrada (seguranca-baseline — anti-SSRF):** aceitar `url`
    **somente** se o host casar `*.public.blob.vercel-storage.com` (allowlist por
    regex de host, não `startsWith` ingênuo). Qualquer outro host → `400` com
    envelope `{ "error": { "code": "INVALID_BLOB_URL", "message": "..." } }`.
    Falha fechado: URL não reconhecida é recusada, nunca repassada.
  - Status: `200` (bytes) · `400` (url inválida) · `401` (sem sessão) ·
    `502` (falha ao buscar no upstream). Nunca vaza detalhe do upstream ao cliente.
  - O cliente passaria a buscar `/api/blob/proxy?url=...` em vez da URL direta —
    same-origin, sem taint.

> Marca de decisão: este proxy **não entra na entrega** sem sinal verde da
> validação. Custo estimado se necessário: ~1 arquivo, ~40 linhas.

---

## Mudanças de dados
**Nenhuma.** Sem tabela, sem migration, sem RLS. O carrossel já é persistido pela
S3; a S4 só lê `state.slides` em memória no editor. Migration destrutiva? **Não.**

---

## Motor de export — `src/lib/export-png.ts` (EDITAR, aditivo)

O arquivo hoje exporta `renderSlideToPng`, `exportSlideToPng`, `ExportResult` e
tem `dataUrlToBlob`/`triggerDownload` privados. A S4 **adiciona** sem quebrar o
existente. `renderSlideToPng` (pixelRatio 1) é reusado como está.

### 1. `triggerBlobDownload(blob, fileName)` — download via objectURL
```ts
// Dispara download de um Blob arbitrario (ZIP, PNG) via URL.createObjectURL.
// Para ZIP grande, objectURL evita o custo de data-URL gigante em memoria.
// Revoga o objectURL apos o click (nao vazar).
function triggerBlobDownload(blob: Blob, fileName: string): void
```
- Cria `<a download>` com `href = URL.createObjectURL(blob)`, clica, remove o nó
  e chama `URL.revokeObjectURL` (via `setTimeout(…, 0)` ou no fim do handler).
- Uso interno; pode ser exportada para o slide individual reusar (ver abaixo).

### 2. `renderSlidesToPngs(nodes)` — captura N nós sequencialmente
```ts
// Captura uma lista ordenada de nos <Slide> (cada um 1080x1350 REAIS) em
// SEQUENCIA (nao paralelo: evita estourar memoria com N canvases grandes).
// Preserva a ordem de entrada = ordem do carrossel. Aguarda document.fonts.ready
// UMA vez (renderSlideToPng ja faz, mas o ready global cobre todos os nos).
async function renderSlidesToPngs(nodes: HTMLElement[]): Promise<ExportResult[]>
```
- Loop `for … of` com `await renderSlideToPng(node)` por nó (sequencial). Não usar
  `Promise.all` (paralelismo estoura memória — risco 🟡 do research).
- Se um nó falhar, o erro propaga (a UI trata: mostra erro, editor segue vivo).

### 3. `exportCarouselToZip(nodes, fileNames, zipName)` — ZIP de todos
```ts
// Captura todos os nos, monta um ZIP com um PNG por no (nome de fileNames[i]) e
// dispara o download do .zip com nome zipName. fileNames.length DEVE == nodes.length
// (contrato do chamador). Usa jszip; PNG entrado no zip a partir do Blob (binario).
async function exportCarouselToZip(
  nodes: HTMLElement[],
  fileNames: string[],   // ex.: ["slide-01.png", "slide-02.png", ...]
  zipName: string,       // ex.: "meu-carrossel.zip" | "carrossel.zip"
): Promise<void>
```
- `const results = await renderSlidesToPngs(nodes)`.
- `const zip = new JSZip();` → `results.forEach((r, i) => zip.file(fileNames[i], r.blob))`.
  PNGs na **raiz** do ZIP (sem pasta interna — decisão de simplicidade; a story
  pede os arquivos no ZIP, não uma subpasta).
- `const zipBlob = await zip.generateAsync({ type: "blob" })`.
- `triggerBlobDownload(zipBlob, zipName)`.
- Guarda: se `nodes.length === 0`, lança erro (o chamador já desabilita o botão;
  esta é a segunda linha de defesa — falha fechado).

### 4. Slide individual — reuso do existente
Baixar 1 slide usa `exportSlideToPng(node, "slide-NN.png")` que **já existe**.
Não precisa função nova. O editor só precisa do nó de captura do slide
selecionado e do nome zero-padded.

### 5. Nomeação — helpers puros (podem viver em `export-png.ts` ou `editor-state.ts`)
```ts
// Nome do PNG por posicao (1-based), zero-pad 2 digitos: 1 -> "slide-01.png".
function slidePngName(index0: number): string   // index0 = indice no array

// Slug do titulo para nome de ZIP. Minusculo, sem acento, [a-z0-9-], colapsa
// hifens, apara pontas. Se resultar vazio -> "" (chamador cai no fallback).
function slugifyTitle(title: string): string

// Nome final do ZIP: slug != "" ? `${slug}.zip` : "carrossel.zip".
function zipFileName(title: string | undefined): string
```
- `slidePngName`: `\`slide-${String(index0 + 1).padStart(2, "0")}.png\``.
- `slugifyTitle`: `title.normalize("NFD").replace(/[̀-ͯ]/g, "")` para
  tirar acentos, `.toLowerCase()`, `.replace(/[^a-z0-9]+/g, "-")`,
  `.replace(/^-+|-+$/g, "")`. Título só de símbolos/acento-vazio → `""` → fallback.

> Decisão de local: colocar os 3 helpers em `src/lib/export-png.ts` (coesão com o
> export) e exportá-los para o teste unitário cobrir sem browser.

---

## Estratégia de captura dos N nós off-screen (editor)

**Decisão: nós montados no React** (não geração ad-hoc via `createRoot` imperativo).
Motivo: o `<Slide>` é um componente React; montá-los declarativamente no
`editor-client.tsx` (como `render-test` faz) mantém consistência com o preview,
evita `react-dom/client` imperativo e deixa os `ref`s prontos. YAGNI: a alternativa
ad-hoc (renderizar/desmontar por slide sob demanda) é mais código e mais risco de
timing de fontes — descartada.

### Componente novo: `src/app/editor/export-capture.tsx` (CRIAR, client)
Renderiza, **fora da viewport**, um `<Slide>` por slide, cada um em 1080×1350
reais, e expõe os nós ao pai por `ref`.

```tsx
// Monta N nos de captura (1080x1350 REAIS) off-screen, um por slide, na ORDEM do
// array. NAO e visivel (aria-hidden, position absolute left:-99999). O pai captura
// esses nos via a ref (array de HTMLElement na ordem dos slides).
export interface ExportCaptureHandle {
  getNodes(): HTMLElement[];              // todos, na ordem do carrossel
  getNodeAt(index0: number): HTMLElement | null; // para o slide individual
}
interface ExportCaptureProps {
  identity: CarouselIdentity;
  theme: SlideTheme;
  slides: EditorSlide[];                  // state.slides (fonte da ordem)
}
// Implementado com forwardRef + useImperativeHandle; cada <Slide> num wrapper com
// ref guardado num array. data = toSlideDataForExport(identity, slide, theme)
// (ver mitigacao de imagem abaixo — usa as versoes data-URL das imagens).
```
- Estrutura DOM idêntica ao `render-test:93-112`: wrapper `position:absolute;
  left:-99999; top:0; width:1080; height:1350; pointerEvents:none; aria-hidden`,
  contendo os `<div ref>` de 1080×1350 com o `<Slide>` dentro.
- **Não** escala por transform (é o nó real de captura, precisa ser físico).

### Mitigação do tainted canvas (o bloqueador nº 1)

Regra dura da story/CEO: **sem tocar o `<Slide>` compartilhado**. A conversão
acontece na fronteira do export, produzindo `SlideData` de captura com imagens já
em data-URL.

#### Função: `toExportSafeUrl(url)` em `src/lib/export-png.ts` (CRIAR)
```ts
// Converte uma URL de imagem para uma forma SAFE de canvas (data-URL same-origin).
// - "" ou undefined -> retorna como veio (sem imagem).
// - ja e data-URL (avatar default SVG, imagem/avatar via FileReader) -> retorna igual.
// - http(s) same-origin -> retorna igual (nao taint-a).
// - http(s) CROSS-ORIGIN (Blob) -> fetch(url) -> res.blob() -> FileReader.readAsDataURL
//   -> data-URL. Se o fetch/leitura falhar (CORS/rede), LANCA erro legivel
//   (o export inteiro falha com mensagem; editor segue vivo — AC de erro).
async function toExportSafeUrl(url: string | undefined): Promise<string | undefined>
```
- Detecção de cross-origin: comparar `new URL(url, location.href).origin` com
  `location.origin`. Só busca quando difere e o protocolo é http(s).
- `fetch` **direto** primeiro (solução simples). Sem `crossOrigin`, sem proxy.
- Plano B (proxy) só entra se a validação reprovar o fetch direto (ver Contrato).

#### Adaptador de export: `toSlideDataForExport(identity, slide, theme)` (CRIAR)
Local sugerido: `src/lib/editor-state.ts` (junto de `toSlideData`, é seu par async)
ou `src/lib/export-png.ts`. Recomendo `export-png.ts` para não poluir o módulo puro
`editor-state` com `fetch`/DOM.
```ts
// Versao async de toSlideData que troca avatarUrl e imageUrl por formas
// canvas-safe (data-URL). Chamada UMA vez por slide ANTES de montar o
// <ExportCapture>. NAO altera toSlideData nem o <Slide>.
async function toSlideDataForExport(
  identity: CarouselIdentity, slide: EditorSlide, theme: SlideTheme,
): Promise<SlideData>
```
- Aplica `toExportSafeUrl` a `identity.avatarUrl` (default é data-URL SVG →
  passa direto; avatar custom via Blob → convertido) e a `slide.imageUrl`.
- O `editor-client` pré-processa **todos os slides** (`Promise.all` de
  `toSlideDataForExport` — aqui paralelo é ok, são fetches, não canvases) e passa
  os `SlideData` prontos ao `<ExportCapture>`. Assim os `<Slide>` off-screen já
  montam com data-URL e a captura sequencial não taint-a.

> Trade-off: o `<ExportCapture>` recebe `SlideData[]` já resolvido (não
> `identity/slides` crus), o que acopla a montagem à etapa async. Aceito: mantém a
> conversão fora do `<Slide>` e concentra o `fetch` no handler de export.

---

## UI/frontend — `src/app/editor/editor-client.tsx` (EDITAR)

### Estado de export (novo, ao lado de `saveState`)
Union discriminada seguindo o padrão do `SaveState`:
```ts
type ExportState =
  | { status: "idle" }
  | { status: "working"; kind: "zip" | "single" }
  | { status: "done"; kind: "zip" | "single" }
  | { status: "error"; message: string };
```

### Botões no header (ao lado de "Salvar")
Dois botões novos no mesmo `<div>` de ações do header:

1. **"Baixar ZIP"** (`variant="outline"`, ícone `Download`/`FileArchive` de lucide):
   - `disabled` quando `state.slides.length === 0` **ou** `isExporting` **ou** `isSaving`.
   - Label dinâmico: idle "Baixar ZIP" · working "Gerando ZIP…" · done "Baixado"
     (com `Check`, some após timeout curto) · volta a idle.
2. **"Baixar slide"** (`variant="outline"`, ícone `Image`/`Download`):
   - `disabled` quando `selectedSlide === null` (0 slides) **ou** `isExporting`.
   - Baixa o PNG do slide selecionado, nome `slidePngName(index do selecionado)`.

### Estados (carregando / vazio / erro / sucesso) e o que consomem
| Estado | Condição | UI | Consome |
|---|---|---|---|
| **Idle** | sem export recente | botões habilitados (se ≥1 slide) | `state.slides` |
| **Desabilitado (vazio)** | `slides.length === 0` | ambos botões `disabled` | `state.slides.length` |
| **Carregando** | export em voo | botão clicado mostra "Gerando…", ambos `disabled` | `exportState.kind` |
| **Sucesso** | ZIP/PNG baixado | "Baixado" + `Check`, região `aria-live` "Exportado." | — |
| **Erro** | fetch de imagem/geração falhou | msg legível em `role="alert"`, editor utilizável | `exportState.message` |

- Região `aria-live="polite"` de export (pode reusar/gêmea da de save) anuncia
  sucesso/erro. Mensagem de erro genérica ao usuário ("Falha ao exportar. Tente
  novamente."); detalhe técnico só no `console`/log (seguranca-baseline: não vazar).
- `isExporting = exportState.status === "working"`.

### Handlers (no `editor-client.tsx`)
```ts
async function handleExportZip() {
  // 1. guarda: slides.length === 0 -> erro e retorna.
  // 2. setExportState working/zip.
  // 3. resolve SlideData[] safe (Promise.all toSlideDataForExport).
  // 4. montar <ExportCapture> com os SlideData (via estado que dispara render) OU
  //    manter <ExportCapture> sempre montado e so ler os nos (ver nota abaixo).
  // 5. await nextPaint (garante nos no DOM) -> exportCarouselToZip(nodes, names, zipName).
  // 6. done -> reset apos timeout. catch -> error legivel.
}
async function handleExportSlide() { /* analogo, exportSlideToPng do no selecionado */ }
```

> **Nota de montagem (decisão):** manter `<ExportCapture>` **sempre montado** no
> editor (off-screen) com `slides={state.slides}` já resolvidos é simples porém
> re-monta a cada tecla e re-dispara `fetch` de imagem. Para evitar isso e o
> `fetch` a cada render, a montagem do `<ExportCapture>` é **sob demanda no clique**:
> o handler resolve os `SlideData` safe, guarda em estado (`captureData`), o
> `<ExportCapture>` só renderiza quando `captureData != null`, o handler aguarda o
> paint, lê os nós pela ref, captura, e ao fim limpa `captureData` (desmonta).
> Isso concentra o custo no export e não impacta a digitação. **Esta é a via
> escolhida** (mais simples em custo de runtime; YAGNI no "sempre montado").

---

## Dependência nova
- **`jszip`** (produção). Traz os próprios tipos TS (não precisa `@types/jszip`).
  Justificativa: padrão de mercado para ZIP client-side, gera `Blob`, casa com
  `triggerBlobDownload`. Alternativa server-side descartada (todo o pipeline de
  captura é client — enviar N PNGs ao servidor só para zipar é desperdício).
  `package.json` (EDITAR): adicionar a `dependencies`.

---

## Arquivos a tocar

**CRIAR**
- `src/app/editor/export-capture.tsx` — componente off-screen que monta N `<Slide>`
  1080×1350 e expõe os nós por ref (`ExportCaptureHandle`).

**EDITAR**
- `src/lib/export-png.ts` — adicionar `triggerBlobDownload`, `renderSlidesToPngs`,
  `exportCarouselToZip`, `toExportSafeUrl`, `toSlideDataForExport`, `slidePngName`,
  `slugifyTitle`, `zipFileName`. Não alterar `renderSlideToPng`/`exportSlideToPng`.
- `src/app/editor/editor-client.tsx` — `ExportState`, 2 botões no header,
  handlers `handleExportZip`/`handleExportSlide`, montagem sob demanda do
  `<ExportCapture>`, região `aria-live` de export.
- `package.json` — dependência `jszip`.
- `scripts/generate-fixtures.mjs` — estender para gerar um ZIP multi-slide de
  prova (ver Plano de teste).
- `tests/png-dimensions.test.ts` — estender para validar os PNGs multi-slide
  extraídos do ZIP (1080×1350 cada).

**CRIAR (teste)**
- `tests/export-naming.test.ts` — unit puro de `slidePngName`, `slugifyTitle`,
  `zipFileName` (sem browser).
- `tests/export-zip.test.ts` — abre o ZIP de prova (jszip/`unzipper`/`sharp`),
  valida contagem, nomes ordenados e dimensões (ver Plano de teste).

**NÃO tocar**
- `src/components/slide/slide.tsx`, `slide-tokens.ts`, `types.ts` — o `<Slide>`
  compartilhado permanece intocado (regra dura da story).
- `src/lib/editor-state.ts` `toSlideData`/reducer — inalterados (se
  `toSlideDataForExport` for para cá, é aditivo puro, sem mexer no existente).

---

## Plano de teste

| # | O quê | Nível | Como | Liga ao critério |
|---|---|---|---|---|
| 1 | Nomeação zero-pad ordenada | unit | `slidePngName(0)=="slide-01.png"`, `(9)=="slide-10.png"` | "nomeação `slide-NN.png`… zero-pad… mesma ordem" |
| 2 | Nome do ZIP por título | unit | `zipFileName("Meu Título!")=="meu-titulo.zip"`; `zipFileName(undefined)=="carrossel.zip"`; título só-acento/símbolo → `"carrossel.zip"` | "`<titulo-slug>.zip`… sem título → `carrossel.zip`" + edge título especial |
| 3 | Cada PNG multi-slide = 1080×1350 | integração (browser real) | estender `generate-fixtures.mjs`: montar carrossel de ≥3 slides no editor, clicar "Baixar ZIP", salvar o `.zip`; no teste, extrair PNGs e medir com `sharp` | "cada PNG mede exatamente 1080×1350"; guardião dimensional verde |
| 4 | ZIP contém exatamente N PNGs, nomes ordenados | integração | abrir o ZIP de prova, `entries.length === N`, nomes `slide-01…slide-0N.png` em ordem | "ZIP contendo exatamente N PNGs… mesma ordem" |
| 5 | Imagem do Blob renderiza sem tainted canvas | integração (browser real) | fixture com ≥1 slide usando imagem `*.public.blob.vercel-storage.com` (ou mock same-origin que simule cross-origin); export conclui sem `SecurityError` e o PNG tem a imagem (checar via pixel não-branco na região da imagem) | "export conclui sem `SecurityError`… imagem aparece" |
| 6 | 0 slides bloqueia export | unit/component | com `slides.length===0`, botões `disabled`; `exportCarouselToZip([],…)` lança | edge "0 slides → botões desabilitados" |
| 7 | Slide com body vazio exporta em branco | integração | fixture com um slide `body:""` no ZIP → PNG 1080×1350 gerado (não pulado) | edge "body vazio → exporta em branco" |
| 8 | Slide individual = PNG 1080×1350 do selecionado | integração | clicar "Baixar slide" com o 2º slide selecionado → `slide-02.png` 1080×1350 | AC "download de slide individual" |
| 9 | Falha de export mantém editor vivo | component | forçar `toExportSafeUrl` a rejeitar (mock) → `exportState.error`, sem crash, botões voltam a habilitados | AC "erro legível, editor utilizável" |

> Teste 5 é o que prova a mitigação; se o ambiente de teste não alcançar o CDN
> real do Blob, usar um servidor local que sirva a imagem com cabeçalho
> cross-origin controlado para exercitar o caminho `fetch → blob → data-URL`.

---

## Decisões e trade-offs
- **Nós de captura declarativos (React) sob demanda no clique** — vs sempre
  montados: sob demanda evita `fetch` de imagem e re-render a cada tecla; vs
  imperativo (`createRoot`): declarativo é menos código e reusa o padrão do
  `render-test`. Custo: um passo de "aguardar paint" antes de ler os nós.
- **Conversão de imagem fora do `<Slide>`** (`toExportSafeUrl` + `toSlideDataForExport`)
  — vs `crossOrigin="anonymous"` no `<img>`: a via escolhida não toca o componente
  compartilhado (regra da story), não arrisca o preview, e não depende de CORS
  configurado no Blob para o *preview*. Só o *fetch de export* depende de CORS.
- **`fetch` direto primeiro, proxy como plano B documentado** — YAGNI: não
  construir o proxy antes de a validação provar que o CDN bloqueia. Se bloquear,
  o plano B está desenhado e é barato.
- **`pixelRatio: 1` mantido** — a story/CEO chancelaram 1080×1350 exatos; o nó já é
  físico, nitidez máxima na resolução-alvo. Nada a mudar em `renderSlideToPng`.
- **Captura sequencial** (não `Promise.all`) — evita N canvases 1080×1350
  simultâneos estourarem memória em carrossel longo. Trade-off: export mais lento,
  aceitável (a story admite "ainda que mais lento").
- **PNGs na raiz do ZIP** (sem subpasta) — a story pede "N arquivos PNG no ZIP",
  não uma subpasta nomeada. Mais simples; muda trivialmente se o CEO quiser pasta.
- **jszip** — dep madura e client-side; server-side descartado por desperdício.

---

## Riscos para implementação
- 🔴 **CORS do CDN do Blob** (pergunta aberta herdada) — se `fetch` direto ao
  `*.public.blob.vercel-storage.com` não retornar `Access-Control-Allow-Origin`,
  a conversão falha e o export com imagem quebra. **Ponto de validação obrigatório**
  (teste 5). Mitigação pronta: proxy same-origin `/api/blob/proxy` (plano B).
  Não bloqueia o resto da S4 (carrosséis sem imagem exportam de qualquer forma).
- 🟡 **Timing de montagem/paint** — ler os nós da ref antes do React pintar o
  `<ExportCapture>` daria nós vazios. Mitigar aguardando um frame
  (`requestAnimationFrame` duplo ou `await` de microtask após `setState`) antes de
  capturar. Definir na implementação; testar com carrossel de vários slides.
- 🟡 **Fontes no ambiente de export** — `document.fonts.ready` cobre, mas sem
  Segoe UI cai em fallback (herança S1); só afeta fidelidade visual no deploy,
  não a dimensão.
- 🟡 **Memória em carrossel longo (10–20 slides)** — captura sequencial +
  revogar objectURLs mitiga; validar que 20 slides não travam o browser alvo.
- 🟢 **Revogar objectURL** — `triggerBlobDownload` deve revogar após o download;
  esquecer vaza memória em exports repetidos.

---

## GATE humano
Pare aqui. A spec está pronta para Backend/Frontend implementarem sem adivinhar,
**exceto** por um risco que só a execução confirma: o CORS do CDN do Blob (🔴).
A recomendação é aprovar a spec e implementar o caminho simples (fetch direto);
se o teste 5 reprovar por CORS, ativar o plano B (proxy) já desenhado — sem
retrabalho de arquitetura. Nenhuma mudança de dados, nenhuma migration, nenhum
endpoint novo no caminho feliz.
