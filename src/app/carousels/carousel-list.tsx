"use client";

import Link from "next/link";

import type { CarouselListItem } from "@/lib/actions/carousel-types";

interface CarouselListProps {
  carousels: CarouselListItem[];
}

// Formata a data ISO em pt-BR (data + hora curtas). Client-side para bater com o
// locale do browser e evitar mismatch de hidratacao com o servidor.
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date);
}

/**
 * Lista clicavel de carrosseis do dono. Cada item leva ao editor via ?id=. Mostra
 * titulo + "atualizado em" formatado em pt-BR. Keys estaveis pelo id do carrossel.
 */
export function CarouselList({ carousels }: CarouselListProps) {
  return (
    <ul className="space-y-2">
      {carousels.map((carousel) => (
        <li key={carousel.id}>
          <Link
            href={`/editor?id=${carousel.id}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate font-medium">
              {carousel.title}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {formatUpdatedAt(carousel.updatedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
