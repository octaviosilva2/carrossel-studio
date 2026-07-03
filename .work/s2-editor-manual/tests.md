# Testes — S2: Editor manual de carrossel

> Estágio 06 do pipeline dev-agents. Prova que os critérios de aceite da story e os
> edge cases estão cobertos por testes reais e executados. Alvo: lógica pura (reducer +
> validação de upload) com Vitest, mais fumaça de integração da página `/editor`.
> Nenhum código de produção foi alterado.

## Arquivos de teste criados

| Arquivo | Nº de testes | Foco |
|---|---|---|
| `tests/editor-reducer.test.ts` | 43 | Reducer puro (`editorReducer`, `initialState`, `toSlideData`, `DEFAULT_AVATAR_DATA_URL`) — sem DOM. |
| `tests/image-upload.test.ts` | 7 | Validação pura (`validateImageFile`, `MAX_IMAGE_BYTES`) — bytes sintéticos, `size` sobrescrito. |
| `tests/editor-page.test.tsx` | 5 | Fumaça de integração da página `/editor` (@testing-library/react, padrão da S1). |

Total S2: **55 testes novos**. Somados aos **15 da S1** (11 de `<Slide>` + 4 de dimensão PNG) = **70 testes**, todos verdes.

---

## Critérios de aceite → testes

### Rota e acesso
- [x] `/editor` renderiza sem erro → `editor-page.test.tsx: renderiza sem erro e mostra 1 slide no preview` — PASSOU
- [ ] Home tem link visível para `/editor` → **fora do escopo de teste** (link estático na `src/app/page.tsx`; sem lógica; verificado por type-check/build no 05). Justificado abaixo.

### Identidade compartilhada
- [x] Bloco de identidade separado (nome/handle/avatar/selo) → coberto pela estrutura do estado + `initialState` (`editor-reducer.test.ts: initialState`) e render da página — PASSOU
- [x] Editar nome reflete em todos os slides → `editor-reducer.test.ts: UPDATE_IDENTITY atualiza o name e nao toca nos slides` (identidade é única no estado, montada em cada slide via `toSlideData`) — PASSOU
- [x] Editar handle sem "@" → `editor-reducer.test.ts: guarda o handle EXATAMENTE como recebido (sem '@')` — PASSOU
- [x] Selo verificado on/off reflete em todos → `editor-reducer.test.ts: TOGGLE_VERIFIED inverte o selo` + `nao toca nos slides` — PASSOU
- [x] Avatar único reflete em todos → `editor-reducer.test.ts: SET_AVATAR troca a avatarUrl` + `REMOVE_AVATAR volta ao placeholder` — PASSOU

### Edição por slide
- [x] Campo de corpo multi-linha; `\n\n` separa blocos → `editor-reducer.test.ts: preserva quebras de linha duplas (\n\n) no body` (separação em parágrafos é do `<Slide>`, coberta na S1 `slide.test.tsx`) — PASSOU
- [x] Editar corpo do slide atual não altera os outros → `editor-reducer.test.ts: UPDATE_SLIDE_BODY nao altera o corpo dos outros slides` — PASSOU
- [x] Adicionar imagem ao slide atual → `editor-reducer.test.ts: SET_SLIDE_IMAGE define a imagem SO do slide alvo` — PASSOU
- [x] Remover imagem do slide atual → `editor-reducer.test.ts: REMOVE_SLIDE_IMAGE remove a imagem SO do slide alvo (vira undefined)` — PASSOU
- [x] Imagem é por-slide (não afeta os outros) → `editor-reducer.test.ts: SET_SLIDE_IMAGE nao afeta a imagem dos outros slides` + `REMOVE_SLIDE_IMAGE nao afeta os outros slides` — PASSOU

