# Research — S2: Editor manual de carrossel (estado local, sem banco)

> Estágio 01 do pipeline dev-agents. Read-only quanto ao código. Mapeia o terreno da S1
> para o editor da S2 reusar sem recriar. Cada citação foi lida — `arquivo:linha` reais.

## Pedido (como recebido)
Editor manual de carrossel, estado local, SEM banco:
1. Montar carrossel slide a slide, editando header (avatar, nome, handle, selo on/off),
   corpo de texto e imagem do slide — upload local com preview, SEM storage remoto.
2. Adicionar, remover e reordenar slides; navegar entre eles.
3. Preview ao vivo de cada slide REUSANDO o `<Slide>` da S1.
4. Alternar tema claro/escuro do carrossel.

---

## Contrato de dados existente (herdado — NÃO alterar sem reverberar em S1/S4/S5)

Fonte: `src/components/slide/types.ts:6-27`.

```ts
export type SlideTheme = "light" | "dark";

export interface SlideData {
  name: string;        // Bold 42
  handle: string;      // SEM "@"; o componente prefixa "@" na render (slide.tsx:146)
  avatarUrl: string;   // OBRIGATÓRIO. URL same-origin (public/) ou data-URL
  verified: boolean;   // selo on/off; quando false NÃO renderiza (sem buraco/offset)
  body: string;        // "\n\n" (2+ quebras) separa blocos de ideia
  imageUrl?: string;   // opcional; sua PRESENÇA define corpo 46 vs 52
  theme: SlideTheme;
}

export interface SlideProps { data: SlideData; }
// fontSize NÃO é prop: derivado de imageUrl. Auto-fit por overflow está FORA do escopo.
```

### Restrições e derivações que o `<Slide>` impõe (o editor deve respeitar)
- **`avatarUrl` é obrigatório e string não-nula** (`types.ts:11-12`). O `<Slide>` renderiza
  `<img src={avatarUrl}>` sempre (`slide.tsx:102-115`) — não há guarda para vazio. Avatar
  vazio → `<img src="">` (browser mostra ícone quebrado; no export via `html-to-image` pode
  gerar canvas incompleto). O editor precisa garantir avatar válido antes de exportar/preview.
- **`handle` é renderizado como `@{handle}`** (`slide.tsx:146`) — o input NÃO deve incluir "@".
- **`body` é fatiado por `/\n{2,}/`** e cada bloco vira um `<p>` (`slide.tsx:61-64,153`).
  Blocos vazios são filtrados (`.filter(p => p.length > 0)`). Body totalmente vazio → zero
  `<p>` renderizado (slide fica só com header) — edge case válido, não quebra.
- **`imageUrl` só entra no layout via `Boolean(imageUrl)`** (`slide.tsx:56`). String vazia
  `""` é falsy → tratada como "sem imagem" (corpo 52). Isso é conveniente: remover imagem =
  setar `imageUrl` para `undefined` ou `""`.
- **`fontSize` é derivado, não editável**: `hasImage ? 46 : 52` (`slide.tsx:57`). O editor
  NÃO expõe controle de tamanho de fonte (fora de escopo, alinhado ao contrato).
- **Layout vertical**: bloco header+corpo(+imagem) é centralizado por flex `justify-content:
  center` com `translateY(-20px)` só no caso sem imagem (`slide.tsx:84-97`). Textos que
  estouram 1350px divergem (auto-fit é fora de escopo desde a S1 — ver `story.md:79`).
- **Nó raiz é 1080×1350 px FÍSICOS** (`slide.tsx:72-73`, constantes `slide-tokens.ts:5-6`).
  Fidelidade do export depende do nó estar nesse tamanho real — o preview deve escalar por
  CSS transform SEM tocar o nó (ver seção "Preview ao vivo").
- **Cores por tema são inline via CSS custom properties** (`slide.tsx:31-46`), independentes
  do dark mode da plataforma (shadcn). Alternar tema do carrossel = trocar `data.theme`,
  nada a ver com o `.dark` do Tailwind.

