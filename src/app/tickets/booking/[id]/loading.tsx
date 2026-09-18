import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingBooking() {
  return (
    <div
      className="mx-auto max-w-xl space-y-6 rounded-2xl border bg-card p-7"
      aria-label="Loading booking"
    >
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
