import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingScanner() {
  return (
    <div
      className="mx-auto w-full max-w-lg space-y-5"
      aria-label="Loading event check-in"
    >
      <Skeleton className="h-11 w-24" />
      <Skeleton className="h-10 w-60 max-w-full" />
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-5 sm:p-6">
        <Skeleton className="aspect-square max-h-[45dvh] w-full rounded-xl" />
        <Skeleton className="mt-5 h-12 w-full" />
      </div>
    </div>
  );
}
