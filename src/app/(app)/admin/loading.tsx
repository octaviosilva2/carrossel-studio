import { Skeleton } from "@/components/ui/skeleton";

/** Fallback do Suspense automatico da rota — ver comentario em dashboard/loading.tsx. */
export default function AdminLoading() {
  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Admin</h1>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          somente CEO/admin
        </span>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
}
