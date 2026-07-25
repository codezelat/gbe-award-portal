import { ExternalLink } from "lucide-react";
import { safeExternalHref } from "@/lib/external-url";

export function ExternalValueLink({
  value,
  fallback = "Not provided",
}: {
  value?: string | null;
  fallback?: string;
}) {
  if (!value) return fallback;
  const href = safeExternalHref(value);
  if (!href) return value;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 break-all text-antique-gold underline decoration-current/35 underline-offset-4 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>{value}</span>
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
