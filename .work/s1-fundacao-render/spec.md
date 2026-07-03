# Spec — S1: Fundação + Motor de render (componente do slide → PNG 1080×1350)

> Contrato técnico do *como*. Backend e Frontend implementam a partir daqui sem improvisar.
> **Não** é código de produção — é o desenho. Cada decisão liga a um critério de aceite da `story.md`.
> Ponto de GATE: aprovação humana obrigatória antes de qualquer código.

---

## Resumo da abordagem

App Next.js 15 (App Router, TS strict) com Tailwind + shadcn/ui. O componente `<Slide>` é
um **Server Component puro de markup** que porta 1:1 os tokens de `docs/REFERENCIA-VISUAL.md`,
renderizado num nó de **1080×1350 px reais** (dimensões físicas, não escaladas). O export é
um utilitário **client-side** que captura esse nó com `html-to-image` usando `pixelRatio: 1`
— como o nó já é 1080×1350, o PNG sai exato sem depender de fator de escala. Segoe UI é
**embarcada via `next/font/local` (woff2)** para não cair em fallback no canvas; o export
espera `document.fonts.ready` antes de disparar. Tudo roda no browser (zero função pesada —
respeita Vercel Hobby / `docs/RESTRICOES.md`).

**Por quê essa estratégia:** renderizar no tamanho físico final elimina a maior fonte de erro
da fatia (DPR/escala errada → PNG fora de 1080×1350 ou borrado, o critério central da S1). O
nó vive fora da viewport (visualmente reduzido só para preview), então a captura é 1:1 e
determinística. Sem banco, sem auth, sem API — S1 é fundação + render.

---

## Contrato de API/backend

**Não há API nesta fatia.** S1 é 100% client-side: sem endpoints, sem rotas de servidor, sem
banco, sem auth (tudo isso é S3+, ver `story.md` › Fora de escopo).

O "contrato" que importa aqui é o **contrato de props do componente `<Slide>`** (abaixo em
UI/frontend) — esse é o shape herdado por S2 (editor), S4 (export em lote) e S5 (saída da IA).
Desenhado com cuidado para não gerar retrabalho.

---

## Mudanças de dados

**Nenhuma.** Sem tabela, sem migration, sem RLS nesta fatia (greenfield, dados fixos
hardcoded). Banco e persistência entram em S3.

**Segurança na S1** (baseline aplicável ao escopo real desta fatia):
- **Sem segredos:** S1 não usa nenhuma credencial (sem Claude API, sem DB, sem Blob). Nada de
  `.env` com valor sensível é necessário. Mesmo assim, o scaffold já cria `.gitignore` cobrindo
  `.env*`, `node_modules`, `.next` — para as fatias seguintes não vazarem token.
- **Assets same-origin:** avatar e imagem de teste são arquivos locais em `public/` (mesma
  origem) → evita canvas *tainted* por CORS (risco sinalizado no research §Riscos). CORS de
  origem externa/Blob é problema de S2/S3, fora daqui.
- **Sem input de usuário:** dados são fixos no código → nenhuma superfície de injeção/validação
  nesta fatia. Zod não é necessário na S1 (não há borda externa). Entra quando houver input (S2+).

---

## UI/frontend

### 1. Design tokens dos dois temas (slide)

Os tokens do slide são **fixos e imutáveis** (o produto, não a UI da plataforma). Modelados
como CSS custom properties escopadas ao componente do slide — **não** no tema global do Tailwind
(que é da UI da plataforma). Assim o slide claro/escuro é independente do dark mode da app.

Definidos em `src/components/slide/slide-tokens.css` (ou objeto TS tipado consumido por
`style`), com um seletor por tema:

```
/* valores EXATOS de docs/REFERENCIA-VISUAL.md — não alterar */
.slide[data-theme="light"] {
  --slide-bg:        #FFFFFF;
  --slide-text:      #14171A;
  --slide-handle:    #536471;
  --slide-badge:     #1D9BF0;
  --slide-img-border:#CFD9DE;
}
.slide[data-theme="dark"] {
  --slide-bg:        #000000;
  --slide-text:      #FFFFFF;
  --slide-handle:    #71767B;
  --slide-badge:     #1D9BF0;
  --slide-img-border:#2F3336;
}
```

