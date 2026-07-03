# Validação — S2: Editor manual de carrossel (estado local, sem banco)

> Estágio 07 (validator) do pipeline dev-agents. Auditoria independente da entrega
> S2 contra a story aprovada. Quem valida não conserta: achados viram devolução com
> evidência, não edição de código. Gates rodados por mim; saída real colada abaixo.

**Slug:** `s2-editor-manual` · **Data:** 2026-07-01 · **Branch:** main

---

## Gates objetivos (rodados por mim)

| Gate | Comando | Resultado |
|---|---|---|
| Type-check | `npm run type-check` (`tsc --noEmit`, strict + `noUncheckedIndexedAccess`) | ✅ **limpo** (0 erros) |
| Testes | `npm run test` (`vitest run`) | ✅ **70/70 passaram** (5 arquivos) |
| Build | `npm run build` (`next build`) | ✅ **compilou**; rota `/editor` no build (9.49 kB, static ○) |

### Saída — `npm run test`

```
 ✓ tests/image-upload.test.ts   (7 tests)    5ms
 ✓ tests/editor-reducer.test.ts (43 tests)  13ms
 ✓ tests/png-dimensions.test.ts (4 tests)   13ms   ← S1
 ✓ tests/slide.test.tsx         (11 tests)  75ms   ← S1
 ✓ tests/editor-page.test.tsx   (5 tests)  254ms

 Test Files  5 passed (5)
      Tests  70 passed (70)
```

- **55 novos (S2)** = 43 reducer + 7 upload + 5 fumaça de página. **15 da S1** (11 `<Slide>` + 4 dimensão PNG) **continuam verdes → zero regressão.**
- A contagem bate exatamente com o que o tester (06) alegou.

### Saída — `npm run build` (rotas)

```
Route (app)                     Size  First Load JS
┌ ○ /                          162 B         106 kB
├ ○ /_not-found                994 B         103 kB
├ ○ /editor                  9.49 kB         123 kB   ← rota nova, prerendered static
└ ○ /render-test             9.03 kB         119 kB
```

`/editor` entra no build como página estática — sem erro de compilação nem de tipos.

---

## Critérios de aceite — veredito por critério

### Rota e acesso

| Critério | Veredito | Evidência |
|---|---|---|
| Existe `/editor` e renderiza sem erro | ✅ ATENDE | `src/app/editor/page.tsx:18`; build lista `/editor` static; `editor-page.test.tsx:12-16` (`.slide` no DOM). |
| Home tem link visível para `/editor` | ✅ ATENDE | `src/app/page.tsx:18-20` — `<Button asChild size="lg"><Link href="/editor">Abrir o editor de carrossel</Link></Button>`. |

### Identidade compartilhada (editada uma vez → todos os slides)

| Critério | Veredito | Evidência |
|---|---|---|
| Bloco de identidade separado (nome/handle/avatar/selo) | ✅ ATENDE | `identity-panel.tsx:72-166`; estado único em `editor-state.ts:11-18` (`CarouselIdentity`), fora do array de slides. **Identidade não é duplicada por slide** — o `SlideData` é composto por `toSlideData` (`editor-state.ts:263-277`). |
| Editar nome reflete em todos | ✅ ATENDE | `UPDATE_IDENTITY` (`editor-state.ts:107-113`) muda só `identity`; cada preview monta `toSlideData(identity, …)`. Teste `editor-reducer.test.ts:70-79`. |
| Editar handle reflete em todos; input sem "@" | ✅ ATENDE | Strip no `onChange` (`identity-panel.tsx:37-40`, `replace(/@/g,"")`); reducer guarda cru (`editor-reducer.test.ts:81-89`). O `<Slide>` prefixa "@" (contrato `types.ts:9`). |
| Selo on/off reflete em todos | ✅ ATENDE | `TOGGLE_VERIFIED` (`editor-state.ts:131-136`); `Switch` em `identity-panel.tsx:160-164`. Teste `editor-reducer.test.ts:104-118`. Selo/offset é comportamento do `<Slide>` (S1, intocado). |
| Avatar único reflete em todos | ✅ ATENDE | `avatarUrl` único em `identity` (`editor-state.ts:16`); `SET_AVATAR`/`REMOVE_AVATAR` (`editor-state.ts:115-129`). Teste `editor-reducer.test.ts:120-135`. |

### Edição por slide (corpo e imagem)

