"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function DebouncedApplicationSearch({
  defaultValue,
  label = "Search applications",
  placeholder = "Search reference, nominee, email or phone",
}: {
  defaultValue?: string;
  label?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("search") ?? "";
  const [search, setSearch] = useState({
    url: current,
    value: defaultValue ?? current,
    requested: null as string | null,
  });
  // URL navigation (including Clear and Back) must not resurrect an old query.
  // A response to our own search may arrive while the user is still typing.
  if (search.url !== current) {
    setSearch({
      url: current,
      value: search.requested === current ? search.value : current,
      requested: null,
    });
  }
  const value = search.value;
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (value.trim() === current) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("cursors");
      next.delete("page");
      if (value.trim()) next.set("search", value.trim());
      else next.delete("search");
      setSearch((previous) => ({ ...previous, requested: value.trim() }));
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [current, pathname, router, searchParams, value]);

  return (
    <div className="relative min-w-0 basis-full sm:basis-64 flex-1">
      {isPending ? (
        <LoaderCircle className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" />
      ) : (
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        name="search"
        value={value}
        onChange={(event) => setSearch((previous) => ({ ...previous, value: event.target.value }))}
        placeholder={placeholder}
        aria-label={label}
        aria-busy={isPending}
        maxLength={320}
        className="h-11 bg-white pl-10"
      />
    </div>
  );
}
