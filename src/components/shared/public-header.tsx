import Link from "next/link";
import { CircleHelp, LogIn } from "lucide-react";
import { AppLogo } from "@/components/brand/app-logo";

type PublicHeaderProps = {
  compactSignIn?: boolean;
};

export function PublicHeader({ compactSignIn = false }: PublicHeaderProps) {
  return (
    <header className="glass-shell sticky top-0 z-40">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-10">
        <AppLogo />
        <nav
          aria-label="Public navigation"
          className="flex items-center gap-2 sm:gap-5"
        >
          <Link
            href="/help"
            aria-label="Help"
            className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-graphite transition-colors hover:bg-accent"
          >
            <CircleHelp aria-hidden />{" "}
            <span className="hidden sm:inline">Help</span>
          </Link>
          <Link
            href="/login"
            aria-label={compactSignIn ? "Already invited? Sign in" : undefined}
            className={
              compactSignIn
                ? "flex min-h-11 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-antique-gold"
                : "flex min-h-11 items-center gap-2 rounded-md border border-mist bg-white/70 px-4 text-sm font-medium transition-colors hover:border-champagne"
            }
          >
            {compactSignIn ? (
              <>
                <span className="hidden sm:inline">Already invited?</span>
                <span className="ml-1 underline-offset-4 hover:underline">
                  Sign in
                </span>
              </>
            ) : (
              <>
                <LogIn aria-hidden /> Applicant login
              </>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
