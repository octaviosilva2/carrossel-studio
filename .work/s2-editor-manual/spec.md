# Spec — S2: Editor manual de carrossel (estado local, sem banco)

> Estágio 03 do pipeline dev-agents. Desenho técnico do *como*. Traduz a story aprovada
> (`.work/s2-editor-manual/story.md`) num contrato preciso para o Backend/Frontend (aqui,
> tudo é frontend + lógica pura) implementarem sem improvisar. Referências `arquivo:linha`
> foram verificadas na S1. **Não contém código de produção — só o desenho.**

---

## Resumo da abordagem

Uma rota `/editor` = **um Client Component-página** que segura todo o estado do carrossel
via **`useReducer`**, com o **reducer extraído para um módulo puro e testável**
(`src/lib/editor-state.ts`) sem dependência de DOM. O estado tem três blocos: **identidade única**
(`name`, `handle`, `avatarUrl`, `verified`), **tema global** (`light | dark`) e **array de slides**
(`{ id, body, imageUrl? }`) + `selectedSlideId`. Para o preview, montamos um `SlideData` (contrato
imutável da S1) combinando `identity + slide + theme` e passamos ao `<Slide>` **reusado como
caixa-preta**, dentro do wrapper escalado por `transform: scale()` já validado em
`render-test/page.tsx:52-68`.

**Por quê:** é a solução mais simples que cumpre a story (gate de simplicidade). Sem Context /
Redux / Zustand (uma tela só, estado local); sem DnD (reorder por botões ↑/↓); sem Zod (a única
borda de input é um `File` — uma função pura de validação resolve e é mais fácil de testar que
instalar um schema). O contrato `SlideData` **não muda** — compomos por cima, isolando a S1.

---

## Arquitetura de estado

### Ferramenta: `useReducer` com reducer puro extraído

`useReducer(editorReducer, initialState)` no componente-página. O `editorReducer` e o
`initialState` vivem em **`src/lib/editor-state.ts`** — módulo puro (sem React, sem DOM, sem
`"use client"`), para o estágio 06 testá-lo unitariamente com Vitest sem renderizar nada.

Justificativa (YAGNI): add/remover/reordenar/editar num array são **ações discretas** — o
`switch` de um reducer descreve cada transição explicitamente e centraliza as invariantes
(seleção sempre válida, no-op nas pontas). `useState` espalhado exigiria orquestrar várias
chamadas por ação; `Context` só se justificaria com múltiplas telas consumindo o estado — não é
o caso. Nada de lib de estado externa.

### Shape do estado

```ts
// src/lib/editor-state.ts

/** Identidade do perfil — compartilhada por TODOS os slides do carrossel. */
export interface CarouselIdentity {
  name: string;
  handle: string;      // SEM "@"; o <Slide> prefixa "@" (slide.tsx:146)
  avatarUrl: string;   // data-URL; NUNCA "" (default = placeholder SVG). Ver "Placeholder de avatar"
  verified: boolean;
}

/** Slide do editor: envelope com id + campos POR slide. NÃO é SlideData. */
export interface EditorSlide {
  id: string;          // estável, para React key e reorder
  body: string;
  imageUrl?: string;   // data-URL ou undefined; presença define corpo 46 vs 52
}

/** Estado inteiro do editor. */
export interface EditorState {
  identity: CarouselIdentity;
  theme: SlideTheme;               // "light" | "dark" — reusa o tipo da S1 (types.ts:4)
  slides: EditorSlide[];
  selectedSlideId: string | null;  // null só quando slides está vazio
}
```

`SlideTheme` é **importado** de `@/components/slide/types` — não redefinir (fonte única).

**Invariantes garantidas pelo reducer (o app não pode violá-las):**
1. `selectedSlideId` é `null` **se e somente se** `slides` está vazio; caso contrário, aponta
   para um `id` que existe em `slides`.
2. `identity.avatarUrl` nunca é `""` — cai no placeholder default quando não há avatar do usuário.
3. Reordenar/remover **nunca** toca `identity` nem `theme`.

### Estado inicial (`initialState`)

Carrossel começa **com 1 slide vazio selecionado** (não com 0). Assim o editor abre já mostrando
um preview utilizável, e o "estado vazio de 0 slides" (edge case da story) só acontece se o
usuário remover o último slide.

```ts
export const initialState: EditorState = {
  identity: {
    name: "",
    handle: "",
    avatarUrl: DEFAULT_AVATAR_DATA_URL, // ver "Placeholder de avatar"
    verified: false,
  },
  theme: "light",
  slides: [{ id: <novo id>, body: "", imageUrl: undefined }],
  selectedSlideId: <mesmo id do slide acima>,
};
```

