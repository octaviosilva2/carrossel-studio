# Story — Export do carrossel (PNG por slide + ZIP)

## User Story
Como Octavio (operador que monta carrosséis para clientes no editor), quero
exportar todos os slides do carrossel aberto como PNGs 1080×1350 — o slide atual
sozinho ou todos num ZIP — para que eu tenha os arquivos prontos para publicar no
Instagram sem sair da ferramenta nem editar imagem por fora.

## Contexto
O motor de render (`<Slide>` 1080×1350 determinístico) e o export de um slide
único já existem desde a S1. A S4 generaliza isso para os N slides do carrossel
carregado no editor, adiciona empacotamento em ZIP e trata a imagem cross-origin
do Vercel Blob (herança da S3) que hoje quebraria o canvas.

## Critérios de aceite

### Export de todos os slides (ZIP)
- [ ] Dado um carrossel com N slides (N ≥ 1) aberto no `/editor`, quando clico em
      "Baixar ZIP", então baixo um único arquivo `.zip` contendo exatamente N
      arquivos PNG, um por slide.
- [ ] Dado o ZIP baixado, quando abro cada PNG, então cada um mede **exatamente
      1080×1350 px** (sem escala, sem 2×).
- [ ] Dado um carrossel com slides em determinada ordem, quando exporto, então os
      arquivos no ZIP seguem a nomeação `slide-01.png`, `slide-02.png`, … com
      zero-pad de 2 dígitos, na **mesma ordem** do array de slides do editor
      (inclusive após reordenar).
- [ ] Dado um carrossel com título, quando baixo o ZIP, então o arquivo se chama
      `<titulo-slugificado>.zip`; dado um carrossel sem título, então se chama
      `carrossel.zip`.
- [ ] Dado um carrossel cujos slides usam imagem hospedada no Vercel Blob
      (URL cross-origin `*.public.blob.vercel-storage.com`), quando exporto,
      então o export conclui **sem `SecurityError`/tainted canvas** e a imagem
      aparece renderizada nos PNGs.

### Download de slide individual
- [ ] Dado um slide selecionado no editor, quando clico em "Baixar slide", então
      baixo um único PNG **1080×1350** correspondente ao slide selecionado, nomeado
      `slide-NN.png` conforme a posição do slide no carrossel.

### Feedback e estados
- [ ] Dado que disparo qualquer export, quando o processo está em andamento,
      então vejo estado de carregamento e, ao terminar, um estado de sucesso ou de
      erro (seguindo o padrão de feedback assíncrono já usado no botão Salvar,
      com `aria-live`).
- [ ] Dado que o export falha (ex.: erro ao gerar um slide), então recebo uma
      mensagem de erro legível e o editor permanece utilizável (sem travar).

### Nitidez / dimensão
- [ ] O export usa `pixelRatio: 1` (1 px de canvas = 1 px CSS), pois o nó de
      captura já é 1080×1350 físico — nitidez máxima na resolução-alvo do
      Instagram. Não há export em 2×. O guardião dimensional
      (`tests/png-dimensions.test.ts`) permanece verde para os PNGs multi-slide.

## Edge cases
- **Carrossel com 0 slides** → botões de export desabilitados (ou bloqueiam com
  aviso "adicione ao menos um slide"). Nenhum arquivo é gerado.
- **Slide com `body` vazio** → exporta normalmente (render é determinístico); gera
  o PNG com o slide em branco. Não bloqueia nem pula.
- **Imagem do Blob indisponível / fetch falha** → o export falha com mensagem de
  erro legível; editor segue utilizável (não fica em loading infinito).
  [Ver pergunta aberta sobre CORS.]
- **Carrossel longo (10–20 slides)** → captura sequencial (não paralela) para não
  estourar memória do browser; export conclui, ainda que mais lento.
- **Avatar/imagem default (data-URL SVG same-origin)** → não taint-a canvas;
  exporta sem tratamento especial.
- **Título com caracteres especiais/acentos** → slugificado para nome de arquivo
  seguro; se resultar vazio, cai no fallback `carrossel.zip`.

## Fora de escopo
- Exportar direto da lista `/carousels` (sem abrir o editor). O gatilho existe
  **só** no `/editor` com o carrossel carregado.
- Export em alta resolução (2×/3×) ou opção configurável de `pixelRatio`.
- Export em outros formatos (JPG, WebP, PDF, vídeo).
- Selecionar um subconjunto de slides para o ZIP (ex.: "exportar só slides 2 e 4").
- Publicação/agendamento automático no Instagram ou qualquer integração externa.
- Export server-side / geração de ZIP no backend (todo o pipeline é client-side).
- Personalizar o nome de cada PNG individualmente pela UI.

## Perguntas abertas
- [PRECISA CLARIFICAR — risco técnico, vai à spec/validação: o CDN do Vercel Blob
  (`*.public.blob.vercel-storage.com`) responde a `fetch()` do browser com CORS
  permissivo, permitindo converter a imagem em data-URL antes do canvas sem
  taint? Se **não**, será preciso configurar CORS no Blob e/ou usar
  `crossOrigin="anonymous"` — possível ação de infra. Não bloqueia a story, mas
  define a viabilidade da mitigação preferida.]
- [PRECISA CLARIFICAR — produto/CEO: confirmar os defaults do CTO abaixo (o CTO
  os recomenda; basta o CEO chancelar ou ajustar):
  - manter **1080×1350 exatos** com `pixelRatio: 1`, sem export em 2× (o pedido
    citava "nitidez/devicePixelRatio" — a arquitetura de render em tamanho real já
    satisfaz nitidez na resolução-alvo);
  - gatilho **apenas no editor**, não na lista `/carousels`;
  - nomeação `slide-NN.png` + ZIP `<titulo-slug>.zip` / `carrossel.zip`;
  - slide com body vazio **exporta** (não pula); bloqueio só com 0 slides.]
