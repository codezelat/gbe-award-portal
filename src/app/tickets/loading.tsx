import { Skeleton } from "@/components/ui/skeleton";
export default function TicketsLoading() {
  return (
    <div
      aria-label="Loading tickets"
      className="grid gap-8 md:grid-cols-[.85fr_1.15fr]"
    >
      <div className="space-y-5">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-12 w-60 max-w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="space-y-6 rounded-2xl border bg-card p-7">
        <Skeleton className="h-7 w-44" />
        <div className="flex items-center justify-between gap-6 py-4">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="size-12" />
          <Skeleton className="size-12 rounded-full" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