### Slides: adicionar, remover, navegar, reordenar
- [x] "Adicionar slide" cria slide vazio ao fim e vira selecionado → `editor-reducer.test.ts: ADD_SLIDE acrescenta um slide vazio AO FIM` + `torna o novo slide o selecionado`; integração em `editor-page.test.tsx: clicar 'Adicionar slide' cria um novo item` — PASSOU
- [x] Clicar num slide o torna selecionado → `editor-reducer.test.ts: SELECT_SLIDE com id valido muda a selecao` — PASSOU
- [x] Remover slide → seleção passa para vizinho válido → `editor-reducer.test.ts: ao remover o SELECIONADO com vizinhos, seleciona o vizinho (min(indice, len-1))` — PASSOU
- [x] Mover ↑ troca com anterior; sem efeito no primeiro → `editor-reducer.test.ts: move para cima troca com o vizinho anterior` + `move para cima no PRIMEIRO slide e no-op (mesma referencia)` — PASSOU
- [x] Mover ↓ troca com seguinte; sem efeito no último → `editor-reducer.test.ts: move para baixo troca com o vizinho seguinte` + `move para baixo no ULTIMO slide e no-op (mesma referencia)` — PASSOU
- [x] Reordenar não altera identidade → `editor-reducer.test.ts: MOVE_SLIDE nao altera identity nem theme` — PASSOU

### Preview ao vivo
- [x] Preview usa o `<Slide>` existente (motor não recriado) → `editor-page.test.tsx: mostra 1 slide no preview (.slide no DOM)` (o `.slide` só existe se o `<Slide>` da S1 renderizou) — PASSOU
- [x] Qualquer edição atualiza o preview sem "atualizar" → `editor-page.test.tsx: editar o corpo do slide reflete na navegacao` (o texto propaga a lista + textarea + preview no mesmo render) — PASSOU
- [x] `toSlideData` monta o `SlideData` que alimenta o preview → `editor-reducer.test.ts: toSlideData monta o SlideData combinando identidade + slide + tema` + `preserva imageUrl undefined` — PASSOU

### Tema global
- [x] Toggle único de tema (claro/escuro) → `editor-reducer.test.ts: SET_THEME muda o tema para dark` — PASSOU
- [x] Alternar tema reflete em todos os slides → mesmo teste + `SET_THEME nao toca nos slides nem na identidade` (tema é global no estado, aplicado a cada slide via `toSlideData`) — PASSOU

### Validação de upload
- [x] Não-imagem rejeitada com aviso, preview não muda → `image-upload.test.ts: rejeita arquivo nao-imagem (application/pdf)`; integração em `editor-page.test.tsx: upload de arquivo nao-imagem mostra erro e NAO altera o preview` — PASSOU
- [x] Acima do limite (6 MB) rejeitado; abaixo aceito → `image-upload.test.ts: rejeita imagem acima do limite (MAX + 1)` + `aceita imagem exatamente no limite` + `aceita image/png pequena` — PASSOU
- [x] Upload rejeitado não altera o estado → `editor-page.test.tsx: upload nao-imagem ... NAO altera o preview` (`.slide` continua no DOM após o PDF) — PASSOU

---

## Edge cases cobertos

- Avatar vazio (estado inicial) → `editor-reducer.test.ts: usa o avatar DEFAULT (data-URL), nunca string vazia` — PASSOU
- Carrossel com 0 slides / remover o último → `editor-reducer.test.ts: ao remover o UNICO slide, vira estado vazio (slides=[], selectedSlideId=null)`; integração em `editor-page.test.tsx: remover o unico slide leva ao estado vazio: some o .slide e aparece o CTA` — PASSOU
- Nenhuma seleção apontando para índice inexistente → coberto pelo teste acima (`selectedSlideId=null`) + `SELECT_SLIDE com id inexistente e no-op` — PASSOU
- Corpo totalmente vazio → `slide.test.tsx` (S1) prova que o `<Slide>` renderiza só header sem parágrafos; `initialState` nasce com corpo vazio e renderiza (`editor-page.test.tsx`) — PASSOU
- Imagem muito grande bloqueada → `image-upload.test.ts: rejeita imagem acima do limite (MAX + 1)` — PASSOU
- Arquivo não-imagem rejeitado, estado inalterado → `image-upload.test.ts` + `editor-page.test.tsx` (acima) — PASSOU
- Mover ↑ no primeiro / ↓ no último = sem efeito → `editor-reducer.test.ts: no-op (mesma referencia)` (asserido `next === prev`) — PASSOU
- id inexistente em SELECT/MOVE/REMOVE = no-op → `editor-reducer.test.ts` (3 casos "com id inexistente e no-op") — PASSOU
- Recarregar perde tudo → sem persistência nesta fatia; **não testável / aceitável por design** (story). Não há código de save para testar.

