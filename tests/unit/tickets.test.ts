import { describe, expect, it } from "vitest";
import {
  ticketCheckInReturn,
  ticketIdFromQr,
} from "../../src/lib/domain/ticket-return";
import {
  ticketContactSchema,
  ticketMoney,
  ticketSettingsSchema,
} from "../../src/lib/domain/tickets";
describe("ticket validation", () => {
  it("only decodes this portal's exact QR destination", () => {
    const id = crypto.randomUUID();
    const url = `https://access.gbeaward.com/admin/tickets/check-in/${id}`;
    expect(ticketIdFromQr(url, "https://access.gbeaward.com")).toBe(id);
    for (const value of [
      url.replace("access.gbeaward.com", "evil.test"),
      url.replace("https:", "http:"),
      `${url}?next=1`,
      `${url}#x`,
      url.replace("https://", "https://guest@"),
      "javascript:alert(1)",
      id,
      "/admin/tickets/scan",
    ])
      expect(ticketIdFromQr(value, "https://access.gbeaward.com")).toBeNull();
  });
  it("preserves only a safe ticket check-in destination through login", () => {
    const path = `/admin/tickets/check-in/${crypto.randomUUID()}`;
    expect(ticketCheckInReturn(path)).toBe(path);
    for (const value of [
      "//evil.test",
      "https://evil.test",
      "/admin",
      `${path}?redirect=https://evil.test`,
      `${path}/..`,
      null,
    ])
      expect(ticketCheckInReturn(value)).toBeNull();
  });
  const contact = {
    name: "Test Guest",
    email: "guest@example.test",
    phone: "077 123 4567",
    quantity: 2,
  };
  it("normalizes contact numbers and optional business", () => {
    expect(ticketContactSchema.parse(contact)).toMatchObject({
      phone: "+94771234567",
      businessName: "",
    });
  });
  it.each([0, -1, 21, 1.5])("rejects invalid quantity %s", (quantity) => {
    expect(
      ticketContactSchema.safeParse({ ...contact, quantity }).success,
    ).toBe(false);
  });
  it("rejects invalid phones", () => {
    expect(
      ticketContactSchema.safeParse({ ...contact, phone: "123" }).success,
    ).toBe(false);
  });
  it("requires complete future event details to launch", () => {
    const settings = {
      cycleId: crypto.randomUUID(),
      revision: 0,
      title: "Guest tickets",
      venue: "",
      eventAt: null,
      capacity: 0,
      unitPriceMinor: 0,
      maxPerBooking: 10,
      status: "draft",
    };
    expect(ticketSettingsSchema.safeParse(settings).success).toBe(true);
    expect(
      ticketSettingsSchema.safeParse({ ...settings, status: "open" }).success,
    ).toBe(false);
    expect(
      ticketSettingsSchema.safeParse({
        ...settings,
        status: "open",
        venue: "Test venue",
        eventAt: "2099-01-01T12:00:00.000Z",
        capacity: 100,
        unitPriceMinor: 500000,
      }).success,
    ).toBe(true);
  });
  it("formats ticket prices in minor units", () => {
    expect(ticketMoney(500025)).toBe("LKR 5,000.25");
  });
});
