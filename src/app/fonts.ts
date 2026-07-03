// Fonte embarcada do SLIDE (deploy prep, S6). A Segoe UI (modelo Octavio) e
// proprietaria e so existe no Windows; no Linux da Vercel a cascata caía em
// system-ui, quebrando a metrica do PNG. Selawik e o par metrico livre da Segoe UI
// (Microsoft, licenca SIL OFL 1.1 — ver src/fonts/Selawik-LICENSE.txt), embarcada
// aqui via next/font/local. Expoe a CSS var --font-selawik, injetada no <html>
// (layout.tsx) e usada na SLIDE_FONT_STACK depois de 'Segoe UI'.

import localFont from "next/font/local";

export const selawik = localFont({
  src: [
    { path: "../fonts/Selawik-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Selawik-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-selawik",
  display: "swap",
  // Fallback ate a fonte carregar: aproxima a metrica e reduz layout shift.
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});
