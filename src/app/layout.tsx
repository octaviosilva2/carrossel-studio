import type { Metadata } from "next";
import type { ReactNode } from "react";

import { selawik } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carrossel Studio",
  description:
    "Gerador de carrosseis estilo Twitter/X (modelo Octavio) para o Instagram.",
};

// Aplica a classe "dark" ANTES do primeiro paint (evita flash de tema claro ao
// recarregar com tema escuro salvo). So le localStorage — chave espelha a do
// AppShell (src/components/app-shell/app-shell.tsx). Script inline pequeno e
// deliberado: roda sincrono no <head>, antes da hidratacao do React.
const THEME_ANTI_FLASH_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem("carrossel-studio-theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  // selawik.variable expoe --font-selawik no DOM (usada pela SLIDE_FONT_STACK no
  // Linux, onde nao ha Segoe UI). A UI da plataforma segue com a font-sans do sistema.
  return (
    // suppressHydrationWarning: o script anti-flash acima adiciona "dark" a este
    // elemento ANTES da hidratacao (lendo localStorage) — sem essa flag, o React
    // acusa mismatch nesse atributo especifico em todo carregamento com tema
    // escuro salvo (o resto da arvore continua verificado normalmente).
    <html lang="pt-BR" className={selawik.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_ANTI_FLASH_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
