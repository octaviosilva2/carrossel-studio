import type { Metadata } from "next";
import type { ReactNode } from "react";

import { selawik } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carrossel Studio",
  description:
    "Gerador de carrosseis estilo Twitter/X (modelo Octavio) para o Instagram.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // selawik.variable expoe --font-selawik no DOM (usada pela SLIDE_FONT_STACK no
  // Linux, onde nao ha Segoe UI). A UI da plataforma segue com a font-sans do sistema.
  // Tema e sempre claro — sem toggle, sem leitura de preferencia salva.
  return (
    <html lang="pt-BR" className={selawik.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