Rastreabilidade: garante o critério "renderiza o editor sem erro" e "avatar placeholder desde o
estado inicial" (story, Edge cases). `name`/`handle` vazios são válidos — o `<Slide>` renderiza
string vazia sem quebrar (o preview mostra header com nome/handle em branco, aceitável).

> **Geração de id:** usar `crypto.randomUUID()` (disponível no browser e no Node ≥ 16 do ambiente
> de teste — global, sem import). O reducer recebe o id pronto **via payload da action `ADD_SLIDE`**
> (ver nota abaixo) OU gera internamente. Decisão: **gerar dentro do reducer** com
> `crypto.randomUUID()` mantém o call-site simples. Como isso introduz não-determinismo no
> reducer (ruim para teste), o teste do 06 valida o *shape* (novo slide existe, foi selecionado),
> não o valor do id. Aceitável — a alternativa (injetar id por payload) é mais cerimônia sem
> ganho real nesta fatia.

### Actions (discriminated union) e lógica de cada uma

```ts
export type EditorAction =
  | { type: "UPDATE_IDENTITY"; patch: Partial<Omit<CarouselIdentity, "avatarUrl">> }
  | { type: "SET_AVATAR"; avatarUrl: string }        // avatar validado (data-URL não-vazia)
  | { type: "REMOVE_AVATAR" }                          // volta ao placeholder default
  | { type: "TOGGLE_VERIFIED" }                        // atalho semântico p/ o switch do selo
  | { type: "SET_THEME"; theme: SlideTheme }
  | { type: "SELECT_SLIDE"; id: string }
  | { type: "ADD_SLIDE" }
  | { type: "REMOVE_SLIDE"; id: string }
  | { type: "MOVE_SLIDE"; id: string; direction: "up" | "down" }
  | { type: "UPDATE_SLIDE_BODY"; id: string; body: string }
  | { type: "SET_SLIDE_IMAGE"; id: string; imageUrl: string } // data-URL validada
  | { type: "REMOVE_SLIDE_IMAGE"; id: string };
```

Lógica (o reducer é **puro** — sempre retorna novo estado, nunca muta):

| Action | Efeito | Notas / edge |
|---|---|---|
| `UPDATE_IDENTITY` | mescla `patch` em `identity` (name/handle/verified). | Handle já vem **sem "@"** (o input não deixa digitar/o handler remove — ver UI). Não altera slides. |
| `SET_AVATAR` | `identity.avatarUrl = avatarUrl`. | Chamado só com data-URL já validada. |
| `REMOVE_AVATAR` | `identity.avatarUrl = DEFAULT_AVATAR_DATA_URL`. | Nunca deixa `""`. |
| `TOGGLE_VERIFIED` | `identity.verified = !identity.verified`. | Reflete em todos os slides (identidade é única). |
| `SET_THEME` | `theme = action.theme`. | Global; reflete em todos os slides. |
| `SELECT_SLIDE` | `selectedSlideId = id` **se** `id` existe em `slides`; senão no-op. | Falha fechado: id inexistente não corrompe seleção. |
| `ADD_SLIDE` | cria `{ id: novo, body: "", imageUrl: undefined }`, faz **push ao fim**, e `selectedSlideId = novo`. | Critério: novo slide vazio ao fim e vira o selecionado. |
| `REMOVE_SLIDE` | remove o slide de `id`. Recalcula seleção (regra abaixo). | Ver "seleção ao remover". |
| `MOVE_SLIDE` | troca o slide de `id` com o vizinho na `direction`. | **No-op** se já é o primeiro (`up`) ou o último (`down`), ou se `id` não existe. Não muda `selectedSlideId` (a seleção acompanha o slide, que mudou de índice mas manteve id). |
| `UPDATE_SLIDE_BODY` | atualiza `body` **só** do slide de `id`. | Não afeta os outros slides (critério de isolamento). |
| `SET_SLIDE_IMAGE` | `imageUrl = action.imageUrl` só do slide de `id`. | data-URL já validada. Por-slide. |
| `REMOVE_SLIDE_IMAGE` | `imageUrl = undefined` só do slide de `id`. | Preview volta a corpo 52 (derivado no `<Slide>`). |

