// Constantes numericas do slide (px). Fonte unica da verdade, portada FIELMENTE de
// docs/REFERENCIA-VISUAL.md (que por sua vez extrai do render_pillow.py aprovado).
// NAO alterar sem atualizar a REFERENCIA-VISUAL — estes numeros SAO o produto.

export const CANVAS_W = 1080; // largura final do PNG (exata)
export const CANVAS_H = 1350; // altura final do PNG (exata)
export const MARGIN = 80; // margem horizontal (conteudo alinhado a esquerda)
export const CONTENT_W = 920; // largura util (1080 - 80*2)
export const VERT_PAD = 60; // padding vertical minimo (VERT_PAD)

export const AVATAR = 88; // avatar circular
export const NAME_GAP = 24; // gap avatar -> nome (80 + 88 + 24 = 192)
export const BADGE = 36; // selo verificado
export const BADGE_GAP = 8; // gap nome -> selo
export const HEADER_GAP = 40; // gap header -> primeira linha do corpo

export const IMG_RADIUS = 28; // cantos internos da imagem
export const IMG_BORDER = 2; // espessura da borda da imagem
export const IMG_GAP = 44; // gap texto -> imagem

export const NAME_SIZE = 42; // nome (Bold)
export const HANDLE_SIZE = 36; // handle (Regular)
export const BODY_SIZE_NOIMG = 52; // corpo sem imagem
export const BODY_SIZE_IMG = 46; // corpo com imagem

export const BODY_LINE_MULT = 1.52; // line-height = font-size * 1.52
export const PARAGRAPH_MULT = 0.65; // gap de "\n\n" = font-size * 0.65

// Ajuste de centralizacao vertical do caso SEM imagem (do Python: ... / 2 - 20).
export const NOIMG_CENTER_SHIFT = 20;

// Familia tipografica do slide. Segoe UI e a fonte do modelo Octavio (proprietaria
// da Microsoft, disponivel no Windows) — 1a na cascata p/ fidelidade maxima local.
// var(--font-selawik) e a Selawik embarcada via next/font/local (S6): garante a
// metrica no Linux da Vercel, onde nao ha Segoe UI. system-ui/sans-serif fecham.
export const SLIDE_FONT_STACK =
  "'Segoe UI', var(--font-selawik), 'Selawik', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