| Critério | Veredito | Evidência |
|---|---|---|
| Campo de corpo multi-linha; `\n\n` separa blocos | ✅ ATENDE | `Textarea` em `slide-editor.tsx:85-99`; `UPDATE_SLIDE_BODY` preserva `\n\n` (`editor-reducer.test.ts:231-241`). Split em parágrafos é do `<Slide>` (S1). |
| Editar corpo do atual não afeta os outros | ✅ ATENDE | `.map` só toca o `id` alvo (`editor-state.ts:217-225`); teste `editor-reducer.test.ts:220-229`. |
| Adicionar imagem via upload local com preview | ✅ ATENDE | `handleImageChange` → `readFileAsDataUrl` → `SET_SLIDE_IMAGE` (`slide-editor.tsx:36-59`); preview reativo via `toSlideData`. |
| Remover imagem volta a render sem imagem | ✅ ATENDE | `REMOVE_SLIDE_IMAGE` → `imageUrl: undefined` (`editor-state.ts:239-247`); botão em `slide-editor.tsx:115-125`. Corpo 46→52 é derivado no `<Slide>` (S1). |
| Imagem é por-slide | ✅ ATENDE | `SET/REMOVE_SLIDE_IMAGE` só no `id` alvo; testes `editor-reducer.test.ts:259-292`. |

### Slides: adicionar, remover, navegar, reordenar

| Critério | Veredito | Evidência |
|---|---|---|
| "Adicionar slide" cria slide vazio ao fim e vira selecionado | ✅ ATENDE | `ADD_SLIDE` (`editor-state.ts:149-161`, push ao fim + seleciona novo); botão `slide-nav.tsx:42-49`; testes `editor-reducer.test.ts:157-183` + fumaça `editor-page.test.tsx:18-30`. |
| Clicar num slide o seleciona | ✅ ATENDE | `SELECT_SLIDE` com guarda de existência (`editor-state.ts:142-147`); botão `slide-nav.tsx:74-88`. Teste `editor-reducer.test.ts:188-204`. |
| Remover → seleção passa a vizinho válido (ou vazio se era o último) | ✅ ATENDE | `REMOVE_SLIDE` com `min(idx, len-1)` (`editor-state.ts:163-193`); testes `editor-reducer.test.ts:363-414` cobrem selecionado c/ vizinhos, último da lista, único (→ null) e não-selecionado. |
| Mover ↑ troca com anterior; disabled/no-op no primeiro | ✅ ATENDE | `MOVE_SLIDE up` (`editor-state.ts:195-215`); botão `disabled={isFirst}` (`slide-nav.tsx:96`); testes `editor-reducer.test.ts:298-338` (troca + `next===prev` na ponta). |
| Mover ↓ troca com seguinte; disabled/no-op no último | ✅ ATENDE | `MOVE_SLIDE down`; `disabled={isLast}` (`slide-nav.tsx:115`); testes `editor-reducer.test.ts:308-348`. |
| Reordenar não altera identidade | ✅ ATENDE | `MOVE_SLIDE`/`REMOVE_SLIDE` retornam `identity`/`theme` por referência; teste `editor-reducer.test.ts:418-435` (`next.identity === prev.identity`). |

### Preview ao vivo (reuso do `<Slide>` da S1)

| Critério | Veredito | Evidência |
|---|---|---|
| Preview usa o `<Slide>` existente (motor não recriado) | ✅ ATENDE | `theme-preview.tsx:5` importa `Slide` de `@/components/slide/slide`; `git diff` de `src/components/slide/*` **vazio** (intocado). Teste `editor-page.test.tsx:15` — `.slide` no DOM só existe se o `<Slide>` da S1 renderizou. |
| Escalado por `transform: scale()` sobre nó 1080×1350; sem `zoom`, sem alterar width/height | ✅ ATENDE | `theme-preview.tsx:26-27` (`PREVIEW_SCALE = 420/CANVAS_W`), container interno `width: CANVAS_W, height: CANVAS_H, transform: scale(...)` (`theme-preview.tsx:87-94`). Nenhum `zoom` no código. Padrão idêntico ao `render-test` validado na S1. |
| Qualquer edição atualiza o preview sem "atualizar" | ✅ ATENDE | Estado no `useReducer` da página (`page.tsx:19`) → re-render React propaga a `ThemePreview`. Teste `editor-page.test.tsx:70-82` (edição do corpo propaga a 3 pontos no mesmo render). |

### Tema global

| Critério | Veredito | Evidência |
|---|---|---|
| Toggle único de tema (claro/escuro) | ✅ ATENDE | `Switch` único em `theme-preview.tsx:59-66` → `SET_THEME`. |
| Alternar tema reflete em todos via `data.theme` | ✅ ATENDE | `theme` global (`editor-state.ts:36`), passado a cada `toSlideData`; teste `editor-reducer.test.ts:140-153`. Independente do `.dark` do Tailwind (é `data.theme` do `<Slide>`, não classe de plataforma). |

### Validação de upload