**Seleção ao remover (`REMOVE_SLIDE`) — regra explícita:**
- Se o slide removido **não** era o selecionado → seleção inalterada.
- Se **era** o selecionado:
  - restam slides → seleciona o **vizinho anterior** se existir, senão o **próximo** (na prática:
    novo índice = `min(indiceRemovido, novaLista.length - 1)`; seleciona `novaLista[esseIndice].id`).
  - não restam slides (removeu o último) → `slides = []` e `selectedSlideId = null` (estado vazio;
    a UI mostra CTA "adicione um slide", não renderiza `<Slide>`).

**No-op nas pontas (`MOVE_SLIDE`):** retornar o **mesmo** objeto de estado (referência) quando o
movimento é inválido — permite ao React pular re-render e ao teste asserir `next === prev`.

### Como montar `SlideData` para o `<Slide>` (adaptador)

O `<Slide>` só aceita `SlideData` (contrato imutável). Uma função pura converte:

```ts
// pode viver em editor-state.ts (é lógica pura, testável)
export function toSlideData(
  identity: CarouselIdentity,
  slide: EditorSlide,
  theme: SlideTheme,
): SlideData {
  return {
    name: identity.name,
    handle: identity.handle,
    avatarUrl: identity.avatarUrl,
    verified: identity.verified,
    body: slide.body,
    imageUrl: slide.imageUrl, // undefined => sem imagem (corpo 52)
    theme,
  };
}
```

Isola a S1: se o contrato `SlideData` mudar no futuro, só esta função muda. **Não** exportamos
`SlideData` do editor — ele é detalhe de fronteira com o motor.

---

## Contrato de API/backend

**Não há.** Esta fatia é 100% client-side, em memória, sem rota de API, sem banco, sem rede.

- Sem endpoints (`app/api/**` intocado).
- Sem chamadas `fetch`. Upload é `FileReader` local (browser), sem multipart, sem storage remoto.
- Sem `export-png.ts` (S4). O motor de export existe mas **não é acionado** aqui.

O "contrato entre camadas" desta fatia é o **contrato do reducer** (actions acima) e o **contrato
`SlideData`** já congelado (`types.ts:6-21`) — ambos definidos nesta spec sem ambiguidade.

---

## Mudanças de dados

**Nenhuma.** Sem tabela, sem migration, sem RLS, sem Postgres/Drizzle.

- Migration destrutiva? **Não** (não há schema).
- RLS / permissões? **N/A** (sem banco, sem auth nesta fatia).
- Persistência? **Nenhuma** — recarregar a página perde o estado (aceitável, story Edge cases).
  Sem `localStorage` (fora de escopo; persistência é S3).

Nota de segurança (baseline aplicada ao desenho): a única superfície de risco é o **input de
arquivo do usuário** → coberto na seção "Upload" (validação de tipo e tamanho, falha fechado, sem
mutação de estado em rejeição). Não há segredo, token nem PII nesta fatia. data-URL fica só em
memória do browser, nunca sai da máquina.

---

## UI/frontend

### Árvore de componentes da rota `/editor`

Gate de simplicidade aplicado: **mínimo de componentes sem sobre-fragmentar**. A página-mãe
segura o estado e distribui via props; os filhos são apresentacionais e recebem os handlers já
prontos. **6 arquivos de componente** (1 página + 4 subcomponentes + 1 preview), mais 2 módulos
de lógica pura.

```
/editor (page.tsx)  ── Client Component, dono do useReducer
├── IdentityPanel          identidade única (name, handle, avatar, verified)
├── SlideNav               lista de slides + add / remover / ↑ / ↓ / selecionar
├── SlideEditor            edição do slide selecionado (textarea corpo + upload imagem)
├── ThemePreview           toggle de tema global + preview ao vivo escalado (<Slide>)
└── (usa) <Slide>          REUSADO da S1 como caixa-preta (dentro do ThemePreview)
```

Decisão de granularidade: `ThemeToggle` **não** vira componente próprio (é um `Switch` + `Label`,
~5 linhas — mora dentro de `ThemePreview`). O upload de imagem **não** vira componente próprio
(é um `<input type="file">` + botão remover — mora dentro de `SlideEditor`). Extrair esses seria
fragmentação sem ganho.

### Estados de UI por área

**Preview (`ThemePreview`):**
- **Vazio (0 slides):** `selectedSlideId === null` → NÃO renderiza `<Slide>`. Mostra um bloco
  placeholder com CTA "Adicione um slide para começar" (o botão add vive na `SlideNav`, mas o
  preview deixa claro o vazio). Sem crash.
- **Normal:** renderiza `<Slide data={toSlideData(identity, slideSelecionado, theme)} />` dentro
  do wrapper escalado. Re-renderiza sozinho a cada mudança de estado (React) — sem "atualizar".
