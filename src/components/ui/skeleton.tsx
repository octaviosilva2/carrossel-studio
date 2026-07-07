import { cn } from "@/lib/utils";

/** Placeholder pulsante (shadcn/ui) — usado nos `loading.tsx` de cada rota. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
