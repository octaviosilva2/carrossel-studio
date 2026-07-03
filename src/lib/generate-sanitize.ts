// Sanitizacao e mapeamento do texto gerado pela IA. Modulo PURO — sem React, sem
// DOM, sem "use server", sem I/O. Camada 3 (rede de seguranca final) da defesa em
// 3 camadas: mesmo que o prompt e o Zod deixem passar, aqui removemos emojis e
// markdown/HTML de estilo e normalizamos paragrafos. Testavel isolado pelo 06.

import type { GeneratedCarousel } from "@/lib/actions/generate-types";

// --- Constantes de saida (regras visuais inviolaveis como texto) -------------

/**
 * Dica textual acrescentada ao final do body quando a IA sinaliza que cabe imagem
 * (AC-5). Decisao do CEO: sinal vira TEXTO no body — sem coluna/campo novo, sem
 * tocar SlideData/EditorSlide. O cliente ve a linha no editor e apaga ao ajustar.
 */
export const IMAGE_HINT = "[Sugestão: adicione uma imagem neste slide]";

// --- Sanitizacao de texto ----------------------------------------------------

// Faixas Unicode de emoji/pictogramas/simbolos. Cobre os blocos comuns: emoticons,
// simbolos & pictogramas, transporte/mapas, bandeiras regionais, dingbats,
// simbolos suplementares, variation selectors e zero-width joiner. Regex com flag
// `u` (unicode). Nao pretende ser exaustiva de todo o Unicode — cobre o que a IA
// realisticamente emite; o prompt ja proibe emojis, isto e a rede de seguranca.
const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{2122}\u{2139}\u{2328}\u{23CF}\u{23E9}-\u{23FA}\u{24C2}\u{25AA}-\u{25FE}]/gu;

/**
 * Remove emojis, markdown/HTML de estilo e normaliza paragrafos de um texto
 * gerado. Ordem importa: remove tags/marcacao antes de colapsar quebras.
 *
 * - Remove emojis (regra visual inviolavel — AC-7).
 * - Remove tags HTML `<...>` (mantem o texto interno).
 * - Remove marcadores markdown de estilo: `*` `_` `` ` `` e `#` de cabecalho no
 *   inicio da linha. Mantem o texto puro; nao mexe em pontuacao normal.
 * - Normaliza paragrafos: colapsa 3+ quebras em `\n\n`; trim de cada linha e do todo.
 */
export function sanitizeGeneratedText(input: string): string {
  let text = input;

  // 1. Remove emojis.
  text = text.replace(EMOJI_PATTERN, "");

  // 2. Remove tags HTML (abre-fecha), preservando o conteudo textual.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  // 3. Remove `#` de cabecalho markdown no inicio de cada linha (ex.: "## Titulo").
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // 4. Remove marcadores markdown de enfase/codigo: asterisco, underscore, crase.
  //    Tira so o marcador — o texto entre eles permanece.
  text = text.replace(/[*_`]/g, "");

  // 5. Normaliza espacos horizontais em excesso (nao toca quebras de linha).
  text = text.replace(/[^\S\n]+/g, " ");

  // 6. Trim de cada linha (remove espaco nas pontas de cada linha).
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  // 7. Colapsa 3+ quebras consecutivas em exatamente `\n\n` (paragrafo padrao S1).
  text = text.replace(/\n{3,}/g, "\n\n");

  // 8. Trim final do bloco inteiro.
  return text.trim();
}

// --- Mapeamento: estrutura validada -> linhas de slide para persistir --------

/** Linha de slide pronta para INSERT (subset de SlideRow relevante a geracao). */
export interface GeneratedSlideRow {
  position: number;
  body: string;
  imageUrl: null;
}

/** Resultado do mapeamento: titulo sanitizado + linhas de slide na ordem. */
export interface MappedGeneratedCarousel {
  title: string;
  slides: GeneratedSlideRow[];
}

/**
 * Converte a estrutura validada (GeneratedCarousel) em titulo + linhas de slide
 * prontas para persistir. Aplica sanitizacao ao title e a cada body; acrescenta a
 * dica de imagem quando suggestImage=true; descarta slides cujo body zera apos
 * sanitizar; reindexa position (0-based) apos o descarte. Se sobrarem 0 slides,
 * retorna null — a action trata como GENERATION_FAILED (nao cria carrossel quebrado).
 *
 * PURA: nao lanca por conteudo vazio (retorna null) — quem decide o erro e a action.
 */
export function mapGeneratedToSlideRows(
  generated: GeneratedCarousel,
): MappedGeneratedCarousel | null {
  const title = sanitizeGeneratedText(generated.title);
  // Titulo vazio apos sanitizar => estrutura inutilizavel.
  if (title.length === 0) return null;

  const rows: GeneratedSlideRow[] = [];

  for (const slide of generated.slides) {
    let body = sanitizeGeneratedText(slide.body);
    // Descarta slide cujo texto zerou apos sanitizar (ex.: so tinha emojis).
    if (body.length === 0) continue;

    // AC-5: sinal de imagem vira dica textual ao final do body (sem imageUrl).
    if (slide.suggestImage) {
      body = `${body}\n\n${IMAGE_HINT}`;
    }

    rows.push({
      // Reindexa aqui: position acompanha a lista pos-descarte (0-based, sem furos).
      position: rows.length,
      body,
      imageUrl: null,
    });
  }

  if (rows.length === 0) return null;

  return { title, slides: rows };
}
