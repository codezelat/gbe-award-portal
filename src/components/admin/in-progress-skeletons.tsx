import { Skeleton } from "@/components/ui/skeleton";

export function InProgressSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading in-progress nominations"
      className="min-w-0"
    >
      <Skeleton className="h-10 w-52 max-w-full" />
      <Skeleton className="mt-2 h-4 w-32" />
      <div className="surface mb-5 mt-6 flex flex-wrap gap-3 rounded-xl p-3 sm:p-4">
        <Skeleton className="h-11 min-w-0 flex-1 basis-full sm:basis-64" />
        <Skeleton className="h-11 w-24" />
      </div>
      <div className="surface overflow-hidden rounded-xl">
        <div className="flex h-15 items-center gap-3 border-b px-4">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="hidden grid-cols-[2rem_30%_1fr_11rem_8rem] gap-4 border-b p-4 xl:grid">
          <Skeleton className="size-4" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="grid gap-4 border-b p-4 last:border-0 xl:grid-cols-[2rem_30%_1fr_11rem_8rem]"
          >
            <Skeleton className="size-4" />
            <div>
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="mt-2 h-3 w-3/5" />
              <Skeleton className="mt-2 h-3 w-2/5" />
            </div>
            <div>
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="mt-2 h-4 w-full" />
            </div>
            <div>
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
            <Skeleton className="h-11 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InProgressDetailSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading saved nomination"
      className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6"
    >
      <Skeleton className="h-9 w-44" />
      <div>
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="mt-3 h-5 w-56 max-w-full" />
      </div>
      <div className="surface grid gap-6 rounded-xl p-4 sm:grid-cols-2 sm:p-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-5 w-4/5" />
          </div>
        ))}
        <div className="sm:col-span-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
