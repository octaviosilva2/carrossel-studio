# REFERÊNCIA VISUAL — Slide do carrossel (fonte da verdade)

> Valores **exatos** do slide (o PNG de saída), extraídos da skill original
> `../carrossel-treets-modelo-octavio/render_pillow.py` (o renderizador Pillow que já
> produz o modelo aprovado). O componente React da S1 deve **portar estes números
> fielmente**. Estas regras são imutáveis — não são a UI da plataforma, são o produto.

## Canvas
- Dimensão final: **1080 × 1350 px** (exato, sempre).
- Margem horizontal: **80 px** (conteúdo alinhado à **esquerda**).
- Largura útil de conteúdo: **920 px** (1080 − 80×2).
- Padding vertical mínimo (`VERT_PAD`): **60 px**.
- Header + texto (+ imagem) são **centralizados na vertical** como um bloco único.

## Cores por tema
| Token | Light | Dark |
|---|---|---|
| Fundo | `#FFFFFF` | `#000000` |
| Texto | `#14171A` | `#FFFFFF` |
| Handle (@) | `#536471` | `#71767B` |
| Selo (azul) | `#1D9BF0` | `#1D9BF0` |
| Borda da imagem | `#CFD9DE` | `#2F3336` |

## Tipografia (família: **Segoe UI**)
| Elemento | Peso | Tamanho |
|---|---|---|
| Nome | **Bold** (segoeuib) | 42 px |
| Handle | Regular | 36 px |
| Corpo (sem imagem) | Regular | 52 px |
| Corpo (com imagem) | Regular | 46 px |

- Altura de linha do corpo: **font-size × 1.52**.
- Gap entre blocos de ideia (linha em branco / `\n\n`): **font-size × 0.65**.
- ⚠️ **Fonte na web:** Segoe UI é fonte do Windows e **não é universal** no browser/Vercel.
  A spec da S1 decide: embarcar a família (woff2) ou usar equivalente web fiel. Sem isso,
  o render usa fallback e quebra a fidelidade.

## Header (avatar + nome + selo + handle)
- Avatar: **circular, 88 px**. Posição: x = 80 (margem), y = topo do bloco.
- Nome: x = 80 + 88 + 24 = **192 px**; y = topo + 4.
- Selo verificado: **círculo azul preenchido `#1D9BF0` com check branco** (nunca estrela).
  Tamanho 36 px; posicionado logo após o nome (x = fim do nome + 8). Geometria do check:
  ver `draw_verified_badge()` no Python, ou usar um ícone SVG "verified" do X equivalente.
- Handle: x = 192; y = (y do nome) + 52. Cor = token Handle.
- Gap header → primeira linha de texto (`HEADER_GAP`): **40 px**.

## Corpo de texto
- Alinhado à esquerda, x = 80, largura 920.
- Quebra de linha por largura; `\n\n` separa **blocos de ideia** (insere o gap de parágrafo).
- `font_size` pode ser sobrescrito por slide (padrão 52 sem imagem / 46 com imagem).

## Imagem do slide (opcional)
- Escala pela **largura = 920 px**; altura proporcional, **sem limite artificial**.
- Cantos arredondados: **radius 28** (borda externa radius 30 + padding 2 px).
- Borda: **2 px**, cor = token "Borda da imagem".
- Gap texto → imagem (`img_gap`): **44 px**. Posição x = 80, abaixo do texto.

## Algoritmo de centralização vertical (do Python)
- Com imagem: `total_h = 88 + 40 + altura_texto + 44 + altura_img`;
  `header_top = max(60, (1350 − total_h) / 2)`.
- Sem imagem: `total_h = 88 + 40 + altura_texto`;
  `header_top = max(60, (1350 − total_h) / 2 − 20)`.
- `body_top = header_top + 88 + 40`.

## Regras invioláveis (resumo)
- Sem barra de engajamento (curtidas/retweets/views).
- Sem logo/passarinho do X. Sem emojis no corpo.
- Selo sempre círculo azul com check — nunca estrela.
- Cada PNG = exatamente 1080 × 1350.
