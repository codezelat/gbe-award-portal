// Owner-approved, absolute Colombo timestamps. Deployment never restarts the offer.
export const NOMINATION_OFFER = {
  year: 2026,
  currency: "LKR",
  startsAt: Date.parse("2026-09-16T12:00:00+05:30"),
  endsAt: Date.parse("2026-09-17T12:00:00+05:30"),
  amountMinor: 6_500_000,
  standardAmountMinor: 8_500_000,
  enabled: true,
  bannerText: "Last chance: Nominate with Discount",
} as const;

export type NominationOffer = {
  enabled: boolean;
  currency: string;
  startsAt: number;
  endsAt: number;
  amountMinor: number;
  standardAmountMinor: number;
  bannerText: string;
};

export function defaultNominationOffer(
  cycle: PricingCycle,
): NominationOffer | null {
  return cycle.year === NOMINATION_OFFER.year &&
    cycle.currency === NOMINATION_OFFER.currency
    ? { ...NOMINATION_OFFER }
    : null;
}

export type PricingCycle = {
  year: number;
  nominationFeeMinor: number | null;
  currency: string | null;
};
export type NominationPricing = ReturnType<typeof nominationPricing>;

export function nominationPricing(
  cycle: PricingCycle,
  now = Date.now(),
  offer: NominationOffer | null = defaultNominationOffer(cycle),
) {
  const configured = offer?.currency === cycle.currency ? offer : null;
  const phase = !configured
    ? "none"
    : !configured.enabled
      ? "disabled"
      : now < configured.startsAt
        ? "upcoming"
        : now < configured.endsAt
          ? "active"
          : "ended";
  return {
    amountMinor:
      phase === "ended" || phase === "disabled"
        ? configured!.standardAmountMinor
        : phase === "active"
          ? configured!.amountMinor
          : cycle.nominationFeeMinor,
    currency: cycle.currency,
    phase,
    serverNow: now,
    startsAt: configured?.startsAt ?? null,
    endsAt: configured?.endsAt ?? null,
    standardAmountMinor: configured?.standardAmountMinor ?? null,
    bannerText: configured?.bannerText ?? "",
    offer: configured,
  };
}

export class NominationPriceChangedError extends Error {
  constructor(readonly pricing: NominationPricing) {
    super(
      "The fee has changed. Refresh to review it without losing your saved form.",
    );
    this.name = "NominationPriceChangedError";
  }
}

// A client amount is acknowledgement only, never the source of the fee.
export function assertNominationPrice(
  pricing: NominationPricing,
  acceptedAmountMinor: number | undefined,
) {
  if (pricing.phase !== "none" && acceptedAmountMinor !== pricing.amountMinor)
    throw new NominationPriceChangedError(pricing);
}

export function formatOfferCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
