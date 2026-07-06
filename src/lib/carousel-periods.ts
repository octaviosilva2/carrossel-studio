// Bucketing por periodo (hoje/semana/mes/tudo) sobre uma lista de itens com data
// ISO — usado pelo Dashboard (contadores + grafico de atividade) e pelo
// Histórico (pills de filtro). Modulo PURO (sem "use client"): roda tanto em
// componentes client quanto em calculos de teste, sem depender do DOM.

export type Period = "today" | "week" | "month" | "all";

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const weekday = day.getDay(); // 0=dom..6=sab
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  day.setDate(day.getDate() - diffToMonday);
  return day;
}

function startOfMonth(date: Date): Date {
  const day = startOfDay(date);
  day.setDate(1);
  return day;
}

/** Testa se `dateIso` cai no periodo informado, relativo a `now`. */
export function matchesPeriod(
  dateIso: string,
  period: Period,
  now: Date = new Date(),
): boolean {
  if (period === "all") return true;

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;

  switch (period) {
    case "today":
      return startOfDay(date).getTime() === startOfDay(now).getTime();
    case "week":
      return date >= startOfWeek(now) && date <= now;
    case "month":
      return date >= startOfMonth(now) && date <= now;
  }
}

export interface PeriodCounts {
  today: number;
  week: number;
  month: number;
  total: number;
}

/** Conta quantos itens caem em cada periodo (hierarquia inclusiva: hoje⊂semana⊂mês⊂tudo). */
export function countByPeriod<T>(
  items: T[],
  getDateIso: (item: T) => string,
  now: Date = new Date(),
): PeriodCounts {
  return {
    today: items.filter((item) => matchesPeriod(getDateIso(item), "today", now)).length,
    week: items.filter((item) => matchesPeriod(getDateIso(item), "week", now)).length,
    month: items.filter((item) => matchesPeriod(getDateIso(item), "month", now)).length,
    total: items.length,
  };
}

export interface ActivityDay {
  /** Abreviacao pt-BR do dia da semana (seg, ter, ...). */
  label: string;
  count: number;
}

const WEEKDAY_LABELS: readonly string[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Contagem por dia nos ultimos 7 dias (incluindo hoje), do mais antigo ao mais recente. */
export function last7DaysActivity<T>(
  items: T[],
  getDateIso: (item: T) => string,
  now: Date = new Date(),
): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = startOfDay(now);
    day.setDate(day.getDate() - offset);
    const dayTime = day.getTime();

    const count = items.filter((item) => {
      const date = new Date(getDateIso(item));
      return !Number.isNaN(date.getTime()) && startOfDay(date).getTime() === dayTime;
    }).length;

    days.push({ label: WEEKDAY_LABELS[day.getDay()] ?? "", count });
  }
  return days;
}
