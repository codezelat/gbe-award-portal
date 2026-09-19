import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/lib/db/schema";

vi.mock("server-only", () => ({}));
const emailSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: emailSend };
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined,
  }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/server/jobs/schedule-email-delivery", () => ({
  scheduleEmailOutboxProcessing: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: {
    GENIE_ENABLED: "true",
    GENIE_ENVIRONMENT: "sandbox",
    GENIE_API_KEY: "test-key",
    GENIE_APP_ID: "test-app",
    APP_ENV: "local",
    EMAIL_FROM: "GBE Test <test@example.test>",
    EMAIL_REPLY_TO: "support@example.test",
    BETTER_AUTH_SECRET: "isolated-ticket-tests-only-not-production",
  },
  publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3102" },
  requireProvider: () => undefined,
}));
const cookieValues = new Map<string, string>();
const client = postgres(process.env.TEST_DATABASE_URL!, { max: 10 });
const db = drizzle(client, { schema });
const service = await import("../../src/server/services/tickets");
const payments = await import("../../src/server/services/ticket-payments");
const { buildGuestTicketPdf } =
  await import("../../src/server/services/ticket-document");
const { validTicketAccessToken, ticketAccessToken, ticketDocumentToken } =
  await import("../../src/server/security/ticket-session");
const { prepareTicketEmail } =
  await import("../../src/server/services/ticket-email");
const { processEmailOutbox } =
  await import("../../src/server/jobs/email-outbox");
const { POST: ticketWebhook } =
  await import("../../src/app/api/webhooks/genie-tickets/route");
const { GET: ticketDownload } =
  await import("../../src/app/api/public/tickets/[id]/download/route");
let cycleId: string, applicationId: string, actorId: string, saleId: string;
let created = 0,
  timeout = false;
