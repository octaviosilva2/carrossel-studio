import type { SlideData } from "@/components/slide/types";

// Dados FIXOS dos 4 cenarios de validacao da S1 (decisao do gate da story):
// {claro, escuro} x {sem imagem, com imagem}. Assets como data-URL SVG (same-origin,
// zero CORS no canvas — nao "tingem" o canvas na captura).

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1d9bf0"/><stop offset="1" stop-color="#0f6fb5"/>
  </linearGradient></defs>
  <rect width="200" height="200" fill="url(#a)"/>
  <text x="100" y="134" font-family="Segoe UI, Arial, sans-serif" font-size="112" font-weight="700" fill="#ffffff" text-anchor="middle">O</text>
</svg>`;

const IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="520" viewBox="0 0 920 520">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0f2027"/><stop offset="0.5" stop-color="#203a43"/><stop offset="1" stop-color="#2c5364"/>
  </linearGradient></defs>
  <rect width="920" height="520" fill="url(#b)"/>
  <circle cx="740" cy="130" r="96" fill="#1d9bf0" opacity="0.45"/>
  <text x="64" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="56" font-weight="700" fill="#ffffff">Imagem do slide</text>
  <text x="64" y="360" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#c7d1d9">exemplo — 920px de largura</text>
</svg>`;

const AVATAR_URL = svgDataUrl(AVATAR_SVG);
const IMAGE_URL = svgDataUrl(IMAGE_SVG);

const BODY_NOIMG =
  "A maioria das pessoas não precisa de mais informação.\n\nPrecisa de clareza sobre o que já sabe e coragem pra executar o próximo passo.";

const BODY_IMG =
  "O que separa quem cresce de quem estagna não é talento.\n\nÉ consistência diária.";

const BASE = {
  name: "Octavio Silva",
  handle: "octaviosilva",
  avatarUrl: AVATAR_URL,
  verified: true,
} as const;

export interface Fixture {
  id: string;
  label: string;
  data: SlideData;
}

export const FIXTURES: Fixture[] = [
  {
    id: "light-noimage",
    label: "Claro / sem imagem",
    data: { ...BASE, body: BODY_NOIMG, theme: "light" },
  },
  {
    id: "light-image",
    label: "Claro / com imagem",
    data: { ...BASE, body: BODY_IMG, imageUrl: IMAGE_URL, theme: "light" },
  },
  {
    id: "dark-noimage",
    label: "Escuro / sem imagem",
    data: { ...BASE, body: BODY_NOIMG, theme: "dark" },
  },
  {
    id: "dark-image",
    label: "Escuro / com imagem",
    data: { ...BASE, body: BODY_IMG, imageUrl: IMAGE_URL, theme: "dark" },
  },
];
