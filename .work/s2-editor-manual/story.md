# Story — S2: Editor manual de carrossel (estado local, sem banco)

## User Story
Como **Octavio (operador done-for-you)**, quero **montar um carrossel slide a slide numa
página de editor — definindo a identidade do perfil uma vez, escrevendo o corpo e escolhendo a
imagem de cada slide, com preview ao vivo e controle de tema claro/escuro** —, para que **eu
veja exatamente como o carrossel vai ficar antes de exportar, sem depender de banco, upload
remoto ou IA nesta fatia**.

O editor é uma tela só (`/editor`), 100% em memória. Ele reusa o motor `<Slide>` da S1 como
caixa-preta (não recria render) e prepara o terreno para o export (S4) e a persistência (S3),
que ficam fora desta fatia.

---

## Contexto herdado (fixo — não reabrir)
- Contrato `SlideData` (`src/components/slide/types.ts`) **NÃO muda**. O editor **compõe por
  cima** (envelope com `id` + campos por-slide). O desenho fino do shape é do 03 (spec);
  recomendação registrada em "Notas para o 03".
- **Identidade única compartilhada** por carrossel: `name`, `handle`, `avatarUrl`, `verified`
  são editados **uma vez** e refletem em **todos** os slides. `body` e `imageUrl` são **por
  slide**.
- **Tema** = um **toggle global** do carrossel (claro/escuro), aplicado a todos os slides.
- **Upload local** via `FileReader → data-URL`. Sem storage remoto.
- **Reorder** por **botões mover ↑/↓** (sem drag-and-drop).
- **Sem export** no S2 (PNG/ZIP é 100% S4; `export-png.ts` não é acionado aqui).
- Rota **`/editor`**; a home (`src/app/page.tsx`) ganha um link para ela.

---

## Critérios de aceite

### Rota e acesso
- [ ] Existe a rota `/editor` e ela renderiza o editor sem erro.
- [ ] A home (`src/app/page.tsx`) tem um link visível que navega para `/editor`.

### Identidade compartilhada do perfil (editada uma vez)
- [ ] Há um bloco de "identidade do perfil" com campos: **nome**, **handle**, **avatar** e
  **selo verificado (on/off)** — separado da edição por-slide.
- [ ] Editar o **nome** atualiza o preview de **TODOS** os slides.
- [ ] Editar o **handle** atualiza o preview de todos os slides; o input **não** inclui "@" (o
  `<Slide>` prefixa "@" na render).
- [ ] Ligar/desligar o **selo verificado** reflete em todos os slides (ligado = círculo azul com
  check; desligado = sem selo e sem buraco/offset no header).
- [ ] O **avatar** é único e reflete em todos os slides.

### Edição por slide (corpo e imagem)
- [ ] O slide selecionado tem um campo de **corpo de texto** (multi-linha); duas ou mais quebras
  de linha (`\n\n`) separam blocos, refletido no preview do slide atual.
- [ ] Editar o corpo do slide atual **não** altera o corpo dos outros slides.
- [ ] É possível **adicionar imagem** ao slide atual via upload local (arquivo → data-URL) com
  preview imediato no `<Slide>`.
- [ ] É possível **remover a imagem** do slide atual; ao remover, o preview volta a renderizar
  sem imagem (corpo em tamanho 52 em vez de 46 — comportamento derivado do `<Slide>`, não um
  controle manual).
- [ ] A imagem é **por slide**: adicionar/remover imagem de um slide não afeta os outros.

### Slides: adicionar, remover, navegar, reordenar
- [ ] Ao clicar **"adicionar slide"**, um novo slide (corpo vazio, sem imagem) aparece **ao fim**
  da lista e passa a ser o **selecionado**.
- [ ] Há uma lista/navegação de slides; clicar em um slide o torna o **selecionado** e o editor +
  preview refletem esse slide.
- [ ] Clicar **"remover slide"** remove o slide selecionado; a seleção passa para um slide vizinho
  válido (ou para o estado vazio se era o último — ver Edge cases).
- [ ] Botão **mover ↑** troca o slide selecionado com o anterior (posições trocam na lista e o
  preview reflete); desabilitado/sem efeito quando já é o primeiro.
- [ ] Botão **mover ↓** troca o slide selecionado com o seguinte; desabilitado/sem efeito quando
  já é o último.
- [ ] Reordenar **não** altera a identidade do perfil (nome/handle/avatar/selo continuam iguais).

### Preview ao vivo (reuso do `<Slide>` da S1)
- [ ] O preview usa o componente `<Slide>` existente (`src/components/slide/slide.tsx`) — o motor
  de render **não** é recriado.