const remote = new Map<string, Record<string, unknown>>();
const settings = () => ({
  cycleId,
  revision: 0,
  title: "Local test ceremony",
  capacity: 10,
  unitPriceMinor: 500000,
  maxPerBooking: 10,
  venue: "Test venue",
  eventAt: "2099-01-01T12:00:00.000Z",
  status: "open",
});
const request = (quantity = 1) => ({
  id: crypto.randomUUID(),
  secret: "a".repeat(64),
  salesId: saleId,
  acceptedUnitPriceMinor: 500000,
  name: "Test Guest",
  email: "guest@example.test",
  phone: "+94771234567",
  quantity,
});
beforeAll(async () => {
  const userId = crypto.randomUUID();
  await db.insert(schema.user).values({
    id: userId,
    email: "ticket-staff@example.test",
    name: "Ticket Staff",
  });
  [actorId] = (
    await db
      .insert(schema.profiles)
      .values({
        authUserId: userId,
        accountKind: "staff",
        displayName: "Ticket Staff",
        isActive: true,
      })
      .returning()
  ).map((row) => row.id);
  [cycleId] = (
    await db
      .insert(schema.awardCycles)
      .values({
        name: "Ticket integration tests",
        slug: "ticket-integration",
        year: 2026,
        status: "open",
        timezone: "Asia/Colombo",
        opensAt: new Date("2026-01-01"),
        closesAt: new Date("2099-01-01"),
        supportEmail: "test@example.test",
        heading: "Test",
        introCopy: "Test",
        declarationText: "Test",
        declarationVersion: "1",
        termsVersion: "1",
        privacyVersion: "1",
        formSchemaVersion: "1",
        nominationFeeMinor: 8500000,
        currency: "LKR",
      })
      .returning()
  ).map((row) => row.id);
  const [category] = await db
    .insert(schema.awardCategories)
    .values({
      cycleId,
      name: "Test category",
      code: "TIX",
      slug: "ticket-test",
    })
    .returning();
  [applicationId] = (
    await db
      .insert(schema.applications)
      .values({
        cycleId,
        categoryId: category.id,
        nomineeName: "Submitted Guest",
        emailNormalised: "submitted@example.test",
        emailDisplay: "submitted@example.test",
        phoneDisplay: "+94771234567",
        awardNomination: "Test nomination",
        categoryNameSnapshot: "Test",
        categoryCodeSnapshot: "TIX",
        declarationAccepted: true,
        declarationTextSnapshot: "Test",
        declarationVersion: "1",
        termsVersion: "1",
        privacyVersion: "1",
        formSchemaVersion: "1",
        workflowStatus: "submitted",
        submittedAt: new Date(),
      })
      .returning()
  ).map((row) => row.id);
});
beforeEach(async () => {
  cookieValues.clear();
  emailSend.mockReset();
  emailSend.mockResolvedValue({ data: { id: "local-email-id" }, error: null });
  await db.delete(schema.guestTickets);
  await db.delete(schema.ticketPaymentAttempts);
  await db
    .delete(schema.emailOutbox)
    .where(eq(schema.emailOutbox.templateKey, "guest_tickets"));
  await db.delete(schema.ticketBookings);
  await db.delete(schema.ticketSales);
  const sale = await service.saveTicketSale(settings(), actorId);
  saleId = sale.id;
  await db
    .update(schema.applications)
    .set({ deletedAt: null, workflowStatus: "submitted" })
    .where(eq(schema.applications.id, applicationId));
  created = 0;
  timeout = false;
  remote.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        created++;
        if (timeout) throw new Error("timeout");
        const input = JSON.parse(String(init.body));
        const id = created.toString(16).padStart(24, "0");
        expect(input.webhook).toBe(
          "http://localhost:3102/api/webhooks/genie-tickets",
        );
        expect(input.redirectUrl).toContain("/tickets/booking/");
        const transaction = {
          id,
          amount: input.amount,
          currency: input.currency,
          localId: input.localId,
          state: "PENDING",
          merchantId: "test-merchant",
          originatorApp: "test-app",
          url: `https://transaction.uat.geniebiz.lk/${id}`,
        };
        remote.set(id, transaction);
        return Response.json(transaction);
      }
      const transaction = remote.get(url.split("/").at(-1)!);
      return transaction
        ? Response.json(transaction)
        : new Response("", { status: 404 });
    }),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await client.end();
});
async function checkout(quantity = 1) {
  const booking = await service.reserveTickets(request(quantity));
  await payments.startTicketCheckout(booking.id);
  const data = await service.getTicketBooking(booking.id);
  return { ...data, transaction: remote.get(data.attempt!.transactionId!)! };
}
async function settle(quantity = 1) {
  const data = await checkout(quantity);
  data.transaction.state = "CONFIRMED";
  await payments.reconcileTicketPayment(data.attempt!.id);
  return service.getTicketBooking(data.booking.id);
}
describe("guest ticket inventory and checkout", () => {
  it("reserves the last seats only once under concurrent requests", async () => {
    const result = await Promise.allSettled([
      service.reserveTickets(request(6)),
      service.reserveTickets(request(6)),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(await service.ticketInventory(db, saleId)).toEqual({
      issued: 0,
      held: 6,
    });
  });
  it("makes identical reservation retries idempotent", async () => {
    const input = request(2);
    const results = await Promise.all([
      service.reserveTickets(input),
      service.reserveTickets(input),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await service.ticketInventory(db, saleId)).toEqual({
      issued: 0,
      held: 2,
    });
    await expect(
      service.reserveTickets({ ...input, quantity: 3 }),
    ).rejects.toThrow("changed");
  });
  it("rejects stale prices, paused sales and oversized bookings", async () => {
    await expect(
      service.reserveTickets({ ...request(), acceptedUnitPriceMinor: 1 }),
    ).rejects.toThrow("price changed");
    await expect(service.reserveTickets(request(11))).rejects.toThrow("up to");
    await service.saveTicketSale(
      { ...settings(), revision: 1, status: "paused" },
      actorId,
    );
    await expect(service.reserveTickets(request())).rejects.toThrow("closed");
  });
  it("rejects capacity below held seats and protects snapshots", async () => {
    const booking = await service.reserveTickets(request(4));
    await expect(
      service.saveTicketSale(
        { ...settings(), revision: 1, capacity: 3 },
        actorId,
      ),
    ).rejects.toThrow("at least 4");
    await service.saveTicketSale(
      { ...settings(), revision: 1, unitPriceMinor: 600000, capacity: 20 },
      actorId,
    );
    expect(
      (await service.getTicketBooking(booking.id)).booking.amountMinor,
    ).toBe(2000000);
    await expect(
      service.saveTicketSale({ ...settings(), revision: 1 }, actorId),
    ).rejects.toThrow("Settings changed");
  });
  it("expires unstarted reservations but not ambiguous payment attempts", async () => {
    const booking = await service.reserveTickets(request(2));
    await db
      .update(schema.ticketBookings)
      .set({ holdUntil: new Date(Date.now() - 1000) })
      .where(eq(schema.ticketBookings.id, booking.id));
    await service.expireTicketHolds();
    expect((await service.getTicketBooking(booking.id)).booking.status).toBe(
      "expired",
    );
    const input = await service.reserveTickets(request(2));
    timeout = true;
    await expect(payments.startTicketCheckout(input.id)).rejects.toThrow(
      "not responded",
    );
    await db
      .update(schema.ticketBookings)
      .set({ holdUntil: new Date(Date.now() - 1000) })
      .where(eq(schema.ticketBookings.id, input.id));
    await service.expireTicketHolds();
    expect((await service.getTicketBooking(input.id)).booking.status).toBe(
      "pending",
    );
    expect((await service.ticketInventory(db, saleId)).held).toBe(2);
    await expect(payments.startTicketCheckout(input.id)).rejects.toThrow(
      "Check payment",
    );
    expect(created).toBe(1);
  });
  it("does not issue tickets for a pending gateway or a redirect", async () => {
    const data = await checkout();
    expect(data.tickets).toHaveLength(0);
    expect(data.booking.status).toBe("pending");
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.templateKey, "guest_tickets")),
    ).toHaveLength(0);
  });
  it("gives details five minutes and one fixed fifteen-minute gateway window", async () => {
    const before = Date.now();
    const booking = await service.reserveTickets(request());
    expect(booking.holdUntil!.getTime() - before).toBeGreaterThanOrEqual(
      5 * 60_000,
    );
    expect(booking.holdUntil!.getTime() - before).toBeLessThan(
      5 * 60_000 + 3000,
    );
    const checkoutStarted = Date.now();
    await payments.startTicketCheckout(booking.id);
    const initial = (await service.getTicketBooking(booking.id)).attempt!;
    expect(
      initial.expiresAt.getTime() - checkoutStarted,
    ).toBeGreaterThanOrEqual(15 * 60_000);
    expect(initial.expiresAt.getTime() - checkoutStarted).toBeLessThan(
      15 * 60_000 + 3000,
    );
    await payments.startTicketCheckout(booking.id);
    const retried = (await service.getTicketBooking(booking.id)).attempt!;
    expect(retried.id).toBe(initial.id);
    expect(retried.expiresAt).toEqual(initial.expiresAt);
    expect(created).toBe(1);
  });
  it("creates only one gateway attempt under concurrent clicks", async () => {
    const booking = await service.reserveTickets(request());
    await Promise.allSettled([
      payments.startTicketCheckout(booking.id),
      payments.startTicketCheckout(booking.id),
    ]);
    expect(created).toBe(1);
  });
  it("automatically clears overdue gateway-cancelled reservations before availability", async () => {
    const data = await checkout(4);
    data.transaction.state = "CANCELLED";
    await db
      .update(schema.ticketPaymentAttempts)
      .set({
        expiresAt: new Date(Date.now() - 1000),
        checkedAt: new Date(Date.now() - 2000),
      })
      .where(eq(schema.ticketPaymentAttempts.id, data.attempt!.id));
    const stock = await payments.getTicketAvailability(saleId);
    expect(stock).toMatchObject({ issued: 0, held: 0, refreshAt: null });
    const result = await service.getTicketBooking(data.booking.id);
    expect(result.booking.status).toBe("cancelled");
    expect(result.attempt!.active).toBe(false);
    expect(result.attempt!.transactionId).toBe(data.attempt!.transactionId);
    expect(result.tickets).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.templateKey, "guest_tickets")),
    ).toHaveLength(0);
  });
  it("expires unstarted bookings and schedules one refresh for a future checkout", async () => {
    const abandoned = await service.reserveTickets(request(2));
    await db
      .update(schema.ticketBookings)
      .set({ holdUntil: new Date(Date.now() - 1000) })
      .where(eq(schema.ticketBookings.id, abandoned.id));
    const data = await checkout(3);
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockClear();
    const stock = await payments.getTicketAvailability(saleId);
    expect(stock).toMatchObject({
      issued: 0,
      held: 3,
      refreshAt: data.attempt!.expiresAt.getTime(),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect((await service.getTicketBooking(abandoned.id)).booking.status).toBe(
      "expired",
    );
  });
  it("settles an overdue confirmed payment instead of cancelling its seats", async () => {
    const data = await checkout(3);
    data.transaction.state = "CONFIRMED";
    await db
      .update(schema.ticketPaymentAttempts)
      .set({ expiresAt: new Date(Date.now() - 1000), checkedAt: null })
      .where(eq(schema.ticketPaymentAttempts.id, data.attempt!.id));
    expect(await payments.getTicketAvailability(saleId)).toMatchObject({
      issued: 3,
      held: 0,
    });
    expect(
      (await service.getTicketBooking(data.booking.id)).tickets,
    ).toHaveLength(3);
  });
  it("retains uncertain overdue seats and backs off failed or still-pending checks", async () => {
    const data = await checkout(2);
    await db
      .update(schema.ticketPaymentAttempts)
      .set({ expiresAt: new Date(Date.now() - 1000), checkedAt: null })
      .where(eq(schema.ticketPaymentAttempts.id, data.attempt!.id));
    remote.delete(data.attempt!.transactionId!);
    expect(await payments.refreshExpiredTicketBookings(saleId)).toEqual({
      checked: 0,
      failed: 1,
    });
    expect(await payments.refreshExpiredTicketBookings(saleId)).toEqual({
      checked: 0,
      failed: 0,
    });
    expect((await service.ticketInventory(db, saleId)).held).toBe(2);
    expect(
      (await service.getTicketBooking(data.booking.id)).booking.status,
    ).toBe("pending");
    remote.set(data.attempt!.transactionId!, data.transaction);
    await db
      .update(schema.ticketPaymentAttempts)
      .set({ checkedAt: null })
      .where(eq(schema.ticketPaymentAttempts.id, data.attempt!.id));
    expect(await payments.refreshExpiredTicketBookings(saleId)).toEqual({
      checked: 1,
      failed: 0,
    });
    expect(await payments.refreshExpiredTicketBookings(saleId)).toEqual({
      checked: 0,
      failed: 0,
    });
    expect((await service.ticketInventory(db, saleId)).held).toBe(2);
  });
  it("claims overdue gateway checks once across concurrent page loads", async () => {
    const data = await checkout();
    await db
      .update(schema.ticketPaymentAttempts)
      .set({ expiresAt: new Date(Date.now() - 1000), checkedAt: null })
      .where(eq(schema.ticketPaymentAttempts.id, data.attempt!.id));
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockClear();
    const result = await Promise.all(
      Array.from({ length: 5 }, () =>
        payments.refreshExpiredTicketBookings(saleId),
      ),
    );
    expect(result.reduce((sum, entry) => sum + entry.checked, 0)).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds reconciliation and advances past failures without crossing sale or environment", async () => {
    await service.saveTicketSale(
      { ...settings(), capacity: 30, revision: 1 },
      actorId,
    );
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const data = await checkout();
      ids.push(data.attempt!.id);
      data.transaction.state = "CANCELLED";
      if (i === 0) remote.delete(data.attempt!.transactionId!);
    }
    await db
      .update(schema.ticketPaymentAttempts)
      .set({ expiresAt: new Date(Date.now() - 1000), checkedAt: null });
    await db
      .update(schema.ticketPaymentAttempts)
      .set({ environment: "production" })
      .where(eq(schema.ticketPaymentAttempts.id, ids[11]));
    expect(
      await payments.refreshExpiredTicketBookings(crypto.randomUUID()),
    ).toEqual({ checked: 0, failed: 0 });
    expect(await payments.refreshExpiredTicketBookings(saleId)).toEqual({
      checked: 9,
      failed: 1,
    });
    expect(await payments.refreshExpiredTicketBookings(saleId)).toEqual({
      checked: 1,
      failed: 0,
    });
    expect((await service.ticketInventory(db, saleId)).held).toBe(2);
  });
  it("issues unique QR tickets and one email for duplicate confirmations", async () => {
    const data = await checkout(3);
    data.transaction.state = "CONFIRMED";
    await Promise.all([
      payments.reconcileTicketPayment(data.attempt!.id),
      payments.reconcileTicketPayment(data.attempt!.id),
    ]);
    const result = await service.getTicketBooking(data.booking.id);
    expect(result.booking.status).toBe("paid");
    expect(result.tickets).toHaveLength(3);
    expect(new Set(result.tickets.map((ticket) => ticket.code)).size).toBe(3);
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.templateKey, "guest_tickets")),
    ).toHaveLength(1);
  });
  it.each(["amount", "currency", "originatorApp", "localId"])(
    "rejects mismatched %s",
    async (field) => {
      const data = await checkout();
      data.transaction.state = "CONFIRMED";
      data.transaction[field] =
        field === "amount" ? 1 : field === "currency" ? "USD" : "wrong";
      await expect(
        payments.reconcileTicketPayment(data.attempt!.id),
      ).rejects.toThrow("did not match");
      expect(
        (await service.getTicketBooking(data.booking.id)).tickets,
      ).toHaveLength(0);
    },
  );
  it("ignores stale pending states after payment and voids refunded tickets", async () => {
    const data = await settle();
    const transaction = remote.get(data.attempt!.transactionId!)!;
    transaction.state = "PENDING";
    await payments.reconcileTicketPayment(data.attempt!.id);
    expect(
      (await service.getTicketBooking(data.booking.id)).booking.status,
    ).toBe("paid");
    transaction.state = "REFUNDED";
    await payments.reconcileTicketPayment(data.attempt!.id);
    const refunded = await service.getTicketBooking(data.booking.id);
    expect(refunded.booking.status).toBe("refunded");
    expect(refunded.tickets[0].voidedAt).toBeTruthy();
    await expect(
      service.checkInTicket(refunded.tickets[0].id, actorId),
    ).rejects.toThrow("not valid");
    transaction.state = "CONFIRMED";
    await payments.reconcileTicketPayment(data.attempt!.id);
    expect(
      (await service.getTicketBooking(data.booking.id)).booking.status,
    ).toBe("refunded");
  });
  it("voids previously paid tickets when the gateway reverses them", async () => {
    const data = await settle();
    remote.get(data.attempt!.transactionId!)!.state = "VOIDED";
    await payments.reconcileTicketPayment(data.attempt!.id);
    expect(
      (await service.getTicketBooking(data.booking.id)).booking.status,
    ).toBe("refunded");
  });
  it("retains late payment for review without overselling, then fulfils after capacity increases", async () => {
    const data = await checkout(8);
    data.transaction.state = "FAILED";
    await payments.reconcileTicketPayment(data.attempt!.id);
    await service.reserveTickets(request(8));
    data.transaction.state = "CONFIRMED";
    await payments.reconcileTicketPayment(data.attempt!.id);
    expect(
      (await service.getTicketBooking(data.booking.id)).booking.status,
    ).toBe("review");
    expect(
      (await service.getTicketBooking(data.booking.id)).tickets,
    ).toHaveLength(0);
    await service.saveTicketSale(
      { ...settings(), revision: 1, capacity: 20 },
      actorId,
    );
    await payments.reconcileTicketPayment(data.attempt!.id);
    expect(
      (await service.getTicketBooking(data.booking.id)).booking.status,
    ).toBe("paid");
  });
});
describe("complimentary tickets and admission", () => {
  it("gives every ticket one PDF page even with maximum-length details", async () => {
    const data = await settle();
    await db
      .update(schema.ticketBookings)
      .set({
        name: "Guest ".repeat(26).slice(0, 160),
        businessName: "Business ".repeat(25).slice(0, 200),
        email: "a".repeat(230) + "@example.test",
        venue: "Venue ".repeat(40),
        eventTitle: "Ceremony ".repeat(20).slice(0, 160),
      })
      .where(eq(schema.ticketBookings.id, data.booking.id));
    const pdf = await buildGuestTicketPdf(data.booking.id);
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(1);
  });
  const complimentary = () => ({
    requestId: crypto.randomUUID(),
    salesId: saleId,
    applicationId,
    quantity: 2,
    reason: "Approved guest allocation",
  });
  it("requires a real submitted application and uses its contact details", async () => {
    await expect(
      service.issueComplimentaryTickets(
        { ...complimentary(), applicationId: crypto.randomUUID() },
        actorId,
      ),
    ).rejects.toThrow("submitted application");
    const booking = await service.issueComplimentaryTickets(
      complimentary(),
      actorId,
    );
    expect(booking).toMatchObject({
      email: "submitted@example.test",
      name: "Submitted Guest",
      amountMinor: 0,
      applicationId,
      status: "issued",
    });
  });
  it("excludes deleted and unsubmitted applications", async () => {
    await db
      .update(schema.applications)
      .set({ deletedAt: new Date() })
      .where(eq(schema.applications.id, applicationId));
    await expect(
      service.issueComplimentaryTickets(complimentary(), actorId),
    ).rejects.toThrow("submitted application");
    await db
      .update(schema.applications)
      .set({ deletedAt: null, workflowStatus: "uploading" })
      .where(eq(schema.applications.id, applicationId));
    await expect(
      service.issueComplimentaryTickets(complimentary(), actorId),
    ).rejects.toThrow("submitted application");
  });
  it("deduplicates complimentary issuance and email resend requests", async () => {
    const input = complimentary();
    const booking = await service.issueComplimentaryTickets(input, actorId);
    await service.issueComplimentaryTickets(input, actorId);
    expect((await service.getTicketBooking(booking.id)).tickets).toHaveLength(
      2,
    );
    const requestId = crypto.randomUUID();
    await service.resendTicketEmail(booking.id, requestId, actorId);
    await service.resendTicketEmail(booking.id, requestId, actorId);
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.templateKey, "guest_tickets")),
    ).toHaveLength(2);
  });
  it("allows only one admission under concurrent scans", async () => {
    const data = await settle();
    const result = await Promise.allSettled([
      service.checkInTicket(data.tickets[0].id, actorId),
      service.checkInTicket(data.tickets[0].id, actorId),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      (await service.getTicketBooking(data.booking.id)).tickets[0].checkedInAt,
    ).toBeTruthy();
  });
  it("cancels unused complimentary tickets and refuses checked-in ones", async () => {
    const booking = await service.issueComplimentaryTickets(
      complimentary(),
      actorId,
    );
    await service.cancelComplimentaryTickets(
      booking.id,
      actorId,
      "No longer needed",
    );
    const cancelled = await service.getTicketBooking(booking.id);
    expect(cancelled.booking.status).toBe("cancelled");
    expect(cancelled.tickets.every((ticket) => !!ticket.voidedAt)).toBe(true);
    await expect(
      service.checkInTicket(cancelled.tickets[0].id, actorId),
    ).rejects.toThrow("not valid");
    expect((await service.ticketInventory(db, saleId)).issued).toBe(0);
    const other = await service.issueComplimentaryTickets(
      complimentary(),
      actorId,
    );
    const data = await service.getTicketBooking(other.id);
    await service.checkInTicket(data.tickets[0].id, actorId);
    await expect(
      service.cancelComplimentaryTickets(other.id, actorId, "No longer needed"),
    ).rejects.toThrow("already checked in");
  });
  it("refuses complimentary cancellation for a card-paid booking", async () => {
    const data = await settle(2);
    await expect(
      service.cancelComplimentaryTickets(
        data.booking.id,
        actorId,
        "Not attending",
      ),
    ).rejects.toThrow("Only unused complimentary");
    const unchanged = await service.getTicketBooking(data.booking.id);
    expect(unchanged.booking.status).toBe("paid");
    expect(unchanged.tickets.every((ticket) => !ticket.voidedAt)).toBe(true);
    expect((await service.ticketInventory(db, saleId)).issued).toBe(2);
  });
  it("generates a real multi-page PDF and scoped email access tokens", async () => {
    const data = await settle(2);
    const pdf = await buildGuestTicketPdf(data.booking.id);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10000);
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(2);
    expect(await prepareTicketEmail(data.booking.id)).toEqual(
      await prepareTicketEmail(data.booking.id),
    );
    const token = ticketAccessToken(data.booking.id);
    expect(validTicketAccessToken(data.booking.id, token)).toBe(true);
    expect(validTicketAccessToken(crypto.randomUUID(), token)).toBe(false);
    expect(validTicketAccessToken(data.booking.id, "x")).toBe(false);
  });
  it("enforces the complimentary application link at database level", async () => {
    const booking = await service.reserveTickets(request());
    await expect(
      db
        .update(schema.ticketBookings)
        .set({ source: "staff", amountMinor: 0, unitPriceMinor: 0 })
        .where(and(eq(schema.ticketBookings.id, booking.id))),
    ).rejects.toThrow();
  });
  it("links whole paid bookings to one application without changing guests or prices", async () => {
    const one = await settle(2);
    const two = await settle(1);
    for (const booking of [one.booking, two.booking])
      await service.linkTicketBooking(
        { bookingId: booking.id, applicationId, expectedApplicationId: null },
        actorId,
      );
    const linked = await service.getTicketBooking(one.booking.id);
    expect(linked.booking).toMatchObject({
      applicationId,
      name: one.booking.name,
      email: one.booking.email,
      amountMinor: one.booking.amountMinor,
    });
    for (const ticket of linked.tickets)
      expect(
        (await service.getTicketAdmission(ticket.id)).application?.id,
      ).toBe(applicationId);
    expect(
      (await service.getTicketBooking(two.booking.id)).booking.applicationId,
    ).toBe(applicationId);
    await service.linkTicketBooking(
      {
        bookingId: one.booking.id,
        applicationId: null,
        expectedApplicationId: applicationId,
      },
      actorId,
    );
    expect(
      (await service.getTicketAdmission(linked.tickets[0].id)).application,
    ).toBeNull();
    expect(
      (await service.getTicketBooking(two.booking.id)).booking.applicationId,
    ).toBe(applicationId);
  });
  it("rejects stale links, deleted applications and changing complimentary entitlements", async () => {
    const paid = await settle();
    const complimentaryBooking = await service.issueComplimentaryTickets(
      complimentary(),
      actorId,
    );
    await expect(
      service.linkTicketBooking(
        {
          bookingId: complimentaryBooking.id,
          applicationId: null,
          expectedApplicationId: applicationId,
        },
        actorId,
      ),
    ).rejects.toThrow("Complimentary");
    await expect(
      service.linkTicketBooking(
        {
          bookingId: paid.booking.id,
          applicationId,
          expectedApplicationId: crypto.randomUUID(),
        },
        actorId,
      ),
    ).rejects.toThrow("link changed");
    await db
      .update(schema.applications)
      .set({ deletedAt: new Date() })
      .where(eq(schema.applications.id, applicationId));
    await expect(
      service.linkTicketBooking(
        {
          bookingId: paid.booking.id,
          applicationId,
          expectedApplicationId: null,
        },
        actorId,
      ),
    ).rejects.toThrow("submitted application");
  });
  it("returns safe admission states and hides deleted application links", async () => {
    const booking = await service.issueComplimentaryTickets(
      complimentary(),
      actorId,
    );
    const { tickets } = await service.getTicketBooking(booking.id);
    expect(await service.getTicketAdmission(tickets[0].id)).toMatchObject({
      status: "valid",
      name: "Submitted Guest",
      phone: "+94771234567",
      bookingReference: booking.reference,
      complimentary: true,
      application: {
        id: applicationId,
        nomineeName: "Submitted Guest",
        category: "Test",
        nomination: "Test nomination",
      },
    });
    await service.checkInTicket(tickets[0].id, actorId);
    expect((await service.getTicketAdmission(tickets[0].id)).status).toBe(
      "used",
    );
    await db
      .update(schema.applications)
      .set({ deletedAt: new Date() })
      .where(eq(schema.applications.id, applicationId));
    expect(
      (await service.getTicketAdmission(tickets[0].id)).application,
    ).toBeNull();
    await db
      .update(schema.guestTickets)
      .set({ voidedAt: new Date() })
      .where(eq(schema.guestTickets.id, tickets[0].id));
    expect((await service.getTicketAdmission(tickets[0].id)).status).toBe(
      "invalid",
    );
  });
});