Constantes numéricas do layout (px) ficam num módulo TS tipado `slide-tokens.ts` (fonte única,
reusada pelo componente e pelo cálculo de centralização):

| Constante            | Valor | Origem (REFERENCIA-VISUAL) |
|----------------------|-------|----------------------------|
| `CANVAS_W`           | 1080  | Canvas                     |
| `CANVAS_H`           | 1350  | Canvas                     |
| `MARGIN`             | 80    | margem horizontal          |
| `CONTENT_W`          | 920   | largura útil (1080−80×2)   |
| `VERT_PAD`           | 60    | padding vertical mínimo    |
| `AVATAR`             | 88    | avatar circular            |
| `NAME_GAP`           | 24    | avatar → nome (80+88+24=192)|
| `BADGE`              | 36    | selo, x = fim do nome + 8  |
| `HANDLE_OFFSET_Y`    | 52    | handle y = nome y + 52     |
| `HEADER_GAP`         | 40    | header → 1ª linha do corpo |
| `IMG_RADIUS`         | 28    | cantos da imagem           |
| `IMG_BORDER`         | 2     | borda da imagem            |
| `IMG_GAP`            | 44    | texto → imagem             |
| `NAME_SIZE`          | 42    | nome Bold                  |
| `HANDLE_SIZE`        | 36    | handle Regular             |
| `BODY_SIZE_NOIMG`    | 52    | corpo sem imagem           |
| `BODY_SIZE_IMG`      | 46    | corpo com imagem           |
| `BODY_LINE_MULT`     | 1.52  | line-height = size × 1.52  |
| `PARAGRAPH_MULT`     | 0.65  | gap de `\n\n` = size × 0.65|

### 2. Componente `<Slide>` — contrato de PROPS (herdado por S2/S4/S5)

**Caminho:** `src/components/slide/slide.tsx`
**Natureza:** Server Component puro de markup (sem estado, sem efeito, sem `"use client"`).
Recebe props, devolve o nó do slide em 1080×1350. Determinístico.

```ts
// src/components/slide/types.ts
export type SlideTheme = "light" | "dark";

export interface SlideData {
  name: string;              // nome exibido (Bold 42)
  handle: string;            // sem o "@"; o componente prefixa "@" na renderização
  avatarUrl: string;         // URL same-origin (public/) ou data-URL. Obrigatório em S1.
  verified: boolean;         // selo on/off — quando false, header não deixa buraco/offset
  body: string;              // texto do corpo; "\n\n" separa blocos de ideia
  imageUrl?: string;         // imagem opcional do slide (same-origin/data-URL)
  theme: SlideTheme;         // claro | escuro
}

export interface SlideProps {
  data: SlideData;
  // fontSize NÃO é prop em S1: derivado de imageUrl (52 sem / 46 com).
  // Auto-fit por overflow está FORA da S1 (decisão do gate da story).
}
```

**Regras de renderização (ligadas aos critérios de aceite):**
- Nó raiz `<div class="slide" data-theme={theme}>` com `width:1080px; height:1350px` fixos,
  `background: var(--slide-bg)`, `color: var(--slide-text)`, `overflow:hidden`,
  `position:relative`. → AC "canvas 1080×1350".
- `body-size` = `imageUrl ? 46 : 52`. → AC corpo com/sem imagem.
- Handle renderizado como `@{handle}` com cor `var(--slide-handle)`. → AC cores por tema.
- `verified === false` → selo simplesmente não é renderizado (não ocupa espaço). → AC selo off.
- Corpo: `white-space: pre-wrap`? **Não** — split manual por `\n\n` em blocos `<p>`, cada bloco
  com `line-height: calc(size * 1.52)` e `margin-bottom: calc(size * 0.65)` entre blocos.
  Quebra por largura é natural (largura 920, alinhado à esquerda). → AC line-height e gap `\n\n`.
- **Proibições invioláveis** (não renderizar nunca): barra de engajamento, logo/passarinho do X,
  emojis no corpo. → AC regras invioláveis. (Selo é a única marca visual do X permitida.)

### 3. Selo verificado (SVG inline)

