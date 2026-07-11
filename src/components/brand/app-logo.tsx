import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function AppLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/apply"
      className={cn("flex items-center gap-3", className)}
      aria-label="GBE Awards portal home"
    >
      <Image
        src={compact ? "/brand/gbe-logo.webp" : "/brand/gbe-logo-full.png"}
        alt="GBE Awards"
        width={compact ? 40 : 46}
        height={compact ? 62 : 70}
        priority
        className="h-12 w-auto object-contain"
      />
      <span className="hidden leading-tight sm:block">
        <strong className="font-display text-xl tracking-[.08em]">
          GBE AWARDS
        </strong>
        <small className="block text-[10px] tracking-[.28em] text-antique-gold">
          2026 PORTAL
        </small>
      </span>
    </Link>
  );
}