- **Corpo vazio:** o `<Slide>` renderiza só o header (0 parágrafos) — válido, não é erro.
- Não há estado "carregando" nem "erro" no preview: render é síncrono e determinístico (o
  `<Slide>` é Server Component puro de markup, sem efeito/rede — `slide.tsx:48-53`).

**Upload de imagem (`SlideEditor`):**
- **idle:** botão "Adicionar imagem" (ou "Trocar imagem" se já há `imageUrl`) + "Remover imagem"
  (visível só quando há imagem).
- **lendo:** `FileReader` é assíncrono; enquanto lê, desabilitar o input (janela curtíssima —
  data-URL local é rápida). Opcional exibir "Carregando…". Sem spinner obrigatório.
- **erro de validação:** mensagem inline abaixo do input (`text-destructive`, mesmo padrão de
  `render-test/page.tsx:82-83`): "Envie um arquivo de imagem." ou "Imagem acima de 6 MB.". O
  estado **não** muda (imagem anterior permanece). O erro some no próximo upload válido.
- **sucesso:** imagem aparece no preview imediatamente; mensagem de erro limpa.

**Identidade (`IdentityPanel`):**
- Sempre editável, sem estados de carregamento. Avatar tem o mesmo fluxo de upload/validação da
  imagem de slide (tipo + 6 MB), com botão "Remover avatar" que volta ao placeholder default.
- Handle: o input **strip** de "@" no `onChange` (se o usuário colar "@handle", guardamos
  "handle"). Rótulo/prefixo visual "@" opcional na UI, mas o valor no estado é sem "@".

**Navegação de slides (`SlideNav`):**
- Lista os slides (miniatura textual: "Slide N" + trecho do corpo, ou índice). O selecionado é
  destacado (borda/realce).
- Botões por slide selecionado (ou global agindo no selecionado): **↑** (`disabled` quando é o
  primeiro), **↓** (`disabled` quando é o último), **remover** (variant `destructive`).
- Botão **"Adicionar slide"** sempre disponível.

### Preview escalado — fórmula exata (herdada de `render-test/page.tsx:52-68`)

```ts
import { CANVAS_W, CANVAS_H } from "@/components/slide/slide-tokens"; // 1080, 1350

const PREVIEW_W = 420;                       // largura do preview do editor (faixa 380–460)
const PREVIEW_SCALE = PREVIEW_W / CANVAS_W;  // 420 / 1080 = 0.3888…
```

Marcação (idêntica ao padrão validado):
- Container externo: `width: PREVIEW_W`, `height: CANVAS_H * PREVIEW_SCALE`, `overflow: hidden`,
  borda arredondada.
- Container interno: `width: CANVAS_W`, `height: CANVAS_H`, `transform: scale(PREVIEW_SCALE)`,
  `transformOrigin: "top left"`. O `<Slide>` vive DENTRO, em 1080×1350 **físicos**.
- **Proibido** mudar `width`/`height` do nó do `<Slide>` ou usar `zoom` — quebraria a fidelidade
  do export futuro (S4). Escala é só CSS visual.
- **Sem** nó-de-captura-fora-da-viewport nesta fatia (isso é export/S4). Só o preview escalado.

### shadcn/ui a instalar

Rodar (uma vez): `npx shadcn add input textarea label switch`

| Componente | Uso | Justificativa |
|---|---|---|
| `input` | nome, handle | campo de texto de linha única, consistente com o design system. |
| `textarea` | corpo do slide | multi-linha, precisa preservar `\n\n`. |
| `label` | rótulos dos campos | acessibilidade (associação `htmlFor`), consistência. |
| `switch` | selo verificado on/off **e** toggle de tema | dois toggles booleanos; `Switch` comunica on/off melhor que checkbox. |

**Evitável com HTML nativo (não instalar componente shadcn):**
- **Upload de arquivo:** `<input type="file" accept="image/*">` nativo, estilizado com Tailwind
  (shadcn não tem componente de file). Reusa `Button` para o gatilho visual se quiser (`asChild`
  + `<label>`).
- Navegação entre slides: **não** instalar `tabs`/`select` — a `SlideNav` com botões/lista basta
  (YAGNI). `Button` (já instalado, tem `size="icon"` e variant `destructive`) cobre ↑/↓/remover.
- `Card` (já instalado) organiza os painéis, como em `render-test`.

`lucide-react` (já instalado) fornece `ArrowUp`/`ArrowDown`/`Plus`/`Trash2`/`ImagePlus`/`X` para
os botões.