Extras (robustez além dos critérios):
- Pureza do reducer (não muta o estado de entrada) → `editor-reducer.test.ts: pureza do reducer` (2 testes) — PASSOU
- Arquivo sem `type` (string vazia) rejeitado → `image-upload.test.ts` — PASSOU
- `MAX_IMAGE_BYTES === 6*1024*1024` → `image-upload.test.ts` — PASSOU

---

## Resultado da rodada

Comando: `npm run test` (vitest run)

```
 ✓ tests/image-upload.test.ts   (7 tests)
 ✓ tests/editor-reducer.test.ts (43 tests)
 ✓ tests/png-dimensions.test.ts (4 tests)   ← S1
 ✓ tests/slide.test.tsx         (11 tests)  ← S1
 ✓ tests/editor-page.test.tsx   (5 tests)

 Test Files  5 passed (5)
      Tests  70 passed (70)
```

**70 passaram, 0 falharam.** (55 novos da S2 + 15 da S1, que continuam verdes.)

Comando: `npm run type-check` (tsc --noEmit, strict + noUncheckedIndexedAccess)

```
> tsc --noEmit
(sem erros)
```

Gate real da spec (`type-check` + `test`) — **ambos verdes.**

### Falhas encontradas durante o desenvolvimento

Nenhuma falha no código de produção. Duas falhas iniciais foram de **seletor do próprio
teste C** (não do app):
1. `getByText("Slides").closest("div")` pegava o `CardTitle`, não o Card inteiro.
2. `getByText("Ideia nova")` falhava por unicidade — o texto propaga corretamente
   para 3 lugares (lista, textarea, preview `<Slide>`), o que é o **comportamento
   esperado**. Ajustei a asserção para `getAllByText` (prova a propagação) sem tocar
   no código. Ambos corrigidos no teste, não no produto.

Nenhum bug do reducer, da validação ou da UI. O código do 05 cumpre a spec.

---

## O que ficou de fora e por quê

- **Link da home → `/editor`** (`src/app/page.tsx`): é `<Link href="/editor">` estático,
  sem lógica condicional. Testá-lo seria testar o framework (Next `<Link>`). Verificado
  pelo type-check/build do 05. Baixo valor de teste unitário.
- **`readFileAsDataUrl`**: wrapper fino sobre `FileReader` (API de browser). Seu efeito
  observável (a data-URL cair no estado via `SET_SLIDE_IMAGE`) já é coberto pelo reducer;
  o caminho de erro é `reject` puro. O valor real está no dispatch, testado. Cobrir o
  `FileReader` em jsdom seria testar a plataforma, não a nossa regra.
- **Preview escalado (`transform: scale`, fórmula 420/1080)**: CSS determinístico, sem
  lógica de negócio. O `<Slide>` interno já tem 15 testes na S1 (dimensão 1080×1350,
  temas, selo, corpo 46/52). Testar o valor do `scale` seria acoplar ao número mágico
  sem provar comportamento do usuário.
- **Separação de `\n\n` em parágrafos e fontSize 46/52**: comportamento **derivado do
  `<Slide>`**, já coberto por `slide.test.tsx` (S1). Aqui só garantimos que o reducer
  preserva o `\n\n` no `body` e que o `imageUrl` chega ao `SlideData`.
- **Fidelidade de fonte / render pixel-perfect fora do Windows**: pendência de infra
  herdada da S1 (fonte Segoe UI não embarcada), fora do escopo desta fatia.

---

## Definição de "feito" — atendida

- [x] Todo critério de aceite testável tem teste (o único não-testável, o link estático, está justificado).
- [x] Todo edge case tem teste (exceto "recarregar perde tudo", que não tem código para testar — por design).
- [x] Testes determinísticos, testando comportamento observável (ids não-determinísticos → asserção de shape; `next === prev` para no-op).
- [x] Suíte rodada com saída real colada: 70 passaram, 0 falharam.
- [x] Type-check verde.
- [x] Nenhum código de produção alterado para "fazer passar". Bugs de seletor eram do teste, corrigidos no teste.