- [ ] O preview é escalado por `transform: scale()` sobre um nó de 1080×1350 px reais (padrão já
  validado em `src/app/render-test/page.tsx`); **não** usa `zoom` nem altera `width/height` do nó.
- [ ] Qualquer edição (identidade, corpo, imagem, tema) atualiza o preview do slide atual sem
  ação manual de "atualizar".

### Tema global do carrossel
- [ ] Há um **toggle único** de tema (claro/escuro) do carrossel.
- [ ] Alternar o tema reflete em **todos** os slides (via `data.theme`), independente do dark mode
  da plataforma (Tailwind `.dark`).

### Validação de upload (primeira borda de input do projeto)
- [ ] Upload de arquivo **não-imagem** é **rejeitado** com aviso ao usuário (o preview não muda).
- [ ] Upload de imagem acima do **limite de tamanho** (proposta: **6 MB**) é **rejeitado** com
  aviso; abaixo do limite é aceito.
- [ ] Um upload rejeitado não altera o estado (a imagem anterior do slide, se houver, permanece).

---

## Edge cases
- **Avatar vazio (estado inicial / não enviado)** → o `<Slide>` não tem guarda para `avatarUrl`
  vazio (`<img src="">` = ícone quebrado). O editor deve exibir um **avatar placeholder/default
  válido** desde o estado inicial, de modo que o preview nunca renderize imagem quebrada. (Como
  fazer — placeholder em `public/` vs data-URL default — é decisão do 03.)
- **Carrossel com 0 slides** (ex.: removeu o último) → o editor mostra um **estado vazio** com CTA
  "adicione um slide"; **não** renderiza `<Slide>` nem crasha.
- **Corpo totalmente vazio** → o `<Slide>` renderiza só o header (zero parágrafos). É comportamento
  **válido**, não é erro — o preview mostra o header sozinho.
- **Imagem muito grande** → bloqueada pelo limite de tamanho na validação de upload (evita
  data-URL pesada travando o preview). Sem resize/compressão (fora de escopo).
- **Arquivo não-imagem no upload** → rejeitado com aviso; estado inalterado.
- **Remover o último slide** → carrossel vai para 0 slides = estado vazio (acima); nenhuma
  seleção fica apontando para índice inexistente.
- **Mover ↑ no primeiro slide / mover ↓ no último** → sem efeito (controles desabilitados ou
  no-op); nunca produz índice inválido.
- **Recarregar a página** → perde tudo (sem persistência). **Aceitável** nesta fatia (S3 traz
  banco). O editor não promete salvar.

---

## Fora de escopo (explícito)
- **Banco / persistência / auth / perfis salvos** → S3. Recarregar perde tudo (aceitável).
- **Storage remoto (Vercel Blob)** → S3. Upload é só local (data-URL em memória).
- **Export / download de PNG / ZIP em lote** → S4. `export-png.ts` **não** é acionado no S2.
- **Geração por IA (Claude API)** → S5.
- **Auto-fit de texto** (reduzir fonte por overflow) → fora desde a S1; textos que estouram
  divergem, sem tratamento.
- **Editar tamanho de fonte manualmente** → `fontSize` é derivado de `imageUrl` (46 com / 52
  sem), não é controle exposto.
- **Drag-and-drop** para reordenar → reorder é só por botões ↑/↓ (zero dependência nova).
- **Embarque de fonte woff2** → pendência de infra; o preview usa a fonte do SO (fiel no Windows
  do Octavio, pode divergir em outro OS). Não bloqueia o editor.
- **Compressão/resize de imagem no upload** → só validação (tipo + tamanho), sem otimização.
- **Multi-cliente / config por cliente** → S6.

---

## Notas para o 03 (spec) — não é decisão desta story
- **Não alterar o contrato `SlideData`** (`src/components/slide/types.ts`) — compor por cima.
  Recomendação: envelope por slide `{ id: string; body: string; imageUrl?: string }` +
  **identidade do carrossel** separada (`name`, `handle`, `avatarUrl`, `verified`) + `theme`
  global; ao passar para `<Slide>`, montar o `SlideData` combinando identidade + slide + tema. O
  desenho fino (shape exato, `useReducer` vs `useState`, quais componentes shadcn) é do 03.
- **Limite de upload proposto: 6 MB** — valor sensato para não travar o preview com data-URL
  pesada. O 03/CEO pode ajustar dentro da faixa 5–8 MB.

---

## Perguntas abertas
- Nenhuma. As 7 perguntas do research foram decididas pelo CEO e estão fixadas em "Contexto
  herdado".