---

## Placeholder de avatar (default)

O `<Slide>` não guarda contra `avatarUrl` vazio (`slide.tsx:102-103` renderiza `<img src="">`
= ícone quebrado). Solução: um **data-URL SVG inline**, no estilo dos fixtures da S1
(`render-test/fixtures.ts:7-17`), usado como valor inicial e ao remover avatar.

- **Onde mora:** `src/lib/editor-state.ts`, exportado como `DEFAULT_AVATAR_DATA_URL`
  (é dado de estado inicial, não markup — pertence ao módulo de estado).
- **Formato:** `data:image/svg+xml,${encodeURIComponent(svg)}` — **same-origin**, zero CORS no
  canvas (mesmíssima técnica de `fixtures.ts:7-9`, já provada no export da S1). Compatível com o
  `cacheBust:true` do export futuro (data-URL não sofre com querystring — research linha 142-144).
- **Aparência sugerida:** círculo/placeholder neutro cinza com ícone genérico de usuário (silhueta)
  ou inicial. Ex.: `<svg 200×200>` fundo `#cfd9de` (mesma família da borda de imagem clara,
  `slide-tokens`/`THEME_VARS`) + silhueta `#8899a6`. O desenho exato do SVG é do 04; a spec fixa:
  **200×200, viewBox 0 0 200 200, cores neutras, sem depender de asset externo.**

Não usar arquivo em `public/`: data-URL inline evita um request e mantém o padrão same-origin que
a S1 escolheu deliberadamente.

---

## Upload (borda de input — validação)

Primeira borda de input do projeto. Validação vive numa **função pura testável**, sem Zod.

### Decisão: função pura, sem Zod (gate de simplicidade)

Zod **não está instalado** (`package.json:15-24`). A única entrada a validar é um objeto `File`
com duas regras triviais (tipo MIME + tamanho). Instalar Zod + escrever schema para isso é mais
cerimônia do que valor — uma função pura de ~8 linhas é mais fácil de testar e não adiciona
dependência. **Não instalar Zod nesta fatia.** (Se S3+ trouxer formulários complexos com banco,
reavaliar — decisão daquela fatia.)

### Onde vive

`src/lib/image-upload.ts` — módulo puro (validação) + helper de leitura. `"use client"` só é
necessário porque `FileReader` é API de browser; a **função de validação em si é pura** (recebe
`File`, retorna resultado) e testável isolada.

### Assinaturas

```ts
// src/lib/image-upload.ts

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB (story fixou 6 MB)

export type ImageValidation =
  | { ok: true }
  | { ok: false; error: string };

/** Valida tipo (só imagem) e tamanho (≤ 6 MB). Pura — testável sem DOM. */
export function validateImageFile(file: File): ImageValidation;
//  - !file.type.startsWith("image/")  -> { ok:false, error:"Envie um arquivo de imagem." }
//  - file.size > MAX_IMAGE_BYTES      -> { ok:false, error:"Imagem acima de 6 MB." }
//  - senão                            -> { ok:true }

/** Lê um File já validado como data-URL (FileReader.readAsDataURL). Promise. */
export function readFileAsDataUrl(file: File): Promise<string>;
//  resolve com reader.result (string data:...); rejeita em reader.onerror.
```

### Fluxo no handler (na UI, `SlideEditor` / `IdentityPanel`)

Assinatura do handler: `async function handleImageChange(e: ChangeEvent<HTMLInputElement>)`.

1. `const file = e.target.files?.[0]` — se `undefined`, retorna (cancelou). `noUncheckedIndexedAccess`
   obriga o `?.` / narrowing.
2. `const v = validateImageFile(file)` — se `!v.ok`, seta a mensagem de erro no state local do
   componente e **retorna sem despachar action** (estado do reducer inalterado → imagem anterior
   permanece; critério de aceite).
3. `const dataUrl = await readFileAsDataUrl(file)` — em `catch`, mensagem "Falha ao ler o arquivo."
4. `dispatch({ type: "SET_SLIDE_IMAGE", id: selectedId, imageUrl: dataUrl })` (ou `SET_AVATAR`
   para o avatar).
5. `e.target.value = ""` ao fim — permite reenviar o mesmo arquivo depois de remover.

Feedback de erro: estado local `useState<string>("")` no componente do input, exibido inline
(`text-destructive`), limpo em upload bem-sucedido. **Falha fechado:** qualquer entrada inválida
não muta o carrossel.

### Regras de validação (tabela)

