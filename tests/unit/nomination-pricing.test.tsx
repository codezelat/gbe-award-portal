import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNominationPrice,
  formatOfferCountdown,
  NOMINATION_OFFER,
  nominationPricing,
  NominationPriceChangedError,
} from "@/lib/domain/nomination-pricing";
import {
  NominationOfferBanner,
  NominationPricingProvider,
  useNominationPricing,
} from "@/components/forms/nomination-offer";

const cycle = { year: 2026, currency: "LKR", nominationFeeMinor: 6_500_000 };
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("absolute nomination offer pricing", () => {
  it("uses exactly noon Colombo to noon Colombo, for 24 hours", () => {
    expect(new Date(NOMINATION_OFFER.startsAt).toISOString()).toBe(
      "2026-09-16T06:30:00.000Z",
    );
    expect(new Date(NOMINATION_OFFER.endsAt).toISOString()).toBe(
      "2026-09-17T06:30:00.000Z",
    );
    expect(NOMINATION_OFFER.endsAt - NOMINATION_OFFER.startsAt).toBe(
      86_400_000,
    );
  });
  it.each([
    [NOMINATION_OFFER.startsAt - 1, "upcoming", 6_500_000],
    [NOMINATION_OFFER.startsAt, "active", 6_500_000],
    [NOMINATION_OFFER.endsAt - 1, "active", 6_500_000],
    [NOMINATION_OFFER.endsAt, "ended", 8_500_000],
    [NOMINATION_OFFER.endsAt + 30 * 86_400_000, "ended", 8_500_000],
  ])("resolves boundary %s without a scheduler", (now, phase, amountMinor) => {
    expect(nominationPricing(cycle, now)).toMatchObject({ phase, amountMinor });
  });
  it("does not apply this campaign to other cycles or currencies", () => {
    expect(
      nominationPricing({ ...cycle, year: 2027 }, NOMINATION_OFFER.endsAt),
    ).toMatchObject({ phase: "none", amountMinor: 6_500_000 });
    expect(
      nominationPricing(
        { ...cycle, currency: "USD", nominationFeeMinor: 100 },
        NOMINATION_OFFER.endsAt,
      ),
    ).toMatchObject({ phase: "none", amountMinor: 100 });
  });
  it("rejects missing, stale and tampered acknowledgements", () => {
    const price = nominationPricing(cycle, NOMINATION_OFFER.endsAt);
    for (const amount of [undefined, 6_500_000, 10, 0])
      expect(() => assertNominationPrice(price, amount)).toThrow(
        NominationPriceChangedError,
      );
    expect(() => assertNominationPrice(price, 8_500_000)).not.toThrow();
  });
  it("never shows a negative countdown or rounds down a remaining second", () => {
    expect(formatOfferCountdown(86_400_000)).toBe("24:00:00");
    expect(formatOfferCountdown(1)).toBe("00:00:01");
    expect(formatOfferCountdown(-1000)).toBe("00:00:00");
  });
});

function Fee() {
  const { pricing } = useNominationPricing();
  return <output aria-label="Current fee">{pricing.amountMinor}</output>;
}
function offer(now: number) {
  return render(
    <NominationPricingProvider
      cycle={cycle}
      initialPricing={nominationPricing(cycle, now)}
    >
      <NominationOfferBanner />
      <Fee />
    </NominationPricingProvider>,
  );
}
describe("lightweight offer banner", () => {
  it("appears at the start without a reload, even with a wrong device clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01"));
    offer(NOMINATION_OFFER.startsAt - 1000);
    expect(screen.queryByLabelText("Nomination offer")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("Nomination offer")).toHaveTextContent(
      "Last chance: Nominate with Discount",
    );
    expect(screen.getByLabelText("Nomination offer")).not.toHaveTextContent(
      "LKR",
    );
    expect(screen.getByRole("timer")).toHaveTextContent("24:00:00");
  });
  it("updates the fee and removes the banner at expiry", () => {
    vi.useFakeTimers();
    offer(NOMINATION_OFFER.endsAt - 2000);
    expect(screen.getByRole("timer")).toHaveTextContent("00:00:02");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:00:01");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByLabelText("Nomination offer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current fee")).toHaveTextContent("8500000");
  });
  it("catches up after a background tab resumes", () => {
    vi.useFakeTimers();
    const now = Date.now();
    offer(NOMINATION_OFFER.endsAt - 2000);
    act(() => {
      vi.setSystemTime(now + 5000);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current fee")).toHaveTextContent("8500000");
  });
  it("does not restart on a deployment after the deadline", () => {
    offer(NOMINATION_OFFER.endsAt + 1000);
    expect(screen.queryByLabelText("Nomination offer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current fee")).toHaveTextContent("8500000");
  });
});
