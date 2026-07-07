import { Skeleton } from "@/components/ui/skeleton";

/** Fallback do Suspense automatico da rota — ver comentario em dashboard/loading.tsx. */
export default function SettingsLoading() {
  return (
    <>
      <header className="sticky top-14 z-10 flex h-14 items-center border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
        <h1 className="text-sm font-semibold">Configurações</h1>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="mb-4 h-9 w-48" />
        <div className="space-y-4 rounded-xl border border-border p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>
    </>
  );
}
