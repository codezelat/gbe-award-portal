"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// One refresh at the next known reservation deadline, not recurring polling.
export function TicketAvailabilityRefresh({
  refreshAt,
  serverNow,
}: {
  refreshAt: number | null;
  serverNow: number;
}) {
  const router = useRouter();
  const lastRefresh = useRef<number | null>(null);
  useEffect(() => {
    if (!refreshAt || lastRefresh.current === refreshAt) return;
    const due = Date.now() + Math.max(0, refreshAt - serverNow) + 1500;
    const refresh = () => {
      if (
        Date.now() < due ||
        document.hidden ||
        lastRefresh.current === refreshAt
      )
        return;
      lastRefresh.current = refreshAt;
      router.refresh();
    };
    const timer = setTimeout(
      refresh,
      Math.min(due - Date.now(), 2_147_483_647),
    );
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshAt, serverNow, router]);
  return null;
}
