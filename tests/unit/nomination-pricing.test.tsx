import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNominationPrice,
  formatOfferCountdown,
  NOMINATION_OFFER,
  nominationPricing,
  NominationPriceChangedError,
  withSpecialInvite,
} from "@/lib/domain/nomination-pricing";
import {
  NominationOfferBanner,
  NominationPricingProvider,
  useNominationPricing,
} from "@/components/forms/nomination-offer";
import {
  nominationOfferSchema,
  parseOfferAmount,
  parseOfferLocalTime,
} from "@/lib/validation/nomination-offer";

const cycle = { year: 2026, currency: "LKR", nominationFeeMinor: 6_500_000 };
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("absolute nomination offer pricing", () => {
  it("uses an admin schedule in any year and returns to the regular fee when disabled", () => {
    const custom = {
      ...NOMINATION_OFFER,
      startsAt: 1000,
      endsAt: 3000,
      amountMinor: 5000,
      standardAmountMinor: 9000,
    };
    const future = { ...cycle, year: 2027 };
    expect(nominationPricing(future, 2000, custom)).toMatchObject({
      phase: "active",
      amountMinor: 5000,
    });
    expect(nominationPricing(future, 3000, custom)).toMatchObject({
      phase: "ended",
      amountMinor: 9000,
    });
    expect(
      nominationPricing(future, 2000, { ...custom, enabled: false }),
    ).toMatchObject({ phase: "disabled", amountMinor: 9000 });
  });
  it("validates amounts, wording and chronological dates", () => {
    expect(parseOfferLocalTime("2026-09-16T12:00")).toBe(
      NOMINATION_OFFER.startsAt,
    );
    expect(parseOfferLocalTime("2026-02-30T12:00")).toBeNaN();
    expect(parseOfferLocalTime("2026-09-16T12:00Z")).toBeNaN();
    expect(parseOfferAmount("65000.01")).toBe(6500001);
    for (const value of ["", "1e4", "-1", "1.001", "Infinity"])
      expect(parseOfferAmount(value)).toBeNaN();
    for (const override of [
      { endsAt: NOMINATION_OFFER.startsAt },
      { amountMinor: 0 },
      { amountMinor: 8500000 },
      { standardAmountMinor: 1 },
      { bannerText: " " },
      { bannerText: "a".repeat(81) },
      { currency: "bad" },
    ])
      expect(
        nominationOfferSchema.safeParse({ ...NOMINATION_OFFER, ...override })
          .success,
      ).toBe(false);
  });
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
  it("preserves a claimed price over the global offer boundary and releases it after its own hour", () => {
    vi.useFakeTimers();
    const now = NOMINATION_OFFER.endsAt - 1000;
    render(
      <NominationPricingProvider
        cycle={cycle}
        initialPricing={withSpecialInvite(nominationPricing(cycle, now), {
          id: "invite",
          status: "active",
          currency: "LKR",
          originalAmountMinor: 6500000,
          amountMinor: 6000000,
          expiresAt: now + 3600000,
        })}
      >
        <NominationOfferBanner />
        <Fee />
      </NominationPricingProvider>,
    );
    expect(screen.queryByLabelText("Nomination offer")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("Current fee")).toHaveTextContent("6000000");
    act(() => vi.advanceTimersByTime(3599000));
    expect(screen.getByLabelText("Current fee")).toHaveTextContent("8500000");
  });
  it("follows the serialized admin schedule instead of the default campaign", () => {
    vi.useFakeTimers();
    const now = NOMINATION_OFFER.endsAt + 10000;
    const custom = {
      ...NOMINATION_OFFER,
      startsAt: now - 1000,
      endsAt: now + 1000,
      bannerText: "Custom approved offer",
      standardAmountMinor: 9900000,
    };
    render(
      <NominationPricingProvider
        cycle={cycle}
        initialPricing={nominationPricing(cycle, now, custom)}
      >
        <NominationOfferBanner />
        <Fee />
      </NominationPricingProvider>,
    );
    expect(screen.getByLabelText("Nomination offer")).toHaveTextContent(
      "Custom approved offer",
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current fee")).toHaveTextContent("9900000");
  });
  it("does not overflow the browser timeout for a distant scheduled start", () => {
    vi.useFakeTimers();
    const now = NOMINATION_OFFER.startsAt - 60 * 86400000;
    offer(now);
    act(() => vi.advanceTimersByTime(2_147_483_647));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
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