Componente `src/components/slide/verified-badge.tsx` — **SVG inline** (não imagem externa, para
o canvas capturar sem CORS): círculo preenchido `#1D9BF0` (`fill="var(--slide-badge)"`) com
**check branco** por cima. 36×36 px. Nunca estrela. → AC selo.

O check é um `<path>` branco simples (traço de "verified"). Não precisa replicar a geometria
scalloped do selo oficial do X — basta círculo azul sólido + check branco, fiel à regra
"círculo azul com check branco" de `CLAUDE.md` e REFERENCIA-VISUAL §Header.

### 4. Algoritmo de centralização vertical (reproduzir os números do Python)

O Python centraliza por **cálculo explícito de offsets** (top absoluto), não por flexbox. Para
o resultado bater exatamente com o PNG aprovado, **reproduzimos o mesmo cálculo** e aplicamos
via posicionamento absoluto — não confiamos no `justify-content:center` do flex (que arredonda
diferente e não replica o `−20` do caso sem imagem).

Função pura tipada em `src/components/slide/layout.ts`:

```ts
// Reproduz REFERENCIA-VISUAL §"Algoritmo de centralização vertical".
// altura do texto e da imagem são medidas/estimadas antes (ver nota abaixo).
export function computeVerticalLayout(input: {
  textHeight: number;      // altura renderizada do bloco de corpo (px)
  imageHeight: number | null; // altura da imagem já escalada p/ 920, ou null
}): { headerTop: number; bodyTop: number } {
  const HEADER = 88, HEADER_GAP = 40, IMG_GAP = 44, VERT_PAD = 60, CANVAS_H = 1350;
  let headerTop: number;
  if (input.imageHeight !== null) {
    const totalH = HEADER + HEADER_GAP + input.textHeight + IMG_GAP + input.imageHeight;
    headerTop = Math.max(VERT_PAD, (CANVAS_H - totalH) / 2);
  } else {
    const totalH = HEADER + HEADER_GAP + input.textHeight;
    headerTop = Math.max(VERT_PAD, (CANVAS_H - totalH) / 2 - 20); // −20 do caso sem imagem
  }
  const bodyTop = headerTop + HEADER + HEADER_GAP;
  return { headerTop, bodyTop };
}
```

**Nota sobre medição de altura** — [DECISÃO, não clarificação]: `textHeight` e `imageHeight`
dependem do render do browser (fonte, quebra de linha), que só existe em runtime. Duas
abordagens, escolhida a **(A)** por simplicidade (YAGNI):

- **(A) Escolhida — flex column centrado + o slide já tem margem suficiente.** Como em S1 os
  dados são **fixos e comprovadamente cabem** (decisão do gate: sem auto-fit), envolvemos
  header+corpo(+imagem) num container flex `justify-content:center` com `padding: 60px 0` (VERT_PAD),
  e aplicamos o ajuste `−20` do caso sem imagem via `margin-top:-20px` no container quando não há
  imagem. Visualmente idêntico ao cálculo do Python para conteúdo que cabe, sem precisar medir
  altura em JS. **Trade-off:** para textos que estouram (fora da S1) divergiria — aceitável
  porque overflow é fatia futura. Se, na validação, algum dos 4 PNGs divergir visivelmente do
  modelo, cair para (B).
- **(B) Fallback — medir em runtime.** Client Component que mede `textHeight`/`imageHeight` via
  `getBoundingClientRect` e aplica `computeVerticalLayout` com `position:absolute`. Mais fiel,
  mais complexo. `layout.ts` acima já fica pronto caso precise. Só ativar se (A) falhar na
  validação visual.

→ AC "bloco header+texto(+imagem) centralizado na vertical com/sem imagem".

### 5. Fonte Segoe UI na web

**Decisão: embarcar a família Segoe UI como woff2 via `next/font/local`.** É o ponto crítico
de fidelidade — sem a fonte carregada, o canvas usa fallback e o PNG quebra (research §Riscos).

- **Mecanismo:** `next/font/local` em `src/lib/fonts.ts`, apontando para arquivos woff2 locais
  em `src/assets/fonts/`. `next/font` gera `@font-face` com `font-display: block` e expõe uma
  CSS variable (`--font-slide`) aplicada no `<Slide>`. Isso garante que a fonte seja um asset
  same-origin do próprio bundle (sem CORS no canvas).
