import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingTickets() {
  return (
    <div className="space-y-6" aria-label="Loading tickets">
      <div className="flex flex-wrap justify-between gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-11 w-44" />
      </div>
      <Skeleton className="h-52 w-full rounded-2xl" />
      <Skeleton className="h-11 w-full" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
