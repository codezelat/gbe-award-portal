"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigation } from "@/config/navigation";

export function AdminNavigation({
  allowedHrefs,
  mobile = false,
}: {
  allowedHrefs?: string[];
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const items = adminNavigation.filter(
    (item) => !allowedHrefs || allowedHrefs.includes(item.href),
  );

  return (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              mobile
                ? `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors ${
                    active
                      ? "bg-accent font-semibold text-accent-foreground"
                      : "hover:bg-accent"
                  }`
                : `flex min-h-11 items-center gap-3 rounded-md border-l-2 px-3 text-sm transition-colors ${
                    active
                      ? "border-champagne bg-accent font-semibold text-accent-foreground"
                      : "border-transparent text-graphite hover:bg-accent hover:text-accent-foreground"
                  }`
            }
          >
            <Icon aria-hidden />
            {label}
          </Link>
        );
      })}
    </>
  );
}