describe("ticket webhooks, private downloads and mail", () => {
  function webhookRequest(
    transactionId: string,
    localId: string,
    signed = true,
  ) {
    return new Request("http://localhost:3102/api/webhooks/genie-tickets", {
      method: "POST",
      headers: signed
        ? {
            "x-signature-nonce": "test",
            "x-signature-timestamp": "123",
            "x-signature": createHash("sha256")
              .update("test123test-key")
              .digest("hex"),
          }
        : {},
      body: JSON.stringify({
        eventType: "NOTIFY_TRANSACTION_CHANGE",
        transactionId,
        localId,
      }),
    });
  }
  it("requires a signed webhook and reconciles confirmed transactions idempotently", async () => {
    const data = await checkout();
    data.transaction.state = "CONFIRMED";
    expect(
      (
        await ticketWebhook(
          webhookRequest(data.attempt!.transactionId!, data.attempt!.id, false),
        )
      ).status,
    ).toBe(401);
    expect(
      (await service.getTicketBooking(data.booking.id)).tickets,
    ).toHaveLength(0);
    expect(
      (
        await ticketWebhook(
          webhookRequest(data.attempt!.transactionId!, data.attempt!.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await ticketWebhook(
          webhookRequest(data.attempt!.transactionId!, data.attempt!.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (await service.getTicketBooking(data.booking.id)).tickets,
    ).toHaveLength(1);
  });
  it("rejects a signed webhook whose transaction amount is wrong", async () => {
    const data = await checkout();
    data.transaction.state = "CONFIRMED";
    data.transaction.amount = 1;
    expect(
      (
        await ticketWebhook(
          webhookRequest(data.attempt!.transactionId!, data.attempt!.id),
        )
      ).status,
    ).toBe(503);
    expect(
      (await service.getTicketBooking(data.booking.id)).tickets,
    ).toHaveLength(0);
  });
  it("automatically invalidates all tickets and releases seats for a verified refund callback", async () => {
    const data = await settle(3);
    await service.checkInTicket(data.tickets[0].id, actorId);
    remote.get(data.attempt!.transactionId!)!.state = "REFUNDED";
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await ticketWebhook(
            webhookRequest(data.attempt!.transactionId!, data.attempt!.id),
          )
        ).status,
      ).toBe(200);
    }
    const result = await service.getTicketBooking(data.booking.id);
    expect(result.booking.status).toBe("refunded");
    expect(result.booking.confirmedAt).toBeTruthy();
    expect(result.tickets).toHaveLength(3);
    expect(result.tickets.every((ticket) => !!ticket.voidedAt)).toBe(true);
    expect(result.tickets[0].checkedInAt).toBeTruthy();
    expect((await service.ticketInventory(db, saleId)).issued).toBe(0);
    expect(
      (await service.getTicketAdmission(result.tickets[1].id)).status,
    ).toBe("invalid");
    await expect(
      service.checkInTicket(result.tickets[1].id, actorId),
    ).rejects.toThrow("not valid");
    await expect(buildGuestTicketPdf(data.booking.id)).rejects.toThrow();
  });
  it("requires the booking credential and returns a private PDF download", async () => {
    const data = await settle();
    const context = { params: Promise.resolve({ id: data.booking.id }) };
    expect(
      (await ticketDownload(new Request("http://localhost/test"), context))
        .status,
    ).toBe(403);
    cookieValues.set(`gbe_ticket_${data.booking.id}`, "a".repeat(64));
    const response = await ticketDownload(
      new Request("http://localhost/test"),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    cookieValues.set(`gbe_ticket_${data.booking.id}`, "b".repeat(64));
    expect(
      (await ticketDownload(new Request("http://localhost/test"), context))
        .status,
    ).toBe(403);
  });
  it("sends the real ticket template and PDF through the durable outbox", async () => {
    const data = await settle(2);
    await processEmailOutbox(1000);
    const sent = emailSend.mock.calls.find(
      ([input]) => input.subject === "Your GBE Awards guest tickets",
    )?.[0];
    expect(sent).toBeTruthy();
    expect(sent.html).toContain("2 guest tickets");
    expect(sent.html).toContain("View tickets");
    expect(sent.attachments[0].path).toContain(
      `/api/public/tickets/${data.booking.id}/download`,
    );
    const attachment = await ticketDownload(
      new Request(sent.attachments[0].path),
      { params: Promise.resolve({ id: data.booking.id }) },
    );
    expect(attachment.status).toBe(200);
    expect(
      Buffer.from(await attachment.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
    expect(
      validTicketAccessToken(
        data.booking.id,
        ticketDocumentToken(data.booking.id),
      ),
    ).toBe(false);
    const badAttachment = await ticketDownload(
      new Request(
        sent.attachments[0].path.replace(
          ticketDocumentToken(data.booking.id),
          "a".repeat(64),
        ),
      ),
      { params: Promise.resolve({ id: data.booking.id }) },
    );
    expect(badAttachment.status).toBe(403);
    const [email] = await db
      .select()
      .from(schema.emailOutbox)
      .where(
        eq(
          schema.emailOutbox.idempotencyKey,
          `guest-tickets:${data.booking.id}:initial`,
        ),
      );
    expect(email.status).toBe("sent");
    const count = emailSend.mock.calls.length;
    await processEmailOutbox(1000);
    expect(emailSend.mock.calls.length).toBe(count);
  });
  it("cancels queued mail after a refund instead of sending invalid tickets", async () => {
    const data = await settle();
    remote.get(data.attempt!.transactionId!)!.state = "REFUNDED";
    await payments.reconcileTicketPayment(data.attempt!.id);
    await processEmailOutbox(1000);
    const [email] = await db
      .select()
      .from(schema.emailOutbox)
      .where(
        eq(
          schema.emailOutbox.idempotencyKey,
          `guest-tickets:${data.booking.id}:initial`,
        ),
      );
    expect(email.status).toBe("cancelled");
    expect(
      emailSend.mock.calls.some(
        ([input]) => input.subject === "Your GBE Awards guest tickets",
      ),
    ).toBe(false);
  });
});
