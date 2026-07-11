"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function DebouncedApplicationSearch({
  defaultValue,
}: {
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue ?? "");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (value.trim() === current) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("cursors");
      if (value.trim()) next.set("search", value.trim());
      else next.delete("search");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [pathname, router, searchParams, value]);

  return (
    <div className="relative min-w-64 flex-1">
      {isPending ? (
        <LoaderCircle className="pointer-events-none absolute left-3 top-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" />
      ) : (
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        name="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search reference, nominee, email or phone"
        aria-label="Search applications"
        className="h-11 bg-white pl-10"
      />
    </div>
  );
}