### Tokens numéricos (px) — fonte única
`src/components/slide/slide-tokens.ts:5-36`. Imutáveis (são o produto). O editor não os toca;
só existe para saber que `SLIDE_FONT_STACK` (`slide-tokens.ts:35-36`) começa em `'Segoe UI'`.

---

## Motor de render da S1 (reusar como está)

- **`src/components/slide/slide.tsx:53`** — `Slide({ data }: SlideProps)`. Server Component
  puro de markup, sem estado/efeito, sem `"use client"`. Pode ser importado dentro de um
  Client Component (o editor) sem problema — é só markup.
- **`src/components/slide/verified-badge.tsx:6`** — `VerifiedBadge`, SVG inline (selo azul +
  check). Já consumido internamente pelo `<Slide>`; o editor não o usa direto.
- **`src/lib/export-png.ts`** — módulo `"use client"`:
  - `renderSlideToPng(node)` (`export-png.ts:24`) — aguarda `document.fonts.ready`
    (`export-png.ts:26-28`), chama `toPng(node, {width:1080,height:1350,pixelRatio:1,cacheBust:true})`
    (`export-png.ts:30-35`), devolve `{blob,dataUrl,width,height}`.
  - `exportSlideToPng(node, fileName)` (`export-png.ts:45`) — renderiza + dispara download.
  - **S2 NÃO precisa exportar** (export em lote é S4). Mas o preview e o futuro export
    compartilham a mesma restrição: o nó capturado tem de ser o de 1080×1350 reais.
- **`src/app/render-test/page.tsx`** — a rota de teste da S1 é o **protótipo direto do editor**:
  já demonstra o padrão de preview escalado + nó de captura fora da viewport (detalhado abaixo).

---

## Como reusar o `<Slide>` no preview ao vivo (padrão JÁ existente na S1)

`src/app/render-test/page.tsx` resolve exatamente o problema "preview reduzido sem perder
fidelidade de export". O editor deve copiar esse padrão:

1. **Preview visível reduzido** (`render-test/page.tsx:52-68`): um container com `overflow:
   hidden` de largura `PREVIEW_W`, contendo um `<div>` de 1080×1350 reais com
   `transform: scale(PREVIEW_W / 1080)` e `transformOrigin: "top left"`. O `<Slide>` vive
   DENTRO desse div escalado. O scale é só CSS visual — o markup interno continua nas
   dimensões físicas.
   - Constantes: `PREVIEW_W = 300`, `PREVIEW_SCALE = 300/1080` (`render-test/page.tsx:19-20`).
     No editor o preview será maior (ex.: 400-500px), mas a fórmula é a mesma.
2. **Nó de captura em 1080×1350 reais, fora da viewport** (`render-test/page.tsx:93-112`):
   `position:absolute; left:-99999px`, com `ref` no div de captura. Este é o nó que o export
   consome — nunca o preview escalado.

**Implicação para a S2:** o preview ao vivo é trivial de montar — `<Slide data={slideAtual}/>`
dentro do wrapper escalado, re-renderiza sozinho a cada mudança de estado (React). Como
`<Slide>` é determinístico e sem efeito, não há sincronização manual. **Escalar via
`transform: scale()` é a única forma correta** — mudar `width`/`height` do nó ou usar `zoom`
quebraria o export (que depende do tamanho físico). O padrão da S1 já está validado (4 PNGs
reais + 15 testes verdes).

> Nota: S2 não precisa do nó-de-captura-fora-da-viewport (isso é para export, S4). Para S2
> basta o preview escalado. Mas vale herdar o padrão inteiro se a story pedir "exportar o
> slide atual" como bônus — decisão do 02/03, não desta pesquisa.

---

## Upload local de imagem/avatar sem storage remoto

**Contexto do motor:** `SlideData.avatarUrl`/`imageUrl` aceitam **data-URL** (`types.ts:11,17`).
A S1 já usa data-URL nos fixtures (`render-test/fixtures.ts:7-9,29-30` — SVG como
`data:image/svg+xml,...`) e a comenta explicitamente: "same-origin, zero CORS no canvas —
não tingem o canvas na captura" (`fixtures.ts:4-5`).