| Entrada | Regra | Resultado |
|---|---|---|
| `file.type` não começa com `image/` | rejeita | aviso, estado inalterado |
| `file.size > 6 MB` | rejeita | aviso, estado inalterado |
| imagem válida ≤ 6 MB | aceita | lê → data-URL → dispatch |
| nenhum arquivo (cancelou o picker) | ignora | no-op |

> `accept="image/*"` no input é conveniência de UX (o picker já filtra), **não** substitui a
> validação em JS — o usuário pode forçar outros arquivos. A validação é a defesa real.

---

## Arquivos a tocar

### CRIAR — lógica pura (testável sem DOM)
- `src/lib/editor-state.ts` — `EditorState`, `CarouselIdentity`, `EditorSlide`, `EditorAction`,
  `editorReducer`, `initialState`, `toSlideData`, `DEFAULT_AVATAR_DATA_URL`. **Coração testável.**
- `src/lib/image-upload.ts` — `validateImageFile`, `readFileAsDataUrl`, `MAX_IMAGE_BYTES`.

### CRIAR — UI (Client Components) na rota
- `src/app/editor/page.tsx` — Client Component-página; `useReducer(editorReducer, initialState)`;
  compõe os painéis; deriva `slideSelecionado` de `selectedSlideId`.
- `src/app/editor/identity-panel.tsx` — `IdentityPanel`: name, handle (strip "@"), avatar
  (upload + remover), switch de selo verificado. Recebe `identity` + `dispatch` por props.
- `src/app/editor/slide-nav.tsx` — `SlideNav`: lista de slides, selecionar, add, remover, ↑/↓
  (com `disabled` nas pontas). Recebe `slides`, `selectedSlideId`, `dispatch`.
- `src/app/editor/slide-editor.tsx` — `SlideEditor`: textarea do corpo + upload/remover imagem do
  slide selecionado. Recebe o slide selecionado + `dispatch`.
- `src/app/editor/theme-preview.tsx` — `ThemePreview`: switch de tema global + preview escalado
  com `<Slide>` (ou estado vazio se `null`). Recebe `identity`, `theme`, slide selecionado,
  `dispatch`.

> Colocar os subcomponentes em `src/app/editor/` (co-locados com a rota) — são específicos do
> editor, não componentes de UI genéricos. Segue o padrão de `render-test/` (page + fixtures
> co-locados).

### EDITAR
- `src/app/page.tsx` — adicionar um `<Button asChild>` com `<Link href="/editor">` (ao lado do
  link de `/render-test` existente, `page.tsx:17-19`). Ex.: "Abrir o editor de carrossel".

### CRIAR — via CLI (não escrever à mão)
- `src/components/ui/input.tsx`, `textarea.tsx`, `label.tsx`, `switch.tsx` — gerados por
  `npx shadcn add input textarea label switch`. Adiciona deps Radix ao `package.json`
  (`@radix-ui/react-label`, `@radix-ui/react-switch`) — justificadas acima.

### NÃO TOCAR (reuso como caixa-preta / isolamento da S1)
- `src/components/slide/*` (types, slide, verified-badge, slide-tokens) — **imutáveis** nesta
  fatia. Mudar quebra os testes de contrato da S1 (`tests/slide.test.tsx`).
- `src/lib/export-png.ts` — não acionado (export é S4).
- `src/components/ui/button.tsx`, `card.tsx` — reuso sem alteração.

---

## Plano de teste

Prioridade: **lógica pura** (reducer + validação) — rápida, determinística, sem DOM. Preview
(pixel/scale) **não** é alvo de teste unitário (é o `<Slide>` da S1, já coberto por 15 testes
verdes; e o wrapper de scale é CSS trivial). Testes de componente ficam mínimos.

### A) `tests/editor-reducer.test.ts` — reducer puro (o grosso da cobertura)

Import de `editorReducer`, `initialState`, `toSlideData`, `validateImageFile` (unidade, sem
`@testing-library`). Casos por critério de aceite:

