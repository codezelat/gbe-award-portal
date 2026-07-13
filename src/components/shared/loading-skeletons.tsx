import { PublicHeader } from "@/components/shared/public-header";
import { PublicFooter } from "@/components/shared/public-footer";
import { Skeleton } from "@/components/ui/skeleton";

function LoadingStatus({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

function PageHeadingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <Skeleton className={compact ? "h-8 w-44" : "h-10 w-64 max-w-full"} />
      <Skeleton className="mt-3 h-5 w-[30rem] max-w-full" />
    </div>
  );
}

function FieldSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className={`mt-2 w-full ${tall ? "h-28" : "h-11"}`} />
    </div>
  );
}

function PortalShellSkeleton({ label }: { label: string }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]" aria-busy>
      <aside className="glass-shell fixed inset-y-0 left-0 hidden w-60 px-6 py-8 md:block">
        <Skeleton className="h-12 w-36" />
        <div className="mt-8 flex items-center gap-3 border-y py-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      </aside>
      <div className="md:col-start-2">
        <header className="glass-shell flex h-16 items-center justify-between px-5 md:px-8">
          <Skeleton className="hidden h-4 w-28 md:block" />
          <Skeleton className="h-4 w-36" />
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-8 md:px-8 md:py-10">
          <DashboardSkeleton label={label} />
        </main>
      </div>
    </div>
  );
}

export function AdminShellLoading() {
  return <PortalShellSkeleton label="Loading administration" />;
}

export function ApplicantShellLoading() {
  return <PortalShellSkeleton label="Loading applicant portal" />;
}

export function DashboardSkeleton({ label = "Loading dashboard" }: { label?: string }) {
  return (
    <div aria-busy>
      <LoadingStatus label={label} />
      <PageHeadingSkeleton />
      <section className="surface mt-7 overflow-hidden rounded-lg">
        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 xl:grid-cols-5 xl:divide-y-0">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-8 w-14" />
              <Skeleton className="mt-3 h-3 w-28" />
            </div>
          ))}
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <CardListSkeleton rows={4} />
        <CardListSkeleton rows={3} />
      </div>
    </div>
  );
}

export function ApplicationDashboardSkeleton() {
  return (
    <div aria-busy>
      <LoadingStatus label="Loading your application" />
      <PageHeadingSkeleton />
      <section className="glass-feature mt-7 rounded-xl p-6 md:p-9">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-5 h-10 w-96 max-w-full" />
        <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
        <Skeleton className="mt-2 h-5 w-4/5 max-w-xl" />
        <div className="mt-7 grid gap-4 border-t pt-6 sm:grid-cols-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <CardListSkeleton rows={4} />
        <CardListSkeleton rows={2} />
      </div>
    </div>
  );
}

export function TablePageSkeleton({ label = "Loading records" }: { label?: string }) {
  return (
    <div aria-busy>
      <LoadingStatus label={label} />
      <PageHeadingSkeleton />
      <section className="surface mt-6 rounded-lg p-4">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </section>
      <section className="surface mt-4 overflow-hidden rounded-lg">
        <div className="grid grid-cols-[1.2fr_1.1fr_.8fr_.8fr] gap-4 border-b px-5 py-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-3 w-20" />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="grid grid-cols-[1.2fr_1.1fr_.8fr_.8fr] gap-4 border-b px-5 py-5 last:border-0">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </section>
    </div>
  );
}

export function DetailPageSkeleton({ label = "Loading details" }: { label?: string }) {
  return (
    <div aria-busy>
      <LoadingStatus label={label} />
      <PageHeadingSkeleton />
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="surface rounded-lg p-6">
            <Skeleton className="h-6 w-40" />
            <div className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-5 w-4/5" />
                </div>
              ))}
            </div>
          </section>
          <CardListSkeleton rows={4} />
        </div>
        <div className="space-y-6">
          <section className="glass-feature rounded-lg p-5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-5 h-11 w-full" />
            <Skeleton className="mt-3 h-11 w-full" />
          </section>
          <CardListSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}

export function FormPageSkeleton({
  label = "Loading form",
  fields = 4,
}: {
  label?: string;
  fields?: number;
}) {
  return (
    <div aria-busy>
      <LoadingStatus label={label} />
      <PageHeadingSkeleton />
      <section className="surface mt-7 max-w-3xl rounded-lg p-6 md:p-8">
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: fields }, (_, index) => (
            <FieldSkeleton key={index} tall={index === fields - 1} />
          ))}
        </div>
        <Skeleton className="mt-7 h-11 w-36" />
      </section>
    </div>
  );
}

