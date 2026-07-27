"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";

const revealDelayMs = 120;
const recoveryTimeoutMs = 15_000;

export function GlobalPendingIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const currentDestination = `${pathname}${search ? `?${search}` : ""}`;
  const [pendingDestination, setPendingDestination] = useState<string | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const activeLink = useRef<HTMLAnchorElement | null>(null);
  const pending =
    pendingDestination !== null &&
    pendingDestination !== currentDestination;

  const reset = useCallback(() => {
    if (activeLink.current) {
      activeLink.current.removeAttribute("aria-busy");
      activeLink.current.removeAttribute("data-navigation-pending");
      activeLink.current = null;
    }
    setPendingDestination(null);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (pending || !activeLink.current) return;
    activeLink.current.removeAttribute("aria-busy");
    activeLink.current.removeAttribute("data-navigation-pending");
    activeLink.current = null;
  }, [pending]);

  useEffect(() => {
    function beginNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        link.hasAttribute("download") ||
        link.dataset.noNavigationProgress === "true" ||
        (link.target && link.target !== "_self")
      )
        return;
      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin !== current.origin ||
        (destination.pathname === current.pathname &&
          destination.search === current.search)
      )
        return;
      reset();
      activeLink.current = link;
      link.setAttribute("aria-busy", "true");
      link.setAttribute("data-navigation-pending", "true");
      setPendingDestination(
        `${destination.pathname}${destination.search}`,
      );
    }

    function beginHistoryNavigation() {
      const destination = new URL(window.location.href);
      setPendingDestination(
        `${destination.pathname}${destination.search}`,
      );
    }

    document.addEventListener("click", beginNavigation, true);
    window.addEventListener("popstate", beginHistoryNavigation);
    return () => {
      document.removeEventListener("click", beginNavigation, true);
      window.removeEventListener("popstate", beginHistoryNavigation);
    };
  }, [reset]);

  useEffect(() => {
    if (!pending) return;
    const reveal = window.setTimeout(() => setVisible(true), revealDelayMs);
    const recover = window.setTimeout(reset, recoveryTimeoutMs);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(recover);
    };
  }, [pending, reset]);

  return (
    <div
      aria-live="polite"
      aria-hidden={!(visible && pending)}
      className={`pointer-events-none fixed left-1/2 top-3 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-white/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition duration-150 motion-reduce:transition-none ${
        visible && pending
          ? "translate-y-0 opacity-100"
          : "-translate-y-2 opacity-0"
      }`}
      data-testid="global-pending-indicator"
      role="status"
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      Loading
    </div>
  );
}