**Duas opções para o upload local (o código não decide por você — expõe o trade-off):**

- **`FileReader.readAsDataURL(file)` → data-URL (`data:image/png;base64,...`).**
  - Prós: é o formato que a S1 já provou funcionar no canvas (same-origin de fato, embutido).
    `html-to-image` captura sem CORS nem tainting. Sobrevive a re-render/reorder (é só string
    no estado). Não precisa de cleanup.
  - Contras: string grande na memória (base64 ≈ +33% do arquivo). Imagem de 5-10MB vira
    data-URL pesada no estado React — re-render do preview a cada tecla pode ficar lento.
- **`URL.createObjectURL(file)` → blob-URL (`blob:http://localhost/...`).**
  - Prós: leve (referência, não cópia). Preview instantâneo.
  - Contras: **é same-origin mas efêmero** — precisa `URL.revokeObjectURL` no cleanup (senão
    vaza memória). E, mais crítico: `html-to-image` com `cacheBust:true` (`export-png.ts:33`)
    **anexa querystring à URL** para furar cache; blob-URLs podem não tolerar querystring e
    falhar no fetch interno do `toPng`. **Risco real para o export futuro (S4).**

**Recomendação a documentar (decisão é do 03):** `FileReader → data-URL` é o caminho de menor
risco — alinhado ao que a S1 já validou com o canvas, sobrevive a reorder/persistência futura,
e não conflita com o `cacheBust`. O custo de memória é aceitável em S2 (estado local, poucos
slides); otimização (compressão/resize no upload) é fora de escopo aqui.

**Ponto de atenção do `cacheBust`:** `export-png.ts:33` usa `cacheBust: true`. Com data-URL
isso é inofensivo (a lib detecta e não busca). Só vira problema com URLs http/blob — reforça a
preferência por data-URL.