- **Pesos necessários:** Regular (400) e Bold (700) — cobre nome (Bold), handle/corpo (Regular).
- **`document.fonts.ready`:** o utilitário de export **aguarda `await document.fonts.ready`**
  antes de capturar → nenhum PNG sai com fallback (AC "sem fonte fallback indevida").

**[PRECISA CLARIFICAR — licenciamento do arquivo woff2 de Segoe UI]:** Segoe UI é fonte
proprietária da Microsoft, licenciada para uso no Windows — **redistribuir o woff2 num bundle
web pode violar a licença**. Preciso da decisão do CEO entre:
  1. **Fornecer o(s) woff2 de Segoe UI** que o Octavio tenha licença de uso (o Python original
     usa o arquivo local do Windows). O CTO embarca em `src/assets/fonts/`.
  2. **Usar equivalente web fiel e livre** — melhor par métrico de Segoe UI é **"Selawik"**
     (fonte da Microsoft, **licença OFL/MIT, redistribuível**, desenhada como métrica-compatível
     com Segoe UI) ou, alternativamente, a stack de fallback do sistema. Recomendação do CTO:
     **Selawik** se não houver licença redistribuível de Segoe UI — fidelidade métrica alta e
     legalmente seguro para deploy na Vercel.

O resto da spec independe dessa escolha (o mecanismo `next/font/local` é o mesmo para qualquer
woff2). **Bloqueia só a fidelidade tipográfica final, não a estrutura.** Preciso do "ok" no gate.

### 6. Utilitário de export DOM→PNG (client-side)

**Caminho:** `src/lib/export-png.ts` — módulo com `"use client"` na fronteira (usa
`window`/`document`/canvas; SSR não pode, research §SSR vs client).

- **Biblioteca:** `html-to-image` (função `toPng`). Escolhida sobre `html2canvas` (motor CSS
  próprio, pior fidelidade de fonte/arredondamento) e sobre `satori` (subconjunto de CSS, exige
  reescrever o componente com limitações). `html-to-image` usa `foreignObject` → captura o CSS
  real do browser = "o que vê é o que exporta", alinhado com o preview da S2. `satori`/server
  fica **declarado como fallback** (ADR 0001) para S4, não implementado aqui.
- **Estratégia de DPR/dimensão (bate 1080×1350 EXATO):** o nó do `<Slide>` é renderizado em
  **1080×1350 px CSS reais** (não escalado). Export com **`pixelRatio: 1`** + `width:1080`,
  `height:1350` explícitos em `toPng`. Como nó CSS = tamanho físico e pixelRatio = 1, o PNG sai
  **1080×1350 exatos**, sem multiplicação de escala (elimina o risco de erro de DPR — o critério
  central). O nó vive fora da viewport visível (ver rota de teste); o preview mostra uma **cópia
  visualmente reduzida via `transform: scale(...)`** que NÃO é o nó capturado.
- **Assinatura:**
  ```ts
  export async function exportSlideToPng(node: HTMLElement, fileName: string): Promise<Blob> {
    await document.fonts.ready;            // fontes prontas antes de capturar
    const dataUrl = await toPng(node, {
      width: 1080, height: 1350, pixelRatio: 1,
      cacheBust: true,                     // evita asset stale
    });
    // converte dataUrl → Blob (para download e para o teste ler dimensões)
    // dispara download via <a download> OU retorna o Blob para quem chamou
  }
  ```
