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
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../../src/lib/db/schema";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async () => "https://storage.example.test/test-upload",
}));
vi.mock("@/lib/r2/client", () => ({
  r2ObjectKey: (key: string) => `e2e/genie/${key}`,
  getR2: () => ({
    send: async (command: { input: { Range?: string } }) =>
      command.input.Range
        ? {
            Body: {
              transformToByteArray: async () =>
                Buffer.from("%PDF-1.4\nSandbox payment proof\n"),
            },
          }
        : { ContentLength: 31, ETag: "test-etag" },
  }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/server/security/request", () => ({
  assertSameOrigin: async () => {},
}));
vi.mock("@/server/security/rate-limit", () => ({
  enforceRateLimit: async () => {},
}));
vi.mock("@/server/security/payment-session", () => ({
  requirePaymentSession: async (id: string) => {
    const [payment] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.applicationId, id));
    if (!payment) throw new Error("Payment session unavailable.");
    return { payment };
  },
}));
vi.mock("@/lib/env", () => ({
  env: {
    GENIE_ENABLED: "true",
    GENIE_ENVIRONMENT: "sandbox",
    GENIE_API_KEY: "test-key",
    GENIE_APP_ID: "test-app",
    APP_ENV: "local",
  },
  publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3101" },
}));
const client = postgres(process.env.TEST_DATABASE_URL!, { max: 8 });
const db = drizzle(client, { schema });
let cycleId: string;
let categoryId: string;
let nextId = 1;
const remote = new Map<string, Record<string, unknown>>();
let createCount = 0;
let failCreate = false;
const { startCardCheckout, reconcileCardAttempt } =
  await import("../../src/server/services/card-payments");
const { POST: paymentAction } =
  await import("../../src/app/api/public/payments/[applicationId]/route");
const { POST: webhook } =
  await import("../../src/app/api/webhooks/genie/route");
const { POST: proofAction } =
  await import("../../src/app/api/public/payments/[applicationId]/proof/route");