export function ListPageSkeleton({ label = "Loading records" }: { label?: string }) {
  return (
    <div aria-busy>
      <LoadingStatus label={label} />
      <PageHeadingSkeleton />
      <div className="mt-7 flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <section key={index} className="surface flex items-center justify-between gap-4 rounded-lg p-5">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-5 w-2/5" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </div>
            <Skeleton className="h-6 w-24" />
          </section>
        ))}
      </div>
    </div>
  );
}

export function MessagesPageSkeleton() {
  return (
    <div aria-busy>
      <LoadingStatus label="Loading messages" />
      <PageHeadingSkeleton />
      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="surface rounded-lg p-6">
          <Skeleton className="h-6 w-32" />
          <div className="mt-5 flex flex-col gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton
                key={index}
                className={`h-20 ${index % 2 ? "ml-auto w-4/5" : "w-3/4"}`}
              />
            ))}
          </div>
        </section>
        <section className="glass-feature h-fit rounded-lg p-5">
          <Skeleton className="h-6 w-32" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-11 w-32" />
          </div>
        </section>
      </div>
    </div>
  );
}

export function PublicNominationSkeleton() {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-[900px] px-5 pb-10 pt-12 md:pb-16 md:pt-18" aria-busy>
          <LoadingStatus label="Loading nomination form" />
          <div className="mb-9 border-b border-mist pb-9">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-4 h-10 w-3/4" />
            <Skeleton className="mt-5 h-5 w-full" />
            <Skeleton className="mt-2 h-5 w-2/3" />
          </div>
          <section className="surface overflow-hidden rounded-lg">
            <div className="border-b border-mist px-5 py-5 md:px-8">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-2 w-full" />
              <div className="mt-5 grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-3 w-full" />
                ))}
              </div>
            </div>
            <div className="p-6 md:p-8">
              <Skeleton className="h-7 w-48" />
              <div className="mt-7 grid gap-5 md:grid-cols-2">
                <FieldSkeleton />
                <FieldSkeleton />
                <FieldSkeleton />
              </div>
              <Skeleton className="ml-auto mt-8 h-11 w-28" />
            </div>
          </section>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PublicContentSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-3xl flex-1 px-5 py-14 md:py-20"
        aria-busy
      >
        <LoadingStatus label={label} />
        <PageHeadingSkeleton />
        <section className="surface mt-7 rounded-lg p-6 md:p-9">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className={`mb-4 h-4 ${index === 6 ? "w-2/5" : "w-full"}`} />
          ))}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PublicCompletionSkeleton() {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main
        id="main-content"
        className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-5 py-16"
        aria-busy
      >
        <LoadingStatus label="Loading nomination confirmation" />
        <section className="glass-feature w-full rounded-xl p-8 text-center md:p-12">
          <Skeleton className="mx-auto size-12 rounded-full" />
          <Skeleton className="mx-auto mt-6 h-10 w-72 max-w-full" />
          <Skeleton className="mx-auto mt-5 h-5 w-full" />
          <Skeleton className="mx-auto mt-2 h-5 w-4/5" />
          <div className="mt-8 flex justify-center gap-3">
            <Skeleton className="h-11 w-44" />
            <Skeleton className="h-11 w-36" />
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

export function AuthPageSkeleton({ label = "Loading sign-in" }: { label?: string }) {
  return (
    <main id="main-content" className="grid min-h-screen place-items-center px-5 py-10" aria-busy>
      <LoadingStatus label={label} />
      <section className="glass-feature w-full max-w-md rounded-2xl p-7 md:p-10">
        <Skeleton className="h-12 w-36" />
        <Skeleton className="mt-10 h-10 w-52" />
        <Skeleton className="mt-4 h-5 w-full" />
        <div className="mt-8 space-y-5">
          <FieldSkeleton />
          <FieldSkeleton />
          <Skeleton className="h-11 w-full" />
        </div>
      </section>
    </main>
  );
}

function CardListSkeleton({ rows }: { rows: number }) {
  return (
    <section className="surface rounded-lg p-6">
      <Skeleton className="h-6 w-40" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
          </div>
        ))}
      </div>
    </section>
  );
}
