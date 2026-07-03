// Contrato de dados do slide. Este shape e HERDADO por S2 (editor), S4 (export em
// lote) e S5 (saida da IA) — mudar aqui reverbera nas fatias seguintes.

export type SlideTheme = "light" | "dark";

export interface SlideData {
  /** Nome exibido (renderizado em Bold 42). */
  name: string;
  /** Handle sem o "@" — o componente prefixa "@" na renderizacao. */
  handle: string;
  /** URL same-origin (public/) ou data-URL. Obrigatorio na S1. */
  avatarUrl: string;
  /** Selo on/off. Quando false, o header nao deixa buraco/offset. */
  verified: boolean;
  /** Texto do corpo; "\n\n" separa blocos de ideia (paragrafos). */
  body: string;
  /** Imagem opcional do slide (same-origin/data-URL). Define corpo 46 vs 52. */
  imageUrl?: string;
  /** Tema visual do slide (claro | escuro). */
  theme: SlideTheme;
}

export interface SlideProps {
  data: SlideData;
  // fontSize NAO e prop na S1: derivado de imageUrl (52 sem / 46 com).
  // Auto-fit por overflow esta FORA da S1 (decisao do gate da story).
}
