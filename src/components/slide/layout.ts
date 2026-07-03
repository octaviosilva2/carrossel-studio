import { AVATAR, HEADER_GAP, IMG_GAP, VERT_PAD, CANVAS_H, NOIMG_CENTER_SHIFT } from "./slide-tokens";

// Reproduz o "Algoritmo de centralizacao vertical" de docs/REFERENCIA-VISUAL.md
// (o mesmo do render_pillow.py). NAO usado no caminho principal da S1 — o slide
// centraliza via flexbox (opcao A da spec, suficiente para dados fixos que cabem).
// Fica pronto como FALLBACK (opcao B): se a validacao visual divergir, medir
// textHeight/imageHeight em runtime e posicionar por offset absoluto com esta funcao.

export interface VerticalLayoutInput {
  /** Altura renderizada do bloco de corpo (px). */
  textHeight: number;
  /** Altura da imagem ja escalada para 920px de largura, ou null se nao ha imagem. */
  imageHeight: number | null;
}

export interface VerticalLayout {
  headerTop: number;
  bodyTop: number;
}

export function computeVerticalLayout(input: VerticalLayoutInput): VerticalLayout {
  let headerTop: number;

  if (input.imageHeight !== null) {
    // Com imagem: bloco = header + gap + texto + gap_img + imagem
    const totalH = AVATAR + HEADER_GAP + input.textHeight + IMG_GAP + input.imageHeight;
    headerTop = Math.max(VERT_PAD, (CANVAS_H - totalH) / 2);
  } else {
    // Sem imagem: bloco = header + gap + texto, com deslocamento -20 do Python
    const totalH = AVATAR + HEADER_GAP + input.textHeight;
    headerTop = Math.max(VERT_PAD, (CANVAS_H - totalH) / 2 - NOIMG_CENTER_SHIFT);
  }

  const bodyTop = headerTop + AVATAR + HEADER_GAP;
  return { headerTop, bodyTop };
}