beforeAll(async () => {
  const [cycle] = await db
    .insert(schema.awardCycles)
    .values({
      name: "Genie tests",
      slug: "genie-tests",
      year: 2026,
      status: "open",
      timezone: "Asia/Colombo",
      opensAt: new Date("2026-01-01"),
      closesAt: new Date("2027-01-01"),
      supportEmail: "test@example.test",
      heading: "Test",
      introCopy: "Test",
      declarationText: "Test declaration",
      declarationVersion: "1",
      termsVersion: "1",
      privacyVersion: "1",
      formSchemaVersion: "1",
      nominationFeeMinor: 6500000,
      currency: "LKR",
    })
    .returning();
  cycleId = cycle.id;
  const [category] = await db
    .insert(schema.awardCategories)
    .values({
      cycleId,
      name: "Test category",
      code: "TEST",
      slug: "genie-test",
    })
    .returning();
  categoryId = category.id;
});
beforeEach(() => {
  createCount = 0;
  failCreate = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        createCount++;
        if (failCreate) throw new Error("network timeout");
        const input = JSON.parse(String(init.body));
        const id = (nextId++).toString(16).padStart(24, "0");
        const row = {
          id,
          amount: input.amount,
          currency: input.currency,
          localId: input.localId,
          state: "INITIATED",
          merchantId: "test",
          originatorApp: "test-app",
          url: `https://transaction.uat.geniebiz.lk/${id}`,
        };
        remote.set(id, row);
        return Response.json(row);
      }
      return Response.json(remote.get(url.split("/").at(-1)!) ?? {}, {
        status: 200,
      });
    }),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await client.end();
});
async function fixture() {
  const [app] = await db
    .insert(schema.applications)
    .values({
      cycleId,
      categoryId,
      nomineeName: "Test",
      awardNomination: "Test nomination",
      emailNormalised: "test@example.test",
      emailDisplay: "test@example.test",
      phoneDisplay: "+94771234567",
      categoryNameSnapshot: "Test",
      categoryCodeSnapshot: "TEST",
      declarationAccepted: true,
      declarationTextSnapshot: "Test",
      declarationVersion: "1",
      termsVersion: "1",
      privacyVersion: "1",
      formSchemaVersion: "1",
      workflowStatus: "submitted",
      submittedAt: new Date(),
      reference: `TEST-${crypto.randomUUID()}`,
      paymentStatus: "awaiting_payment",
    })
    .returning();
  const [payment] = await db
    .insert(schema.payments)
    .values({
      applicationId: app.id,
      method: "card",
      status: "awaiting_payment",
      expectedAmountMinor: 6500000,
      currency: "LKR",
      paymentReference: `PAY-${crypto.randomUUID()}`,
    })
    .returning();
  return { app, payment };
}
async function attempt(paymentId: string) {
  return (
    await db
      .select()
      .from(schema.paymentAttempts)
      .where(eq(schema.paymentAttempts.paymentId, paymentId))
  ).at(-1)!;
}
describe("durable Genie reconciliation", () => {
  it("accepts one validated bank slip, rejects oversize and foreign uploads, and makes completion idempotent", async () => {
    const { app, payment } = await fixture();
    await db
      .update(schema.payments)
      .set({ method: "bank_transfer" })
      .where(eq(schema.payments.id, payment.id));
    const call = (body: object) =>
      proofAction(
        new Request("https://example.test", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ applicationId: app.id }) },
      );
    expect(
      (
        await call({
          action: "prepare",
          name: "proof.pdf",
          type: "application/pdf",
          size: 6000000,
        })
      ).status,
    ).toBe(400);
    expect(
      (await call({ action: "complete", fileId: crypto.randomUUID() })).status,
    ).toBe(400);
    const response = await call({
      action: "prepare",
      name: "proof.pdf",
      type: "application/pdf",
      size: 31,
    });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(
      (await call({ action: "complete", fileId: data.fileId })).status,
    ).toBe(200);
    expect(
      (await call({ action: "complete", fileId: data.fileId })).status,
    ).toBe(200);
    expect(
      (
        await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, payment.id))
      )[0].status,
    ).toBe("proof_submitted");
    expect(
      await db
        .select()
        .from(schema.applicationFiles)
        .where(eq(schema.applicationFiles.applicationId, app.id)),
    ).toHaveLength(1);
    await expect(startCardCheckout(app.id)).rejects.toThrow(/reviewed/);
  });
  it("refuses bank switching during checkout and permits it after confirmed cancellation", async () => {
    const { app, payment } = await fixture();
    await startCardCheckout(app.id);
    const call = () =>
      paymentAction(
        new Request("https://example.test", {
          method: "POST",
          body: JSON.stringify({ action: "bank_transfer" }),
        }),
        { params: Promise.resolve({ applicationId: app.id }) },
      );
    expect((await call()).status).toBe(400);
    const row = await attempt(payment.id);
    remote.get(row.transactionId!)!.state = "CANCELLED";
    await reconcileCardAttempt(row.id);
    expect((await call()).status).toBe(200);
    expect(
      (
        await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, payment.id))
      )[0].method,
    ).toBe("bank_transfer");
  });
  it("rejects forged webhooks and ignores payload state even with valid headers", async () => {
    const { app, payment } = await fixture();
    await startCardCheckout(app.id);
    const row = await attempt(payment.id);
    const body = JSON.stringify({
      eventType: "NOTIFY_TRANSACTION_CHANGE",
      transactionId: row.transactionId,
      localId: row.id,
      state: "CONFIRMED",
    });
    expect(
      (
        await webhook(
          new Request("https://example.test", { method: "POST", body }),
        )
      ).status,
    ).toBe(401);
    const headers = {
      "x-signature-nonce": "test",
      "x-signature-timestamp": "123",
      "x-signature": createHash("sha256")
        .update("test123test-key")
        .digest("hex"),
    };
    const call = () =>
      webhook(
        new Request("https://example.test", { method: "POST", headers, body }),
      );
    expect((await call()).status).toBe(200);
    expect(
      (
        await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, payment.id))
      )[0].status,
    ).toBe("awaiting_payment");
    remote.get(row.transactionId!)!.amount = 1;
    expect((await call()).status).toBe(503);
  });
  it("unlocks a definitively rejected create request without leaving an unknown checkout", async () => {
    const { app, payment } = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "Forbidden" }, { status: 403 }),
      ),
    );
    await expect(startCardCheckout(app.id)).rejects.toThrow(/unavailable/);
    expect((await attempt(payment.id)).active).toBe(false);
    expect((await attempt(payment.id)).state).toBe("REJECTED");
  });
  it("allows only one checkout when requests race", async () => {
    const { app, payment } = await fixture();
    await Promise.allSettled([
      startCardCheckout(app.id),
      startCardCheckout(app.id),
      startCardCheckout(app.id),
    ]);
    expect(createCount).toBe(1);
    expect(
      await db
        .select()
        .from(schema.paymentAttempts)
        .where(eq(schema.paymentAttempts.paymentId, payment.id)),
    ).toHaveLength(1);
  });
  it("settles once, keeps one receipt, and ignores a delayed pending response", async () => {
    const { app, payment } = await fixture();
    await startCardCheckout(app.id);
    const row = await attempt(payment.id);
    remote.get(row.transactionId!)!.state = "CONFIRMED";
    await Promise.all([
      reconcileCardAttempt(row.id),
      reconcileCardAttempt(row.id),
    ]);
    const [paid] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, payment.id));
    expect(paid.status).toBe("verified");
    expect(paid.amountMinor).toBe(6500000);
    expect(paid.proofApplicationFileId).toBeNull();
    expect(paid.receiptReference).toBeTruthy();
    expect(
      (
        await db
          .select()
          .from(schema.applications)
          .where(eq(schema.applications.id, app.id))
      )[0].paymentStatus,
    ).toBe("verified");
    remote.get(row.transactionId!)!.state = "INITIATED";
    await reconcileCardAttempt(row.id);
    expect(
      (
        await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, payment.id))
      )[0].receiptReference,
    ).toBe(paid.receiptReference);
    expect((await attempt(payment.id)).state).toBe("CONFIRMED");
  });
  it("blocks mismatched amounts and does not verify an authorisation", async () => {
    const { app, payment } = await fixture();
    await startCardCheckout(app.id);
    const row = await attempt(payment.id);
    const txn = remote.get(row.transactionId!)!;
    txn.amount = 1;
    txn.state = "CONFIRMED";
    await expect(reconcileCardAttempt(row.id)).rejects.toThrow(/match/);
    txn.amount = 6500000;
    txn.state = "AUTHORIZED";
    await reconcileCardAttempt(row.id);
    expect(
      (
        await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, payment.id))
      )[0].status,
    ).toBe("awaiting_payment");
    expect((await attempt(payment.id)).active).toBe(true);
  });
  it("retries only after a provider-confirmed terminal failure", async () => {
    const { app, payment } = await fixture();
    await startCardCheckout(app.id);
    const row = await attempt(payment.id);
    remote.get(row.transactionId!)!.state = "CANCELLED";
    await reconcileCardAttempt(row.id);
    await startCardCheckout(app.id);
    expect(createCount).toBe(2);
  });
  it("retains an ambiguous create timeout instead of charging again", async () => {
    const { app, payment } = await fixture();
    failCreate = true;
    await expect(startCardCheckout(app.id)).rejects.toThrow();
    await expect(startCardCheckout(app.id)).rejects.toThrow();
    expect(createCount).toBe(1);
    expect((await attempt(payment.id)).state).toBe("UNKNOWN");
  });
  it("does not modify legacy payment rows", async () => {
    const { app, payment } = await fixture();
    await db
      .update(schema.payments)
      .set({
        method: null,
        expectedAmountMinor: null,
        amountMinor: 5500000,
        status: "verified",
      })
      .where(eq(schema.payments.id, payment.id));
    await expect(startCardCheckout(app.id)).rejects.toThrow(/eligible/);
    expect(
      (
        await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, payment.id))
      )[0].amountMinor,
    ).toBe(5500000);
  });
});
