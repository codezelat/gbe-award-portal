import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { BETTER_AUTH_SECRET: "test-ticket-details-secret-not-production" },
}));
import {
  TICKET_CHECKOUT_MS,
  TICKET_DETAILS_MS,
  ticketTimeLeft,
} from "../../src/lib/domain/ticket-timing";
import {
  signTicketDetails,
  verifyTicketDetails,
} from "../../src/server/security/ticket-details";
describe("ticket deadlines", () => {
  it("uses five minutes for details and fifteen for gateway checkout", () => {
    expect(TICKET_DETAILS_MS).toBe(300000);
    expect(TICKET_CHECKOUT_MS).toBe(900000);
  });
  it("shows absolute time remaining without negative counters", () => {
    expect(ticketTimeLeft(300000, 0)).toBe("05:00");
    expect(ticketTimeLeft(300000, 299999)).toBe("00:01");
    expect(ticketTimeLeft(300000, 400000)).toBe("00:00");
  });
  it("rejects expired, extended or altered details sessions", () => {
    const now = 1000000;
    const details = {
      salesId: crypto.randomUUID(),
      quantity: 2,
      acceptedUnitPriceMinor: 500000,
      expiresAt: now + TICKET_DETAILS_MS,
    };
    const signature = signTicketDetails(details);
    expect(verifyTicketDetails(details, signature, now)).toBe(true);
    expect(verifyTicketDetails(details, signature, details.expiresAt)).toBe(
      false,
    );
    expect(
      verifyTicketDetails(
        { ...details, expiresAt: details.expiresAt + 1000 },
        signature,
        now,
      ),
    ).toBe(false);
    expect(
      verifyTicketDetails({ ...details, quantity: 3 }, signature, now),
    ).toBe(false);
    expect(
      verifyTicketDetails(
        { ...details, acceptedUnitPriceMinor: 1 },
        signature,
        now,
      ),
    ).toBe(false);
  });
});