**Validação de entrada (borda nova):** S2 é a **primeira fatia com input de usuário** (a S1
não tinha — `spec.md:50-52` registra "Zod não é necessário na S1... entra quando houver input
S2+"). O editor deve validar: tipo de arquivo (só imagem), talvez tamanho máx. Zod entra aqui
se a story/spec quiser formalizar. Não há schema Zod no projeto ainda (`package.json` não lista
`zod` — precisaria instalar se a spec optar por ele).

---

## Estado local (sem banco, sem persistência)

Nada de estado global existe hoje — a S1 usa só `useState` local por card
(`render-test/page.tsx:26-27`). Para a S2:

**Shape sugerido (a spec define; a pesquisa expõe o que o contrato exige):**
- Array de slides. Cada slide = `SlideData` (`types.ts:6`) + um `id` estável para React keys
  e reorder (o `<Slide>` não tem id; é preciso adicionar um wrapper `{ id: string } & SlideData`
  ou `{ id, data: SlideData }`).
- **Identidade compartilhada**: `name`, `handle`, `avatarUrl`, `verified` tendem a ser os
  mesmos em todos os slides do carrossel (a VISÃO trata isso como "perfil" —
  `docs/VISAO.md:44-45`: "Cada perfil guarda nome, @handle, avatar, selo on/off, tom, tema").
  Duas modelagens possíveis:
  - (a) **Identidade única no topo + array só de {body, imageUrl}** — DRY, editar avatar/nome
    reflete em todos os slides. Bate com o conceito de "perfil" da VISÃO.
  - (b) **Cada slide carrega `SlideData` completo** — mais simples de passar ao `<Slide>`, mas
    duplica identidade. Reordenar/remover não afeta identidade.
  - `[PRECISA CLARIFICAR: a identidade (nome/handle/avatar/selo) é compartilhada por todo o
    carrossel — editável uma vez — ou pode variar por slide? A VISÃO sugere "perfil" único por
    carrossel, mas o contrato SlideData permite variar. Decisão de UX para o 02.]`
- **Tema do carrossel**: `docs/VISAO.md:40` e o prompt tratam tema como propriedade do
  carrossel inteiro ("Exporta PNGs... claro ou escuro"). Provável estado único no topo aplicado
  a todos os slides, não por-slide. `[PRECISA CLARIFICAR: tema é do carrossel inteiro ou
  por slide? A VISÃO trata como do carrossel.]`
- **Slide atualmente selecionado**: índice/id para navegação.

**Ferramenta de estado (sem over-engineering — YAGNI):** `useReducer` é o ajuste natural para
add/remove/reorder/edit num array (ações discretas), evita cascata de `useState`. `useState`
simples também serve se a story for enxuta. **Context NÃO é necessário** se o editor for uma
página só (estado local no componente-página, passado por props). Não há Redux/Zustand/Jotai no
`package.json` — instalar seria over-engineering para estado local de uma tela. Decisão final é
do 03 (gate de simplicidade).

---

## Reorder de slides — o que existe hoje

**Nenhuma lib de drag-and-drop instalada.** `package.json:15-42` — sem `@dnd-kit/*`,
`react-beautiful-dnd`, `framer-motion` nem similar. Disponível: `lucide-react` (ícones — tem
setas `ArrowUp`/`ArrowDown`/`ChevronUp` para botões mover).

**Opções (decisão do 03):**
- **(A) Botões mover ↑/↓** (+ add/remover) — zero dependência nova, acessível por teclado por
  padrão, trivial de testar (swap de índices no array). Recomendação de menor risco/YAGNI para
  S2.
- **(B) Drag-and-drop** — exige instalar lib (ex.: `@dnd-kit/core` + `@dnd-kit/sortable`,
  compatível com React 19). Melhor UX, mais superfície de bug (a11y, touch, teste E2E). Pode
  ficar para uma iteração futura.

O ROADMAP (`docs/ROADMAP.md:18`) e o STATUS da S2 (`.work/s2-editor-manual/STATUS.md:22-23`)
listam só "reordenar" sem exigir DnD — botões ↑/↓ cumprem o critério. Recomendo documentar (A)
como baseline e (B) como opcional.

---

## Features similares já feitas (padrão a reusar)

1. **`src/app/render-test/page.tsx`** — é literalmente o esqueleto do editor: Client Component,
   `useState` de status, `<Slide>` em preview escalado, uso de `Button`/`Card` shadcn, estados
   idle/loading/success/error (`render-test/page.tsx:22,29-44`). O editor é uma evolução disto
   com estado editável em vez de fixtures.
2. **`src/app/render-test/fixtures.ts`** — mostra o formato de dados de exemplo e o uso de
   data-URL para assets same-origin. Bom ponto de partida para o estado inicial/seed do editor.
3. **`src/components/ui/button.tsx` + `card.tsx`** — componentes shadcn já instalados, com
   variantes (`button.tsx:12-35`: default/destructive/outline/ghost/link; sizes incl. `icon`
   para botões de seta). `destructive` serve ao "remover slide".

---

## shadcn/ui — o que existe e o que falta para o editor

**Instalado** (`src/components/ui/`): `button.tsx`, `card.tsx`. Config em `components.json`
(baseColor slate, RSC true, alias `@/components/ui`).

**Provavelmente necessário para o editor (instalar via `npx shadcn add`):**
- `input` — nome, handle.
- `textarea` — corpo do slide (multi-linha, `\n\n`).
- `label` — rótulos de campo.
- `switch` (ou `checkbox`) — selo on/off e toggle de tema.
- Opcional: `tabs`/`select` para navegação entre slides; `separator`, `tooltip`.
O upload de imagem pode usar `<input type="file">` nativo estilizado (shadcn não tem componente
de file dedicado). Nada disso existe ainda — todos a criar. Decisão fina de quais é do 03.

---

## O que já está quebrado / pendente na área

- **Fonte woff2 NÃO embarcada** (follow-up crítico do STATUS): `src/lib/fonts.ts` e
  `src/assets/fonts/` **não existem** (Glob vazio). A S1 usa a Segoe UI real do Windows —
  `layout.tsx:13-18` monta o `<body>` com `font-sans` do sistema, sem `next/font/local`. O
  `SLIDE_FONT_STACK` (`slide-tokens.ts:35-36`) começa em `'Segoe UI'` e cai em
  `Selawik/system-ui/...` como fallback. **Impacto na S2:** o preview ao vivo depende da fonte
  local do dev (fidelidade máxima só no Windows do Octavio). Não bloqueia o editor, mas o
  preview num Mac/Linux já divergiria. O embarque woff2 continua pendente para ANTES do deploy
  Linux (Vercel) — é decisão de licenciamento em aberto (`spec.md:221-233`, `STATUS.md:41-43`).
  A S2 pode conviver com isso; só não deve assumir que o preview é 100% fiel fora do Windows.
- **Sem validação de input em lugar nenhum** — esperado (S1 não tinha input). Vira
  responsabilidade nova da S2 (primeira borda de usuário).
- **`eslint.ignoreDuringBuilds: true`** (`next.config.mjs:5-7`) — lint está fora do gate de
  build. Não quebra, mas o editor não terá lint automático no build. Testes (vitest) e
  type-check seguem sendo o gate.
- Nenhum TODO/código morto relevante encontrado na área do slide.

---

## Riscos sinalizados

- 🟡 **Avatar vazio / obrigatório** — `avatarUrl` é obrigatório e sem guarda no `<Slide>`
  (`slide.tsx:102`). Estado inicial do editor com avatar vazio → `<img src="">` (ícone
  quebrado no preview; export futuro incompleto). O editor precisa de um placeholder/default
  ou bloquear preview até haver avatar. **Onde:** estado inicial do editor + `<Slide>` render.
- 🟡 **data-URL vs blob-URL no export futuro** — se a S2 escolher `URL.createObjectURL`, o
  `cacheBust:true` do `export-png.ts:33` pode furar o fetch da blob-URL em S4. Escolher
  data-URL agora evita retrabalho. **Onde:** decisão de upload (seção acima).
- 🟡 **Imagem gigante em data-URL** — arquivo grande vira base64 pesado no estado; re-render
  do preview a cada tecla pode travar. Sem resize/compressão (fora de escopo). Mitigável com
  limite de tamanho na validação de upload. **Onde:** handler de upload + estado.
- 🟡 **Preview infiel fora do Windows** — fonte não embarcada (ver "quebrado"). Preview do
  Octavio (Windows) é fiel; num deploy/outro OS, divergiria. **Onde:** `slide-tokens.ts:35`,
  ausência de `fonts.ts`.
- 🟢 **0 slides / body vazio** — `<Slide>` com body vazio renderiza só header (zero `<p>`,
  `slide.tsx:64`) — não quebra. Carrossel com 0 slides é estado de UI a tratar (mostrar "adicione
  um slide"), não um crash do motor. **Onde:** lógica do editor.
- 🟢 **Alterar `SlideData`/`SlideProps` quebra S1** — se a S2 precisar mudar o contrato
  (`types.ts:6`), reverbera em `slide.tsx`, nos 7 testes de `tests/slide.test.tsx`, nos
  fixtures e em S4/S5. **Recomendação:** S2 deve envolver `SlideData` (ex.: `{id} & SlideData`)
  em vez de alterá-lo. Contrato é ponto de acoplamento crítico — ver "Dependências".
- 🟢 **Reescala do preview** — usar `zoom`/mudar width em vez de `transform: scale` quebraria
  fidelidade do futuro export. Padrão correto já existe (`render-test/page.tsx:59-64`).

---

## Dependências afetadas (blast radius)

Ordenado por acoplamento:

- 🔴→🟢 **`src/components/slide/types.ts` (contrato `SlideData`/`SlideProps`)** — consumido por:
  `slide.tsx`, `render-test/page.tsx`, `render-test/fixtures.ts`, `export-png` (indireto via nó),
  `tests/slide.test.tsx` (7 asserts sobre o shape), `tests/png-dimensions.test.ts` (via fixtures),
  e futuramente S4/S5. **Mudar é breaking.** Se S2 só ENVOLVER (wrapper `{id} & SlideData`) e
  não alterar o shape → risco 🟢 (isolado). Se precisar adicionar campo (ex.: `id`, ou tornar
  `avatarUrl` opcional), é 🟡/🔴 — exige tocar S1. **Recomendação forte: não alterar o contrato;
  compor por cima.**
- 🟢 **`src/components/slide/slide.tsx`** — reusado como caixa-preta pelo preview. Não precisa
  tocar. Se tocar, quebra os testes de contrato.
- 🟢 **`src/lib/export-png.ts`** — S2 não precisa dele (export é S4). Se a story pedir "exportar
  slide atual", é reuso puro (passa o nó de captura). Sem alteração.
- 🟢 **`src/components/ui/button.tsx`, `card.tsx`** — reuso; provavelmente adicionar novos
  componentes shadcn (input/textarea/switch) ao lado, sem tocar os existentes.
- 🟢 **`package.json`** — instalar componentes shadcn novos (adiciona deps Radix) e,
  possivelmente, uma lib de DnD ou `zod` se a spec optar. Cada adição é dep nova a justificar
  no gate de simplicidade.
- 🟢 **Rotas** — nova rota `src/app/<algo>/page.tsx` (ex.: `/editor` ou `/criar`), a home
  (`src/app/page.tsx:17-19`) hoje só linka `/render-test` — pode ganhar link para o editor.
  `[PRECISA CLARIFICAR: nome/caminho da rota do editor — /editor, /criar, /novo?]`

---

## Fora de escopo (explícito — herdado do ROADMAP e do prompt)

- **Banco / persistência / auth / perfis salvos** → S3 (`ROADMAP.md:19`). S2 é 100% estado
  local em memória; recarregar a página perde tudo (aceitável nesta fatia).
- **Storage remoto (Vercel Blob)** → S3. Upload é só local (data-URL/blob em memória).
- **Export em lote / ZIP / download de todos os PNGs** → S4 (`ROADMAP.md:20`). O `<Slide>` e o
  `export-png.ts` ficam prontos; S2 não dispara export em lote.
- **Geração por IA (Claude API)** → S5 (`ROADMAP.md:21`).
- **Auto-fit de texto** (reduzir fonte por overflow) → fora desde a S1 (`story.md:79`,
  `slide.tsx:57` deriva fontSize só de imageUrl). Textos que estouram divergem — sem tratamento.
- **Alterar tamanho de fonte manualmente** — `fontSize` é derivado, não editável (contrato).
- **Deploy / embarque de fonte woff2** — pendência de infra (STATUS), não bloqueia o editor;
  fica para antes do deploy Linux.
- **Multi-cliente / config por cliente** → S6.

---

## Perguntas abertas

- `[PRECISA CLARIFICAR: identidade (nome/handle/avatar/selo) é única por carrossel (perfil,
  editada uma vez, refletida em todos os slides) ou pode variar por slide? A VISÃO (docs/
  VISAO.md:44-45) sugere perfil único; o contrato SlideData permite variar. Impacta a modelagem
  do estado.]`
- `[PRECISA CLARIFICAR: tema claro/escuro é do carrossel inteiro (um toggle global) ou por
  slide? A VISÃO trata como do carrossel (VISAO.md:40).]`
- `[PRECISA CLARIFICAR: reorder por botões ↑/↓ (zero dependência, baseline) ou drag-and-drop
  (instala @dnd-kit)? Prompt/ROADMAP só dizem "reordenar".]`
- `[PRECISA CLARIFICAR: upload por FileReader→data-URL (recomendado, alinhado à S1 e ao
  cacheBust) ou URL.createObjectURL? Impacta o export futuro (S4).]`
- `[PRECISA CLARIFICAR: nome/caminho da rota do editor (/editor, /criar, /novo)? E a home deve
  ganhar link para ela?]`
- `[PRECISA CLARIFICAR: há limite de tamanho/quantidade para upload de imagem, ou validação
  mínima (só tipo de arquivo)? Primeira borda de input do projeto.]`
- `[PRECISA CLARIFICAR: o editor deve permitir exportar o slide atual (reuso do export-png),
  ou export fica 100% para a S4? O motor está pronto; é decisão de escopo da story.]`
