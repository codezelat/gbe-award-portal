import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader compactSignIn />
      <main
        className="mx-auto w-full max-w-3xl flex-1 px-5 py-10"
        aria-busy="true"
        aria-label="Loading payment"
      >
        <section className="surface rounded-xl p-5 sm:p-8">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-4 h-10 w-3/4" />
          <Skeleton className="mt-4 h-4 w-full" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
