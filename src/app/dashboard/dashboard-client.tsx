"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Images } from "lucide-react";

import { countByPeriod, last7DaysActivity } from "@/lib/carousel-periods";
import type { CarouselListItem } from "@/lib/actions/carousel-types";

interface DashboardClientProps {
  carousels: CarouselListItem[];
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

// TODO(integração pós-merge): usar `createdAt` (o schema ja tem — falta a
// action expor, ver src/lib/carousel-periods.ts) em vez de `updatedAt` como
// "quando foi gerado". Ate la os contadores/grafico refletem edicoes tambem.
function getDateIso(carousel: CarouselListItem): string {
  return carousel.updatedAt;
}

/**
 * Dashboard (Client): contadores, recentes e grafico de atividade calculados
 * a partir do array de listCarousels() — tudo em cima de dado REAL do dono,
 * so a granularidade de data e que e um stand-in (ver TODO acima).
 */
export function DashboardClient({ carousels }: DashboardClientProps) {
  const counts = useMemo(() => countByPeriod(carousels, getDateIso), [carousels]);
  const activity = useMemo(() => last7DaysActivity(carousels, getDateIso), [carousels]);
  const recent = carousels.slice(0, 4);
  const maxActivity = Math.max(1, ...activity.map((day) => day.count));

  return (
    <div className="max-w-5xl p-5">
      {/* 4 contadores do mesmo tamanho */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total gerados" value={counts.total} />
        <StatCard label="Este mês" value={counts.month} />
        <StatCard label="Esta semana" value={counts.week} />
        <StatCard label="Hoje" value={counts.today} />
      </div>

      {/* Recentes */}
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recentes</h2>
        <Link
          href="/carousels"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver histórico
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="mb-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Você ainda não tem carrosséis.
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {recent.map((carousel) => (
            <Link
              key={carousel.id}
              href={`/editor?id=${carousel.id}`}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex aspect-[4/3] items-center justify-center border-b border-border bg-muted/40">
                <Images className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="p-3">
                <p className="truncate text-xs font-medium">{carousel.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {dateFormatter.format(new Date(carousel.updatedAt))}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Atividade (7 dias) — barras com tooltip no hover (CSS, sem lib de grafico) */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Atividade (7 dias)</h3>
          <span className="text-xs text-muted-foreground">
            Carrosséis gerados por dia
          </span>
        </div>
        <div className="flex h-56 items-end gap-3">
          {activity.map((day, index) => (
            <div
              key={index}
              className="group relative flex-1 cursor-pointer rounded-t bg-primary/70 transition-[filter] hover:brightness-110"
              style={{ height: `${Math.max(4, (day.count / maxActivity) * 100)}%` }}
            >
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background opacity-0 transition-opacity group-hover:opacity-100">
                {day.count} carrosséis
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          {activity.map((day, index) => (
            <span key={index} className="flex-1 text-center">
              {day.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
