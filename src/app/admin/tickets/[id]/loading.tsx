import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingBooking() {
  return (
    <div className="space-y-6" aria-label="Loading booking">
      <Skeleton className="h-10 w-28" />
      <Skeleton className="h-12 w-64 max-w-full" />
      <Skeleton className="h-52 w-full rounded-2xl" />
      <Skeleton className="h-11 w-60 max-w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
