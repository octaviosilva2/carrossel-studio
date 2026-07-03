# Story — S1: Fundação + Motor de render (componente do slide → PNG 1080×1350)

## User Story
Como **CTO do Carrossel Studio (Octavio/Claude) construindo a base da plataforma**,
quero **uma app Next.js mínima com o componente React do slide fiel ao modelo Octavio,
capaz de exportar um PNG de exatamente 1080×1350 no browser a partir de dados fixos**,
para que **as fases seguintes (preview ao vivo, geração por IA, export em lote) herdem
um motor de render já provado, sem reabrir a questão "o PNG sai certo?".**

## Critérios de aceite

### Scaffold da app
- [ ] Dado o repositório (hoje greenfield), quando instalo as dependências e rodo o
      projeto em dev, então a app Next.js 15 (App Router) sobe sem erro e serve ao menos
      uma rota acessível no browser.
- [ ] Dado o projeto rodando, quando rodo o type-check e o build de produção, então
      ambos concluem **sem erros** (TypeScript em modo strict, conforme stack aprovada).
- [ ] Dado o scaffold, então estão presentes e configurados: **TypeScript**, **Tailwind**
      e **shadcn/ui** (instalado e utilizável), com a UI base no estilo software moderno
      minimalista (NÃO confundir com as regras fixas do slide).

### Componente do slide (fidelidade visual)
- [ ] Dado o componente React do slide, quando o renderizo, então ele cumpre **fielmente**
      os tokens de `docs/REFERENCIA-VISUAL.md`: canvas 1080×1350, margem horizontal 80,
      conteúdo alinhado à esquerda (largura útil 920), bloco header+texto(+imagem)
      **centralizado na vertical** pelo algoritmo descrito (com/sem imagem).
- [ ] Dado o **tema claro**, então fundo `#FFFFFF`, texto `#14171A`, handle `#536471`,
      borda de imagem `#CFD9DE`.
- [ ] Dado o **tema escuro**, então fundo `#000000`, texto `#FFFFFF`, handle `#71767B`,
      borda de imagem `#2F3336`.
- [ ] Dado o header, então avatar circular 88 px na margem, nome em Bold 42 px, handle
      Regular 36 px, e o **selo verificado = círculo azul `#1D9BF0` com check branco**
      (nunca estrela), exibível on/off; header e texto formam um bloco único.
- [ ] Dado um slide **com imagem**, então a imagem escala pela largura (920), cantos
      arredondados radius 28 com borda 2 px (token de borda), e o corpo usa 46 px;
      dado um slide **sem imagem**, então o corpo usa 52 px. Altura de linha do corpo =
      font-size × 1.52; `\n\n` separa blocos de ideia com o gap de parágrafo.
- [ ] Dado o componente, então o corpo **não** contém barra de engajamento, logo/passarinho
      do X nem emojis (regras invioláveis).
- [ ] Dado o componente, então ele aceita props que cobrem todos os campos do slide
      (**nome, handle, avatar, selo on/off, texto, imagem opcional, tema claro/escuro**),
      formando o contrato que S2/S4/S5 vão reusar.

### Render para PNG (critério central da fatia)
- [ ] Dado o componente do slide com **dados fixos** (avatar, nome, selo, handle, texto e
      imagem), quando aciono o export no browser, então é gerado um arquivo PNG cujas
      dimensões reais são **exatamente 1080×1350 px** — verificável objetivamente (inspeção
      do arquivo / teste que lê width×height).
- [ ] Dado o mesmo fluxo de export, quando comparo o PNG com o componente renderizado na
      tela, então o PNG é **visualmente fiel** ao modelo (mesmas cores, posições, fonte e
      arredondamentos) — sem fonte fallback indevida e sem cantos/cores divergentes.
- [ ] Dado que existem **dois temas**, então o export produz um PNG 1080×1350 fiel tanto
      no **tema claro** quanto no **tema escuro** (ambos verificados com PNG real).
- [ ] Dado uma rota/página de teste com os dados fixos, então é possível disparar o export
      e obter o PNG real — essa página serve de base para o preview da S2.

## Edge cases
- **Slide sem imagem** → render e export usam o layout/centralização "sem imagem" (corpo 52 px),
  e o PNG continua 1080×1350.
- **Texto longo** (estoura a altura útil em S1) → comportamento em S1: usar texto fixo que
  caiba; o auto-ajuste/redução de fonte por overflow é da fatia futura, não desta.
  [PRECISA CLARIFICAR abaixo.]
- **Selo desligado** → o header renderiza nome+handle sem o selo, sem deixar buraco/offset.
- **Avatar/imagem que não carrega** (asset fixo ausente) → em S1 os assets são same-origin/
  locais e devem existir; se um não carregar, o export não deve travar silenciosamente —
  falha visível em vez de PNG corrompido. (CORS de origem externa/Blob é problema de S2/S3,
  fora desta fatia.)
- **Export acionado antes das fontes carregarem** → garantir que a fonte esteja pronta antes
  de exportar, para o PNG não sair com fonte fallback (a técnica é decisão da spec).

## Fora de escopo
- **Qualquer dado dinâmico**: edição de campos, formulário, preview ao vivo reativo (S2).
- **Persistência**: banco, auth, perfis de identidade, salvar/listar carrosséis (S3+).
- **Geração por IA** (Claude API) e qualquer chamada de modelo (S5).
- **Export em lote / ZIP / multi-slide** e fallback server-side de render (S4 — apenas
  *declarado* como caminho futuro, não implementado aqui).
- **Deploy** (Vercel/Blob), CORS de assets externos, upload de avatar/imagem.
- **Múltiplos slides num carrossel**: S1 valida **um** slide por vez.
- **Auto-fit de texto** (reduzir fonte/quebrar por overflow automaticamente) — ver pergunta aberta.
- Escolha de cor/branding da **UI da plataforma** além do "minimalista moderno" base.

## Perguntas abertas
- [PRECISA CLARIFICAR: em S1, o slide de teste deve incluir **auto-ajuste de fonte por
  overflow** (reduzir o corpo se o texto não couber, como faz o Python original), ou basta
  usar texto fixo que comprovadamente cabe e deixar o auto-fit para uma fatia futura?
  Recomendação: deixar fora de S1 — o foco é provar "PNG 1080×1350 fiel", não o motor de
  ajuste de texto.]
- [PRECISA CLARIFICAR: quantos cenários de dados fixos a página de teste deve provar para o
  gate de validação? Mínimo sugerido: 4 PNGs — {claro, escuro} × {com imagem, sem imagem}.
  Confirmar se esse conjunto é suficiente para aprovar a fatia.]

> Nota (não-bloqueante, vai para a spec): como servir **Segoe UI** na web (embarcar woff2 da
> família ou equivalente web fiel) é decisão da spec — afeta fidelidade mas não trava a story.
> A biblioteca de HTML→PNG e a estratégia de DPR/pixelRatio também são da spec.
