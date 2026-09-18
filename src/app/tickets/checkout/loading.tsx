import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingCheckout() {
  return (
    <div
      className="mx-auto max-w-xl space-y-6"
      aria-label="Loading guest details"
    >
      <Skeleton className="h-10 w-36" />
      <Skeleton className="h-12 w-56" />
      <div className="space-y-6 rounded-2xl border bg-card p-6">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
