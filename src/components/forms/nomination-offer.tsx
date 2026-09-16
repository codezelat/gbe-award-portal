"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  formatOfferCountdown,
  nominationPricing,
  type NominationPricing,
  type PricingCycle,
} from "@/lib/domain/nomination-pricing";

const PricingContext = createContext<{
  pricing: NominationPricing;
  updatePricing: (pricing: NominationPricing) => void;
} | null>(null);

export function useNominationPricing() {
  const context = useContext(PricingContext);
  if (!context) throw new Error("Nomination pricing is unavailable.");
  return context;
}

export function NominationPricingProvider({
  cycle,
  initialPricing,
  children,
}: {
  cycle: PricingCycle;
  initialPricing: NominationPricing;
  children: React.ReactNode;
}) {
  const [pricing, updatePricing] = useState(initialPricing);
  useEffect(() => {
    const clientAnchor = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    function checkBoundary() {
      const now = pricing.serverNow + Date.now() - clientAnchor;
      const next = nominationPricing(cycle, now, pricing.offer);
      if (next.phase !== pricing.phase) {
        updatePricing(next);
        return;
      }
      const boundary =
        next.phase === "upcoming"
          ? next.startsAt
          : next.phase === "active"
            ? next.endsAt
            : null;
      clearTimeout(timer);
      if (boundary)
        timer = setTimeout(
          checkBoundary,
          Math.min(2_147_483_647, Math.max(1, boundary - now)),
        );
    }
    checkBoundary();
    window.addEventListener("pageshow", checkBoundary);
    document.addEventListener("visibilitychange", checkBoundary);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pageshow", checkBoundary);
      document.removeEventListener("visibilitychange", checkBoundary);
    };
  }, [cycle, pricing]);
  return (
    <PricingContext.Provider value={{ pricing, updatePricing }}>
      {children}
    </PricingContext.Provider>
  );
}

export function NominationOfferBanner() {
  const { pricing } = useNominationPricing();
  if (pricing.phase !== "active" || !pricing.endsAt) return null;
  return (
    <aside
      aria-label="Nomination offer"
      className="bg-[#b42332] px-4 py-3 text-white"
    >
      <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-center gap-2 text-center sm:flex-row sm:gap-x-6">
        <p className="min-w-0 break-words text-sm font-semibold leading-6">
          {pricing.bannerText}
        </p>
        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-3 whitespace-nowrap text-base font-semibold">
          Offer ends in
          <OfferCountdown
            endsAt={pricing.endsAt}
            serverNow={pricing.serverNow}
          />
        </span>
      </div>
    </aside>
  );
}

function OfferCountdown({
  endsAt,
  serverNow,
}: {
  endsAt: number;
  serverNow: number;
}) {
  const [remaining, setRemaining] = useState(endsAt - serverNow);
  useEffect(() => {
    const clientAnchor = Date.now();
    const tick = () =>
      setRemaining(endsAt - serverNow - (Date.now() - clientAnchor));
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endsAt, serverNow]);
  return (
    <span
      role="timer"
      aria-live="off"
      className="rounded bg-black/15 px-3 py-1 text-2xl font-semibold tabular-nums tracking-wider text-white"
    >
      {formatOfferCountdown(remaining)}
    </span>
  );
}
