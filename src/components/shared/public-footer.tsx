import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-mist bg-white/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-10">
        <a
          href="https://gbeaward.com"
          className="w-fit font-medium text-foreground transition-colors hover:text-antique-gold"
        >
          © 2026 GBE Awards
        </a>
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <a
            href="https://gbeaward.com/privacy-policy"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-antique-gold"
          >
            Privacy policy
          </a>
          <Link href="/terms" className="transition-colors hover:text-antique-gold">
            Terms
          </Link>
          <a
            href="mailto:info@gbeaward.com"
            className="transition-colors hover:text-antique-gold"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
