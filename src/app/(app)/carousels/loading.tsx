import { Skeleton } from "@/components/ui/skeleton";

/** Fallback do Suspense automatico da rota — ver comentario em dashboard/loading.tsx. */
export default function CarouselsLoading() {
  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Histórico</h1>
        <Skeleton className="h-8 w-32" />
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="mb-4 h-9 w-full max-w-sm" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
}
