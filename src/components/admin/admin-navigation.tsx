"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FileArchive, FolderOpen, Settings2 } from "lucide-react";
import { useState } from "react";
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
  const systemHrefs = new Set([
    "/admin/categories",
    "/admin/cycles",
    "/admin/staff",
    "/admin/settings",
    "/admin/activity",
  ]);
  const nominationHrefs = new Set([
    "/admin",
    "/admin/applications",
    "/admin/applicants",
    "/admin/payments",
  ]);
  const groups = [
    {
      label: "Nominations",
      icon: FileArchive,
      items: items.filter((item) => nominationHrefs.has(item.href)),
    },
    {
      label: "Operations",
      icon: FolderOpen,
      items: items.filter(
        (item) =>
          !nominationHrefs.has(item.href) && !systemHrefs.has(item.href),
      ),
    },
    {
      label: "System",
      icon: Settings2,
      items: items.filter((item) => systemHrefs.has(item.href)),
    },
  ].filter((group) => group.items.length);
  const activeGroup = groups.find((group) =>
    group.items.some((item) =>
      item.href === "/admin"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    ),
  )?.label;
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => [
    activeGroup ?? "Nominations",
  ]);

  return (
    <>
      {groups.map((group) => {
        const isExpanded = expandedGroups.includes(group.label);
        const GroupIcon = group.icon;
        return (
          <section key={group.label} className="border-b last:border-b-0">
            <button
              type="button"
              aria-expanded={isExpanded}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm font-semibold text-graphite transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() =>
                setExpandedGroups((current) =>
                  current.includes(group.label)
                    ? current.filter((label) => label !== group.label)
                    : [...current, group.label],
                )
              }
            >
              <span className="flex min-w-0 items-center gap-3">
                <GroupIcon aria-hidden className="size-4 text-antique-gold" />
                {group.label}
              </span>
              <ChevronDown
                aria-hidden
                className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            </button>
            {isExpanded ? (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {group.items.map(({ href, label, icon: Icon }) => {
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
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
