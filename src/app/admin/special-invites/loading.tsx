import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div
      className="flex min-w-0 flex-col gap-5"
      aria-label="Loading special invites"
      aria-busy="true"
    >
      <div className="flex flex-wrap justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-11 w-40" />
      </div>
      <Skeleton className="h-11 w-60" />
      <Skeleton className="h-16 w-full" />
      <div className="surface divide-y rounded-xl">
        {[0, 1, 2, 3].map((id) => (
          <div
            key={id}
            className="flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