- **CORS:** todos os assets (avatar, imagem, fonte) são same-origin em S1 → sem canvas tainted.
- **Falha visível:** se um asset não carregar, o export **não** deve produzir PNG corrompido
  silenciosamente — capturar erro do `toPng` e mostrar mensagem (AC edge case "asset ausente →
  falha visível"). Estado de erro na rota de teste (ver abaixo).

### 7. Rota/página de teste (base do preview da S2)

**Caminho:** `src/app/render-test/page.tsx` (Client Component — precisa do `ref` do nó e do
handler de click).

Renderiza os **4 cenários fixos** do gate lado a lado e permite exportar cada um:
1. claro / sem imagem  2. claro / com imagem  3. escuro / sem imagem  4. escuro / com imagem.

**Estados da UI (por cenário):**
- **Idle/pronto:** preview reduzido (scale) do `<Slide>` + botão "Exportar PNG".
- **Exportando (loading):** botão em estado loading (spinner, disabled) enquanto `toPng` roda.
- **Sucesso:** PNG baixado; opcional: mostrar "PNG gerado (1080×1350)" como confirmação.
- **Erro:** se `exportSlideToPng` lançar (asset/fonte), exibir alerta visível com a mensagem —
  nunca falhar em silêncio.
- **Vazio:** não se aplica (dados sempre fixos e presentes em S1).

Cada cenário tem: (a) o **nó de captura** em 1080×1350 reais posicionado fora da viewport
(`position:absolute; left:-99999px` ou container com `overflow` e `transform`), e (b) o
**preview visível** reduzido. O botão captura o nó (a), não o preview.

**UI da plataforma** (esta página é software, não slide): shadcn/ui `Button` + `Card`, layout
minimalista, espaçamento generoso, tokens de tema da app (dark mode da plataforma via shadcn) —
conforme "Diretriz de UI da plataforma". Sem hardcode de cor solto. Não confundir com os tokens
fixos do slide.

**Home (`src/app/page.tsx`):** página mínima com título e link para `/render-test` (satisfaz
AC "serve ao menos uma rota acessível").

---

## Arquivos a tocar

Todos **CRIAR** (greenfield). Caminhos assumem raiz do repo (`carrossel-studio/`).

**Scaffold / config**
- CRIAR `package.json` — deps e scripts (`dev`, `build`, `type-check`, `test`, `lint`).
- CRIAR `next.config.ts` — config Next 15.
- CRIAR `tsconfig.json` — **TS strict** (`strict:true`, `noUncheckedIndexedAccess:true`), paths `@/*`.
- CRIAR `tailwind.config.ts` + `postcss.config.mjs` — Tailwind para a UI da plataforma.
- CRIAR `components.json` — config do shadcn/ui.
- CRIAR `.gitignore` — `node_modules`, `.next`, `.env*`, saídas de teste.
- CRIAR `.eslintrc`/`eslint.config.mjs` — lint (config Next).
- CRIAR `src/app/globals.css` — Tailwind base + tema da plataforma (shadcn tokens).

**App / UI**
- CRIAR `src/app/layout.tsx` — root layout; aplica fonte da plataforma; monta `<html>`.
- CRIAR `src/app/page.tsx` — home mínima com link para a rota de teste.
- CRIAR `src/app/render-test/page.tsx` — página de teste dos 4 cenários + export.

**Componente do slide (motor de render — herdado por S2/S4/S5)**
- CRIAR `src/components/slide/types.ts` — `SlideData`, `SlideProps`, `SlideTheme` (contrato).
- CRIAR `src/components/slide/slide.tsx` — componente do slide (markup fiel aos tokens).
- CRIAR `src/components/slide/verified-badge.tsx` — SVG inline do selo.
- CRIAR `src/components/slide/slide-tokens.ts` — constantes numéricas (px) tipadas.
- CRIAR `src/components/slide/slide-tokens.css` — CSS custom properties por tema (claro/escuro).
- CRIAR `src/components/slide/layout.ts` — `computeVerticalLayout` (fallback (B), pronto).

**Export + fontes**
- CRIAR `src/lib/export-png.ts` — `exportSlideToPng` (client, `html-to-image`).
- CRIAR `src/lib/fonts.ts` — `next/font/local` (Segoe UI ou Selawik, conforme gate).
- CRIAR `src/assets/fonts/*.woff2` — arquivos de fonte (conteúdo depende do gate §5).

**Assets de teste (same-origin)**
- CRIAR `public/test/avatar.png` — avatar fixo dos cenários.
- CRIAR `public/test/slide-image.png` — imagem fixa dos cenários "com imagem".

**shadcn/ui**
- CRIAR (via `npx shadcn add`) `src/components/ui/button.tsx`, `card.tsx` — componentes usados
  na rota de teste.

**Testes**
- CRIAR `vitest.config.ts` — config do Vitest.
- CRIAR `tests/png-dimensions.test.ts` — verificação dimensional real do PNG (ver plano).
- CRIAR `tests/slide.test.tsx` — testes de contrato/render do `<Slide>` (jsdom).

---

## Versões (fixadas — confirmar no `npm install`)

| Pacote | Versão alvo | Papel |
|---|---|---|
| `next` | `15.x` (App Router) | framework |
| `react` / `react-dom` | `19.x` (par do Next 15) | UI |
| `typescript` | `5.x` (strict) | linguagem |
| `tailwindcss` | `3.4.x` | estilos da plataforma |
| `shadcn` (CLI) + Radix | atual | componentes UI |
| `html-to-image` | `1.11.x` | DOM→PNG |
| `vitest` | `2.x` | test runner |
| `sharp` | `0.33.x` (devDep) | ler dimensões do PNG no teste |
| `@testing-library/react` + `jsdom` | atual | teste de componente |

> Versões exatas confirmadas no lockfile após install. `html-to-image` 1.11.x confirma suporte
> a `pixelRatio`/`width`/`height`/`cacheBust` usados aqui.

---

## Plano de teste

Ferramenta: **Vitest** (unit + integração leve). Escolhido sobre Playwright porque a verificação
central é **dimensional e de contrato**, não fluxo de navegador — Vitest é mais leve/rápido e não
exige subir browser headless na esteira. (Playwright/E2E fica para fatias com fluxo de UI real.)

**A verificação dimensional roda de fato** (não é inspeção visual): o teste gera/lê um PNG e
confere `width×height` com `sharp`.

| # | Teste | Cobre qual critério | Como |
|---|---|---|---|
| 1 | **Dimensão do PNG = 1080×1350** nos 4 cenários | AC central "PNG exatamente 1080×1350" (todos os temas × com/sem imagem) | Renderizar `<Slide>` num nó 1080×1350, exportar via `exportSlideToPng`, ler o Blob/arquivo com `sharp` e `expect(width).toBe(1080); expect(height).toBe(1350)`. Rodar para os 4 conjuntos de dados fixos. |
| 2 | **Contrato de props** do `<Slide>` | AC "aceita props de todos os campos" + selo on/off + corpo com/sem imagem | `@testing-library/react` + jsdom: renderizar com `verified:true/false` (selo presente/ausente sem offset), com/sem `imageUrl` (body-size 46 vs 52), tema claro/escuro (classe/data-theme correto), handle prefixado com `@`. |
| 3 | **Regras invioláveis** ausentes | AC "sem barra de engajamento / logo do X / emojis" | Render em jsdom: garantir que o markup não contém elementos de engajamento nem passarinho; snapshot do DOM do corpo. |
| 4 | **Cores por tema** | AC cores claro/escuro | Assert das CSS custom properties resolvidas por `data-theme` (bg/text/handle/border batem os hex de REFERENCIA-VISUAL). |
| 5 | **type-check + build** | AC "type-check e build sem erros" | `tsc --noEmit` e `next build` na esteira (não é teste unitário, mas gate objetivo de verificação). |

**Verificação visual dos 4 PNGs (gate de validação humano — estágio 07):** exportar os 4 PNGs
reais na rota `/render-test` e comparar a olho com o modelo Octavio (mesmas cores, posições,
fonte, arredondamentos). Fidelidade fina (fonte real vs fallback) é confirmada aqui — os testes
automáticos garantem dimensão e contrato; o olho humano confirma fidelidade. Os 4 cenários são
exatamente os do gate da story: {claro, escuro} × {com imagem, sem imagem}.

**Como o teste de dimensão obtém o PNG** — [DECISÃO]: `html-to-image` depende de DOM/canvas do
browser, que jsdom não implementa fielmente. Duas opções para o teste #1 rodar de verdade:
- **(A) Preferida — teste de dimensão via componente renderizado em jsdom + `sharp` sobre um PNG
  produzido no browser real da rota de teste, salvo em `tests/fixtures/`.** Simples, mas exige
  gerar o fixture uma vez.
- **(B) Robusta — teste #1 roda em ambiente com canvas real.** Se a validação exigir geração
  automática do PNG (não fixture manual), usar Playwright **apenas** para o teste #1: abrir
  `/render-test`, clicar exportar, interceptar o Blob e medir com `sharp`. Mantém Vitest para o
  resto. **Decisão:** começar por (A); subir para (B) só se o gate exigir geração 100% automática
  da dimensão sem passo manual. [Confirmar preferência no gate — ver clarificação abaixo.]

---

## Decisões e trade-offs

- **Nó em 1080×1350 real + `pixelRatio:1`** — em vez de nó menor × pixelRatio (ex.: 432×540 ×2.5).
  Descartada a versão escalada porque multiplicar escala é a maior fonte de PNG borrado/fora de
  medida e complica fidelidade de fonte. Trade-off: o nó de captura é grande (fora da viewport);
  o preview usa `transform:scale` separado. Ganho: PNG 1:1 determinístico — critério central.
- **`html-to-image` sobre `html2canvas`/`satori`** — foreignObject captura o CSS real do browser
  = preview S2 e export idênticos. `html2canvas` reimplementa CSS (pior fonte/radius); `satori`
  força subconjunto de CSS e reescrita do componente. `satori`/server declarado como fallback S4.
- **Segoe UI via `next/font/local`** — asset same-origin, sem CORS no canvas, `@font-face`
  automático. Descartado CDN/`<link>` externo (CORS + rede no export). **Pendente licença** (§5).
- **Centralização por flex + ajuste −20 (opção A)** sobre medir altura em JS (opção B) — YAGNI:
  dados fixos cabem, não preciso medir. `layout.ts` fica pronto como fallback se a validação
  visual divergir.
- **Tokens do slide em CSS vars escopadas, não no tema Tailwind global** — separa o produto
  (slide, imutável) da UI da plataforma (Tailwind/shadcn, estilizável). Evita o dark mode da app
  contaminar o tema do slide.
- **Vitest, não Playwright, como runner base** — verificação é dimensional/contrato, não fluxo
  de browser. Playwright só entra pontualmente se o teste de dimensão precisar de canvas real (B).
- **Sem Zod/validação/API/DB na S1** — não há borda externa nem input; adicionar seria
  over-engineering (gate de simplicidade). Entra em S2/S3 quando houver input e persistência.

---

## Riscos para implementação

- **Fonte fallback no canvas** (alto impacto) — mitigado por `next/font/local` (same-origin) +
  `await document.fonts.ready` antes do `toPng`. **Depende da resolução do licenciamento (§5).**
  Se cair em Selawik, a fidelidade é métrica-compatível mas não idêntica pixel-a-pixel — o gate
  visual dirá se é aceitável.
- **Divergência do −20 / centralização** — a opção (A) por flex pode não bater exatamente o
  cálculo do Python em casos de borda. Baixo risco em S1 (dados fixos cabem). Fallback (B)
  pronto em `layout.ts`.
- **Teste de dimensão sem browser real** — jsdom não gera canvas fiel; mitigado pela decisão
  (A) fixture / (B) Playwright pontual (ver plano). Precisa do "ok" sobre grau de automação.
- **Versões Next 15 / React 19 / Tailwind / shadcn** — combinação recente; init do shadcn pode
  exigir passos específicos. Sem bloqueio de arquitetura, só de setup. Confirmar no install.
- **`html-to-image` + fontes embutidas** — em alguns casos a lib precisa das fontes como
  `@font-face` já aplicado no documento (não só carregado). `next/font` aplica no `<html>`, o
  que cobre isso; validar no primeiro PNG real que a fonte aparece (não fallback).

---

## GATE humano — pendências que preciso resolver antes do código

1. **[BLOQUEIA fidelidade tipográfica, não estrutura] Licença da fonte (§5):** embarcar woff2 de
   **Segoe UI** (CEO fornece arquivo licenciado) **ou** usar **Selawik** (livre, métrica-compatível)?
   Recomendação CTO: Selawik se não houver licença redistribuível de Segoe UI.
2. **[não bloqueia, confirmar preferência] Grau de automação do teste de dimensão:** fixture
   gerado uma vez + `sharp` (opção A, mais simples) **ou** Playwright pontual gerando o PNG
   automático (opção B, sem passo manual)? Recomendação CTO: começar por (A).

Tudo o mais está fechado e implementável sem perguntar. Aguardo aprovação da abordagem e das
2 decisões acima antes de qualquer código.
