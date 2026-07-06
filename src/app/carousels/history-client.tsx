"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Images, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchesPeriod, type Period } from "@/lib/carousel-periods";
import { deleteCarousel } from "@/lib/actions/carousels";
import type { CarouselListItem } from "@/lib/actions/carousel-types";

interface HistoryClientProps {
  carousels: CarouselListItem[];
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mês" },
  { value: "all", label: "Tudo" },
];

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Histórico: busca por título + pills de período — SEMPRE filtrando uma lista
 * única (nunca agrupando em seções com subtítulo). Tudo client-side sobre o
 * array de listCarousels() (real).
 */
export function HistoryClient({ carousels }: HistoryClientProps) {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");

  const filtered = useMemo(() => {
    const now = new Date();
    const normalizedQuery = query.trim().toLowerCase();
    return carousels.filter((carousel) => {
      const matchesQuery =
        normalizedQuery === "" ||
        carousel.title.toLowerCase().includes(normalizedQuery);
      // TODO(integração pós-merge): usar createdAt quando listCarousels() expuser
      // o campo (ver src/lib/carousel-periods.ts) — hoje usa updatedAt.
      const matchesTime = matchesPeriod(carousel.updatedAt, period, now);
      return matchesQuery && matchesTime;
    });
  }, [carousels, query, period]);

  return (
    <div className="max-w-6xl p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-1">
        {PERIODS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setPeriod(item.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              period === item.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {carousels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Você ainda não tem carrosséis.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum carrossel encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.map((carousel) => (
            <div
              key={carousel.id}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex aspect-[4/3] items-center justify-center border-b border-border bg-muted/40">
                <Images className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-medium">{carousel.title}</p>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {dateFormatter.format(new Date(carousel.updatedAt))}
                </p>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/editor?id=${carousel.id}`}
                    className="rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
                  >
                    Abrir
                  </Link>
                  <DeleteCarouselButton id={carousel.id} title={carousel.title} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Exclusao com confirmacao — usa a action REAL deleteCarousel (inalterada).
function DeleteCarouselButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      await deleteCarousel(id);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Excluir"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir carrossel</DialogTitle>
          <DialogDescription>
            Tem certeza que quer excluir &quot;{title}&quot;? Essa ação não pode ser
            desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