| Critério | Veredito | Evidência |
|---|---|---|
| Não-imagem rejeitada com aviso; preview não muda | ✅ ATENDE | `validateImageFile` (`image-upload.ts:16-19`); handler seta erro e retorna sem dispatch (`slide-editor.tsx:42-47`, `identity-panel.tsx:48-53`). Testes `image-upload.test.ts:27-43` + fumaça `editor-page.test.tsx:48-68` (erro visível, `.slide` intacto). |
| Acima de 6 MB rejeitado; abaixo aceito | ✅ ATENDE | `image-upload.ts:6,20-22`; testes `image-upload.test.ts:47-76` cobrem MAX+1 (rejeita), MAX exato (aceita), pequena (aceita), e `MAX_IMAGE_BYTES === 6*1024*1024`. |
| Upload rejeitado não altera o estado | ✅ ATENDE | Falha fechada: retorna **antes** de qualquer `dispatch` (`slide-editor.tsx:42-47`). Estado do reducer inalterado. Teste de fumaça confirma `.slide` preservado. |

---

## Edge cases da story

| Edge case | Veredito | Evidência |
|---|---|---|
| Avatar vazio → placeholder default (nunca `<img src="">`) | ✅ ATENDE | `DEFAULT_AVATAR_DATA_URL` (SVG inline same-origin, `editor-state.ts:65-74`); `initialState.avatarUrl` = default (`editor-state.ts:87`); `REMOVE_AVATAR` volta ao default. Teste `editor-reducer.test.ts:55-58,130-135`. |
| 0 slides → CTA sem crash | ✅ ATENDE | `selectedSlideId===null` → `ThemePreview` mostra CTA e **não** renderiza `<Slide>` (`theme-preview.tsx:70-79`); `SlideEditor` mostra CTA (`slide-editor.tsx:74-79`). Fumaça `editor-page.test.tsx:32-46` (some `.slide`, aparece CTA). |
| Corpo vazio → só header (válido) | ✅ ATENDE | `initialState` nasce com corpo vazio e renderiza (`editor-page.test.tsx:12-16`); comportamento do `<Slide>` coberto na S1 (`slide.test.tsx`). |
| Upload não-imagem rejeitado, estado inalterado | ✅ ATENDE | Ver validação de upload acima. |
| Imagem >6 MB rejeitada | ✅ ATENDE | `image-upload.test.ts:47-56`. Sem resize (fora de escopo, correto). |
| Remover o último slide → estado vazio, sem índice inválido | ✅ ATENDE | `editor-state.ts:173-175` (`slides=[]`, `selectedSlideId=null`); teste `editor-reducer.test.ts:388-397`. |
| Mover ↑ no primeiro / ↓ no último = no-op | ✅ ATENDE | Botões `disabled` nas pontas (`slide-nav.tsx:96,115`) **e** reducer retorna `next===prev` (`editor-state.ts:202`; testes `editor-reducer.test.ts:330-348`). Dupla proteção (UI + lógica). |
| Recarregar perde tudo | ✅ ATENDE (por design) | Sem `localStorage`/persistência (grep confirma); aceitável nesta fatia (S3 traz banco). Nada a testar. |

---

## Segurança (baseline + auditoria ativa)

Superfície desta fatia = **uma** borda de input: o `File` do usuário. Percorri os vetores OWASP relevantes:

- **Injeção / XSS:** o `body` do usuário vai a `data.body` e é renderizado pelo `<Slide>` (React JSX, escapado por padrão). Nenhum `dangerouslySetInnerHTML` nos componentes do editor (grep). Avatar/imagem entram como `data-URL` em `<img src>`, não como HTML. 🟢 sem achado.
- **Input não confiável:** `validateImageFile` valida tipo (MIME `image/`) e tamanho (≤6 MB) **antes** de qualquer uso; `accept="image/*"` é só UX, a validação em JS é a defesa real (`image-upload.ts:16-23`). **Falha fechada** — rejeição retorna sem dispatch, estado imutável. 🟢 conforme.
- **Segredos / PII:** nenhum token, chave ou connection string nesta fatia (100% client, sem rede). `data-URL` fica só em memória do browser, nunca sai da máquina. 🟢 sem achado.
- **Authz / rede:** N/A — sem API, sem banco, sem auth nesta fatia (correto para o escopo).
- 🟢 **Endurecimento observável (não-bloqueio):** `data-URL` de até ~8 MB base64 no estado pode deixar o re-render do preview perceptível ao digitar (o próprio spec §Riscos já sinaliza). O limite de 6 MB corta o pior caso; compressão é fora de escopo. Sem ação nesta fatia.

**Nenhum achado 🔴 ou 🟡 de segurança.**

---

## Escopo (entregou além? faltou?)

Confirmado por grep nos componentes do editor e no `package.json`:

- **Sem export/ZIP:** nenhuma referência a `export-png`/`jszip` no editor; `src/lib/export-png.ts` sem diff (intocado). ✅
- **Sem banco/persistência/auth:** sem `localStorage`, `fetch`, `/api/`. ✅
- **Sem storage remoto:** upload é `FileReader`→`data-URL`, sem Vercel Blob. ✅
- **Sem IA:** sem `anthropic`/Claude API. ✅
- **Sem DnD:** reorder por botões ↑/↓; `@dnd-kit` ausente do `package.json`. ✅
- **Sem Zod:** validação por função pura; `zod` ausente do `package.json`. ✅
- **Sem lib de estado externa:** `zustand`/`redux` ausentes; só `useReducer`. ✅
- **Deps novas:** apenas `@radix-ui/react-label` e `@radix-ui/react-switch` (dos componentes shadcn `input`/`textarea`/`label`/`switch`) — previstas e justificadas na spec. ✅

**Nada entregue além do escopo; nada faltando.** O `useState` presente é só o erro local de upload inline (previsto na spec §UI), não estado de negócio.

---

## Isolamento da S1 (contrato `SlideData` intocado)

- `src/components/slide/types.ts` **não mudou** (`git diff` vazio) — `SlideData`/`SlideTheme` idênticos ao contrato congelado (`types.ts:4-21`). ✅
- `src/components/slide/*` e `src/lib/export-png.ts` sem diff — reusados como caixa-preta. ✅
- Composição via `toSlideData` (`editor-state.ts:263-277`) — o editor mantém seu próprio `EditorSlide` e monta `SlideData` só na fronteira. Se o contrato mudar no futuro, só esta função muda. ✅
- Os 15 testes da S1 continuam verdes → nenhuma regressão no `<Slide>`/export. ✅

---

## Riscos do research/spec — situação

| Risco (spec §Riscos) | Situação |
|---|---|
| 🟡 `crypto.randomUUID` no reducer = não-determinismo | **Mitigado.** Testes asseram shape/comportamento, não o valor do id (`editor-reducer.test.ts:176-183`). |
| 🟡 `data-URL` grande pesa no re-render | **De pé, controlado.** Limite de 6 MB corta o pior caso; compressão é fora de escopo (S3+). Não bloqueia. |
| 🟡 Preview infiel fora do Windows (fonte woff2 não embarcada) | **De pé — pendência herdada da S1.** Ver nota abaixo. |
| 🟢 `noUncheckedIndexedAccess` (narrowing) | **Tratado.** Guardas de índice no reducer (`editor-state.ts:187-208`) e `?? null` na página (`page.tsx:24-25`). Type-check limpo. |
| 🟢 Reset de `input[type=file].value` | **Tratado.** `e.target.value = ""` no `finally` dos dois handlers (`slide-editor.tsx:57`, `identity-panel.tsx:63`). |

---

## Achados (nenhum bloqueia)

- 🟢 **Cobertura de fumaça do upload aponta para o avatar, não a imagem de slide.** Em `editor-page.test.tsx:54`, `container.querySelector('input[type="file"]')` pega o **primeiro** input do DOM, que é o do avatar (`IdentityPanel` vem antes na árvore, `page.tsx:49`). O teste **prova a rejeição não-imagem de fato**, mas pelo caminho do avatar, não pelo do slide. Impacto baixo: ambos os handlers chamam a mesma `validateImageFile` (pura, coberta por 7 testes de unidade) e têm a mesma estrutura de falha fechada. Sugestão para uma fatia futura, não correção desta. Sem ação.
- 🟢 **`readFileAsDataUrl` sem teste unitário direto** — justificado pelo tester (wrapper fino de API de browser; efeito observável coberto via dispatch). Concordo: testá-lo seria testar a plataforma. Sem ação.

---

## Nota herdada (não-bloqueio)

**Fonte Segoe UI (woff2) não embarcada** — pendência de infra da S1. O preview do editor usa a fonte do SO: **fiel no Windows do Octavio**, pode divergir em outro OS/no deploy Linux. Não é regressão nem furo desta fatia; deve ser resolvido antes do deploy (fatia de infra), não aqui. Registrado como lembrete, não como bloqueio.

---

## Veredito final

**APROVADO** — todos os 26 critérios de aceite e 8 edge cases ATENDEM com evidência; type-check limpo, 70/70 testes verdes (zero regressão na S1), build com `/editor` estático; escopo respeitado, contrato `SlideData` intocado, segurança sem achados 🔴/🟡. Nenhum achado bloqueia (dois 🟢 de baixo impacto). Recomendação ao gate humano: aprovar a fatia; a fonte woff2 segue como pendência de infra pré-deploy, fora do escopo da S2.

---

## GATE humano

Esta é uma **recomendação**, não a palavra final. Octavio decide. A entrega está sólida e honesta: cumpre a story, roda limpo, não invadiu escopo e isolou a S1 como prometido. Se aprovar, a esteira segue para a próxima fatia (S3 — persistência/banco). A única coisa que precisa entrar no radar antes do deploy real é o embarque da fonte, que não pertence a esta fatia.
