import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback do Suspense automatico da rota (Next `loading.tsx`). Mostrado
 * enquanto o Server Component busca os carrosseis — a sidebar (layout do
 * grupo `(app)`) ja esta na tela, so este conteudo pisca ate os dados chegarem.
 * Header identico ao da page real (mesmo layout, sem "pulo" quando os dados chegam).
 */
export default function DashboardLoading() {
  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Dashboard</h1>
        <Skeleton className="h-8 w-32" />
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>

        <Skeleton className="mb-2.5 h-5 w-24" />
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    </>
  );
}
