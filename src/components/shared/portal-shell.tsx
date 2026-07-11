import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { AppLogo } from "@/components/brand/app-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { adminNavigation, portalNavigation } from "@/config/navigation";
import { setAdminCycleAction } from "@/server/actions/admin-preferences";

export function PortalShell({
  kind,
  name,
  role,
  allowedAdminHrefs,
  cycleOptions,
  selectedCycleId,
  children,
}: {
  kind: "admin" | "portal";
  name: string;
  role?: string;
  allowedAdminHrefs?: string[];
  cycleOptions?: Array<{ id: string; name: string }>;
  selectedCycleId?: string;
  children: React.ReactNode;
}) {
  const nav = (kind === "admin" ? adminNavigation : portalNavigation).filter(
    (item) =>
      kind !== "admin" ||
      !allowedAdminHrefs ||
      allowedAdminHrefs.includes(item.href),
  );
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="glass-shell fixed inset-y-0 left-0 z-30 hidden w-60 flex-col px-4 py-6 md:flex">
        <AppLogo className="px-2" />
        <div className="mt-8 flex items-center gap-3 border-y py-4">
          <Avatar>
            <AvatarFallback>
              {name
                .split(" ")
                .map((v) => v[0])
                .slice(0, 2)
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {role?.replace("_", " ") ?? "Approved applicant"}
            </p>
          </div>
        </div>
        <nav
          aria-label={kind === "admin" ? "Administration" : "Applicant portal"}
          className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto"
        >
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-graphite transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/sign-out" method="post">
          <Button variant="ghost" className="w-full justify-start">
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        </form>
      </aside>
      <div className="md:col-start-2">
        <header className="glass-shell sticky top-0 z-20 flex h-16 items-center justify-between px-5 md:px-8">
          <div className="md:hidden">
            <AppLogo compact />
          </div>
          <details className="relative ml-auto md:hidden">
            <summary
              className="grid size-11 cursor-pointer list-none place-items-center rounded-md border bg-white"
              aria-label="Open navigation"
            >
              <Menu aria-hidden />
            </summary>
            <nav
              aria-label={
                kind === "admin"
                  ? "Mobile administration"
                  : "Mobile applicant portal"
              }
              className="absolute right-0 top-12 z-50 flex max-h-[70vh] w-72 flex-col gap-1 overflow-y-auto rounded-lg border bg-white p-3 shadow-xl"
            >
              {kind === "admin" && cycleOptions?.length ? (
                <form
                  action={setAdminCycleAction}
                  className="mb-2 flex gap-2 border-b pb-3"
                >
                  <select
                    name="cycleId"
                    aria-label="Award cycle"
                    defaultValue={selectedCycleId}
                    className="h-10 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm"
                  >
                    {cycleOptions.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm">Apply</Button>
                </form>
              ) : null}
              {nav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-accent"
                >
                  <Icon aria-hidden />
                  {label}
                </Link>
              ))}
              <form action="/api/auth/sign-out" method="post">
                <Button variant="ghost" className="w-full justify-start">
                  <LogOut data-icon="inline-start" />
                  Sign out
                </Button>
              </form>
            </nav>
          </details>
          {kind === "admin" && cycleOptions?.length ? (
            <form
              action={setAdminCycleAction}
              className="hidden items-center gap-2 md:flex"
            >
              <label
                htmlFor="admin-cycle"
                className="text-xs text-muted-foreground"
              >
                Award cycle
              </label>
              <select
                id="admin-cycle"
                name="cycleId"
                defaultValue={selectedCycleId}
                className="h-9 max-w-56 rounded-md border bg-white px-2 text-sm"
              >
                {cycleOptions.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost">
                Apply
              </Button>
            </form>
          ) : (
            <p className="hidden text-sm text-muted-foreground md:block">
              GBE Awards portal
            </p>
          )}
          <a
            href="mailto:info@gbeaward.com"
            className="hidden text-sm text-antique-gold sm:block"
          >
            info@gbeaward.com
          </a>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1440px] px-5 py-8 md:px-8 md:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