| Caso de teste | Critério de aceite coberto |
|---|---|
| `initialState` tem 1 slide, ele é o selecionado, avatar = default (não `""`) | estado inicial / avatar placeholder |
| `UPDATE_IDENTITY {name}` muda `identity.name`, não toca slides | editar nome reflete em todos (via identidade única) |
| `UPDATE_IDENTITY {handle}` guarda handle sem "@" | handle sem "@" |
| `TOGGLE_VERIFIED` inverte `verified` | selo on/off reflete em todos |
| `SET_THEME "dark"` muda `theme`, não toca slides/identity | tema global |
| `ADD_SLIDE` acrescenta slide vazio **ao fim** e o seleciona | adicionar slide |
| `SELECT_SLIDE` com id válido muda seleção; com id inexistente = no-op | navegar entre slides |
| `UPDATE_SLIDE_BODY` muda só o slide alvo, os outros intactos | corpo por-slide isolado |
| `SET_SLIDE_IMAGE` / `REMOVE_SLIDE_IMAGE` afeta só o slide alvo | imagem por-slide isolada |
| `MOVE_SLIDE up`/`down` troca com o vizinho; seleção acompanha (id estável) | reorder ↑/↓ |
| `MOVE_SLIDE up` no primeiro / `down` no último = **no-op** (`next === prev`) | pontas sem efeito |
| `REMOVE_SLIDE` do selecionado (com vizinhos) → seleciona vizinho válido | remover → seleção vizinha |
| `REMOVE_SLIDE` do último slide → `slides=[]`, `selectedSlideId=null` | estado vazio, sem índice inválido |
| `REMOVE_SLIDE` de um não-selecionado → seleção inalterada | remover não-selecionado |
| reorder/remover **não** alteram `identity` nem `theme` | reordenar não altera identidade |
| `toSlideData` monta `SlideData` correto (identity+slide+theme; `imageUrl` undefined preservado) | preview reflete o estado |

### B) `tests/image-upload.test.ts` — validação pura

| Caso | Critério |
|---|---|
| `validateImageFile` com `type="application/pdf"` → `{ok:false, "…imagem"}` | upload não-imagem rejeitado |
| `validateImageFile` com `size = 6MB+1` → `{ok:false, "…6 MB"}` | acima do limite rejeitado |
| `validateImageFile` com `type="image/png"`, `size < 6MB` → `{ok:true}` | válido aceito |
| `MAX_IMAGE_BYTES === 6*1024*1024` | limite = 6 MB |

Construir `File` fake no teste (`new File([conteúdo], "x.png", { type })`) — jsdom suporta;
`fixtures-e-dados`: nunca usar imagem real de cliente, gerar bytes sintéticos.
`readFileAsDataUrl` pode ficar sem teste unitário (é wrapper fino de API do browser; jsdom tem
`FileReader`, mas o valor está no dispatch, coberto pelo fluxo) — opcional cobrir com um `File`
pequeno se o custo for baixo.

### C) Teste de componente leve (opcional, só se o tempo permitir) — `tests/editor-page.test.tsx`

Com `@testing-library/react` (padrão da S1). Poucos casos de fumaça, **não** pixel:
- renderiza `/editor` sem erro e mostra 1 preview (`.slide` no DOM).
- clicar "Adicionar slide" → aparece novo item na `SlideNav`.
- remover todos os slides → some o `.slide`, aparece o CTA de estado vazio.
- upload de arquivo não-imagem → mensagem de erro visível, `.slide` inalterado.

Não testar o valor do `transform: scale` (CSS determinístico) nem fidelidade de fonte.

**Gate:** `npm run type-check` (tsc strict, `noUncheckedIndexedAccess`) + `npm run test` (vitest)
verdes. Lint está fora do build (`next.config.mjs:5-7`), mas type-check + testes são o gate real.

---

## Decisões e trade-offs

| Decisão | Alternativa descartada | Por quê |
|---|---|---|
| `useReducer` com reducer puro em `src/lib/editor-state.ts` | `useState` espalhado; Context; Zustand/Redux | ações discretas sobre array pedem reducer; extrair torna a lógica testável sem DOM; libs externas são over-engineering p/ 1 tela. |
| Compor `SlideData` via `toSlideData()` a partir de estado próprio (`EditorSlide`) | cada slide guardar `SlideData` completo | não duplica identidade (DRY, alinhado a "perfil" da VISÃO); e **não altera** o contrato imutável da S1. |
| Identidade única no topo do estado | identidade por slide | story fixou "editada uma vez, reflete em todos". |
| Reorder por botões ↑/↓ (`MOVE_SLIDE {id, direction}`) | drag-and-drop (`@dnd-kit`) | zero dependência nova, acessível por teclado, trivial de testar; DnD é superfície de bug extra (story fixou botões). |
| Upload `FileReader → data-URL` | `URL.createObjectURL` (blob-URL) | data-URL é same-origin de fato (validado no canvas da S1), sobrevive a reorder, e não conflita com `cacheBust:true` do export futuro; blob-URL vaza memória e arrisca o export S4. |
| Validação por função pura em `image-upload.ts` | instalar Zod | 2 regras triviais sobre um `File`; função pura é mais fácil de testar e não adiciona dependência. |
| Placeholder de avatar = data-URL SVG inline em `editor-state.ts` | asset em `public/`; bloquear preview até haver avatar | evita `<img src="">` quebrado sem request extra; mantém same-origin da S1; deixa o editor usável desde o primeiro render. |
| `MOVE_SLIDE {id, direction}` (uma action) | `MOVE_SLIDE_UP` + `MOVE_SLIDE_DOWN` separadas | uma action com `direction` reduz superfície; a lógica de swap+bounds é a mesma. |
| Estado inicial com 1 slide | iniciar com 0 slides | editor abre já mostrando preview; o vazio vira caso de borda (remover o último), não a experiência de entrada. |
| Subcomponentes co-locados em `src/app/editor/` | tudo em `page.tsx`; ou em `src/components/` | separa responsabilidades sem inflar a página; são específicos do editor (não UI genérica), padrão de `render-test/`. |

