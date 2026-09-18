import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPermission } from "../../src/lib/domain/permissions";
const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  origin: vi.fn(),
  limit: vi.fn(),
  lookup: vi.fn(),
  admit: vi.fn(),
  link: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/server/dal/auth", () => ({
  requireStaff: mocks.staff,
  hasPermission,
}));
vi.mock("@/server/security/request", () => ({
  assertSameOrigin: mocks.origin,
}));
vi.mock("@/server/security/rate-limit", () => ({
  enforceRateLimit: mocks.limit,
}));
vi.mock("@/server/services/tickets", () => ({
  getTicketAdmission: mocks.lookup,
  checkInTicket: mocks.admit,
  linkTicketBooking: mocks.link,
  TicketError: class extends Error {},
  cancelComplimentaryTickets: vi.fn(),
  issueComplimentaryTickets: vi.fn(),
  resendTicketEmail: vi.fn(),
  saveTicketSale: vi.fn(),
}));
vi.mock("@/server/services/ticket-payments", () => ({
  checkTicketPayment: vi.fn(),
}));
vi.mock("@/server/jobs/schedule-email-delivery", () => ({
  scheduleEmailOutboxProcessing: vi.fn(),
}));
const actions = await import("../../src/server/actions/ticket-actions");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({
    profile: { id: "staff-id" },
    membership: { role: "staff", permissions: {} },
  });
  mocks.origin.mockResolvedValue(undefined);
  mocks.lookup.mockResolvedValue({
    id: "ticket",
    application: { id: "application" },
  });
});
describe("staff-only ticket operations", () => {
  it.each(["staff", "super_admin"])(
    "allows %s to scan and check in",
    async (role) => {
      mocks.staff.mockResolvedValue({
        profile: { id: "staff-id" },
        membership: { role, permissions: {} },
      });
      expect((await actions.readGuestTicketForScan("ticket")).ok).toBe(true);
      expect((await actions.admitGuestTicket("ticket")).ok).toBe(true);
      expect(mocks.admit).toHaveBeenCalledWith("ticket", "staff-id");
      expect(mocks.limit).toHaveBeenCalledWith(
        "ticket-admission:staff-id",
        1200,
        900,
      );
    },
  );
  it("rejects unauthenticated or applicant sessions before reading or writing tickets", async () => {
    mocks.staff.mockRejectedValue(new Error("Not staff"));
    expect((await actions.readGuestTicketForScan("ticket")).ok).toBe(false);
    expect((await actions.admitGuestTicket("ticket")).ok).toBe(false);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.admit).not.toHaveBeenCalled();
  });
  it("enforces permission overrides and same-origin requests", async () => {
    mocks.staff.mockResolvedValue({
      profile: { id: "staff-id" },
      membership: { role: "staff", permissions: { "payments.verify": false } },
    });
    expect((await actions.admitGuestTicket("ticket")).ok).toBe(false);
    expect(mocks.admit).not.toHaveBeenCalled();
    mocks.origin.mockRejectedValue(new Error("Wrong origin"));
    expect((await actions.readGuestTicketForScan("ticket")).ok).toBe(false);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("hides application links and denies link changes when application access is disabled", async () => {
    mocks.staff.mockResolvedValue({
      profile: { id: "staff-id" },
      membership: {
        role: "staff",
        permissions: { "applications.view": false },
      },
    });
    expect(await actions.readGuestTicketForScan("ticket")).toMatchObject({
      ok: true,
      ticket: { application: null },
    });
    expect((await actions.linkGuestBooking({})).ok).toBe(false);
    expect(mocks.link).not.toHaveBeenCalled();
  });
});
