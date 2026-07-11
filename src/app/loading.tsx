export default function Loading() {
  return (
    <main className="mx-auto max-w-[1440px] animate-pulse px-5 py-10 md:px-8">
      <div className="h-10 w-64 rounded bg-muted" />
      <div className="mt-3 h-5 w-96 max-w-full rounded bg-muted" />
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 rounded-lg border bg-white" />
        ))}
      </div>
      <span className="sr-only">Loading portal content</span>
    </main>
  );
}