---

## Riscos para implementação

- 🟡 **`crypto.randomUUID` no reducer introduz não-determinismo** — os testes do reducer devem
  asserir *shape/comportamento* (novo slide existe e foi selecionado), não o valor do id.
  Mitigação embutida no plano de teste (seção A).
- 🟡 **Imagem grande em data-URL** — mesmo com o limite de 6 MB, um base64 de ~8 MB no estado pode
  deixar o re-render do preview perceptível a cada tecla no textarea. Mitigação: o limite já corta
  o pior caso; compressão/resize é fora de escopo (story). Se travar na prática, S3+ trata.
- 🟡 **Preview infiel fora do Windows** — fonte Segoe UI não embarcada (`slide-tokens.ts:35`,
  `fonts.ts` inexistente). O preview do Octavio (Windows) é fiel; outro OS diverge. Não bloqueia;
  pendência de infra pré-deploy Linux (herdada da S1).
- 🟢 **`noUncheckedIndexedAccess`** — acessos a `slides[i]` retornam `T | undefined`; o reducer e
  a UI precisam de narrowing (`?.`, guarda de índice). Já previsto nas assinaturas; sem atalho.
- 🟢 **Novos componentes shadcn adicionam deps Radix** — `input`/`label`/`switch`/`textarea`
  trazem `@radix-ui/react-label` e `@radix-ui/react-switch`. Deps mantidas e necessárias
  (gate de dependência ok).
- 🟢 **Reset do `input[type=file].value`** — sem limpar `e.target.value`, reenviar o mesmo arquivo
  após remover não dispara `onChange`. Previsto no fluxo do handler (passo 5).

---

## Fora de escopo (reafirmado)

- Banco / persistência / auth / perfis salvos → S3. Recarregar perde tudo (aceitável).
- Storage remoto (Vercel Blob) → S3. Upload é só data-URL em memória.
- Export / download de PNG / ZIP → S4. `export-png.ts` **não** é acionado; **sem** nó-de-captura.
- Geração por IA (Claude API) → S5.
- Auto-fit de texto por overflow → fora desde a S1.
- Editar tamanho de fonte → derivado de `imageUrl` (46/52), não exposto.
- Drag-and-drop → reorder só por ↑/↓.
- Compressão/resize de imagem → só validação (tipo + tamanho).
- Alterar o contrato `SlideData` / tocar o `<Slide>` → composição por cima, isolamento total.
- Multi-cliente / config por cliente → S6.

---

## Clarificações pendentes

Nenhuma. As 7 perguntas do research foram decididas pelo CEO e fixadas na story; esta spec
detalha o *como* dentro dessas decisões sem introduzir novas ambiguidades.

---

## GATE humano — aprovação da abordagem

Pare aqui. Antes de qualquer código (estágios 04/05/06), o humano aprova esta abordagem.

**Resumo para decisão:** editor `/editor` = 1 Client Component-página + `useReducer` com reducer
**puro extraído** (`src/lib/editor-state.ts`, testável sem DOM) + validação de upload por função
pura (`src/lib/image-upload.ts`, sem Zod) + preview reusando `<Slide>` escalado por
`transform: scale()`. Contrato `SlideData` intocado. Sem banco, sem export, sem DnD, sem lib de
estado. Instala 4 componentes shadcn (`input`, `textarea`, `label`, `switch`).

**Pergunta objetiva:** aprova este desenho para a implementação (04/05/06), ou quer ajustar algum
ponto (largura do preview 420px? iniciar com 1 slide vs 0? granularidade dos componentes)?

A spec é barata de mudar agora; o código, depois, não é.
