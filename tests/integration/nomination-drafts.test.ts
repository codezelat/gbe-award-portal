import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  NOMINATION_OFFER,
  nominationPricing,
} from "../../src/lib/domain/nomination-pricing";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../../src/lib/db/schema";
import { declarationText } from "../../src/config/brand";
import {
  saveDraftSchema,
  type DraftCredential,
} from "../../src/lib/validation/nomination-draft";
import { initiateApplicationSchema } from "../../src/lib/validation/application";

const security = vi.hoisted(() => ({ origin: vi.fn(), rate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/dal/auth", () => ({
  requireStaff: async () => {
    if (!staffAllowed) throw new Error("Staff access required.");
    return { profile: { id: actorId }, membership: { role: "staff" } };
  },
  hasPermission: (_membership: unknown, permission: string) =>
    permission !== "configuration.manage" || configAllowed,
}));
vi.mock("@/server/security/request", () => ({
  assertSameOrigin: security.origin,
}));
vi.mock("@/server/security/turnstile", () => ({
  verifyTurnstile: async (token: string) => {
    if (token !== "test-verified") throw new Error("Verification failed.");
  },
}));
vi.mock("@/server/security/rate-limit", () => ({
  enforceRateLimit: security.rate,
}));
vi.mock("@/server/services/feature-flags", () => ({
  requireFeatureFlag: async () => {},
}));
vi.mock("@/server/jobs/schedule-email-delivery", () => ({
  scheduleEmailOutboxProcessing: vi.fn(),
}));
vi.mock("@/server/security/payment-session", () => ({
  setPaymentSession: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  requireProvider: () => {},
  publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
  env: {
    BETTER_AUTH_SECRET: "isolated-test-secret",
    R2_PRIVATE_BUCKET: "test",
    SUPPORT_EMAIL: "admin@example.test",
  },
}));
vi.mock("@/server/services/genie-client", () => ({ requireGenie: () => {} }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async (_client: unknown, command: { input: { Key: string } }) =>
    `https://storage.example.test/${command.input.Key}`,
}));
vi.mock("@/lib/r2/client", () => ({
  r2ObjectKey: (key: string) => `e2e/drafts/${key}`,
  getR2: () => ({
    send: async (command: {
      constructor: { name: string };
      input: { Key: string; Range?: string };
    }) => {
      if (command.constructor.name === "DeleteObjectCommand") {
        objects.delete(command.input.Key);
        return {};
      }
      const bytes = objects.get(command.input.Key);
      if (!bytes) throw new Error("Object unavailable.");
      return command.input.Range
        ? { Body: { transformToByteArray: async () => bytes } }
        : { ContentLength: bytes.length, ETag: "test-etag" };
    },
  }),
}));

const client = postgres(process.env.TEST_DATABASE_URL!, { max: 8 });
const db = drizzle(client, { schema });
const objects = new Map<string, Buffer>();
const pdf = Buffer.from("%PDF-1.4\nDraft test attachment\n");
let cycleId: string, categoryId: string, actorId: string;
let staffAllowed = true;
let configAllowed = false;
let nextPayment = 1000;
const { saveNominationDraft, confirmDraftFiles, initiateDraftSubmission } =
  await import("../../src/server/services/nomination-drafts");
const { POST: complete } =
  await import("../../src/app/api/public/applications/complete/route");
const { POST: initiate } =
  await import("../../src/app/api/public/applications/initiate/route");
const { POST: draftRequest } =
  await import("../../src/app/api/public/drafts/route");
const { deleteInProgress, deleteInProgressBatch } =
  await import("../../src/server/actions/draft-actions");
const { getInProgress } = await import("../../src/server/dal/in-progress");
const { getNominationOffer, saveNominationOffer, nominationOfferKey } =
  await import("../../src/server/services/nomination-offers");
const { saveNominationOfferAction } =
  await import("../../src/server/actions/nomination-offer-actions");
const { cleanupStaleUploads } = await import("../../src/server/jobs/cleanup");
const { purgeIncompleteNominationShell } =
  await import("../../src/server/services/incomplete-nomination-cleanup");
const {
  issueSpecialInvites,
  claimSpecialInvite,
  getDraftNominationPricing,
  revokeUnusedInvite,
} = await import("../../src/server/services/special-invites");
const inviteCodes =
  await import("../../src/server/security/special-invite-code");
const { decryptInviteCode } = inviteCodes;
const { generateSpecialInvites } =
  await import("../../src/server/actions/special-invite-actions");
const { GET: downloadInvites } =
  await import("../../src/app/api/admin/special-invites/download/route");
const { POST: claimInviteRequest } =
  await import("../../src/app/api/public/special-invites/route");
const { getSpecialInvites } =
  await import("../../src/server/dal/special-invites");
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOMINATION_OFFER.startsAt);
  staffAllowed = true;
  configAllowed = false;
  security.origin.mockReset().mockResolvedValue(new Headers());
  security.rate.mockReset().mockResolvedValue(undefined);
  const key = crypto.randomUUID();
  const [cycle] = await db
    .insert(schema.awardCycles)
    .values({
      name: "Draft tests",
      slug: key,
      year: 2026,
      status: "open",
      timezone: "Asia/Colombo",
      opensAt: new Date("2026-01-01"),
      closesAt: new Date("2030-01-01"),
      supportEmail: "test@example.test",
      heading: "Test",
      introCopy: "Test",
      declarationText,
      declarationVersion: "1",
      termsVersion: "1",
      privacyVersion: "1",
      formSchemaVersion: "1",
      nominationFeeMinor: 6500000,
      currency: "LKR",
    })
    .returning();
  cycleId = cycle.id;
  await db
    .insert(schema.cycleSequences)
    .values({ cycleId, nextPaymentNumber: nextPayment++ });
  const [category] = await db
    .insert(schema.awardCategories)
    .values({ cycleId, name: "Test category", code: "TEST", slug: key })
    .returning();
  categoryId = category.id;
  await db
    .insert(schema.user)
    .values({ id: key, name: "Test staff", email: `${key}@example.test` });
  const [profile] = await db
    .insert(schema.profiles)
    .values({
      authUserId: key,
      accountKind: "staff",
      displayName: "Test staff",
    })
    .returning();
  actorId = profile.id;
});
afterAll(async () => {
  await client.end();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const credential = (): DraftCredential => ({
  id: crypto.randomUUID(),
  secret: crypto.randomUUID().replaceAll("-", "").repeat(2),
});
const contact = () => ({
  nomineeName: "Draft Company",
  email: "draft@example.test",
  phone: "+94771234567",
  categoryId,
  awardNomination: "Excellence in business and leadership.",
  paymentMethod: "card" as const,
});
const save = (
  key: DraftCredential,
  version = 0,
  step = 0,
  data: object = { nomineeName: "Draft Company" },
  files: object[] = [],
) =>
  saveNominationDraft(
    saveDraftSchema.parse({
      credential: key,
      cycleId,
      version,
      step,
      data,
      files,
      turnstileToken: "test-verified",
      startedAt: Date.now() - 5000,
      honeypot: "",
    }),
  );
async function prepared(withFile = false) {
  const key = credential();
  let saved = await save(key);
  const manifest = withFile
    ? [
        {
          id: crypto.randomUUID(),
          name: "proof.pdf",
          size: pdf.length,
          type: "application/pdf",
          kind: "payment_proof" as const,
        },
      ]
    : [];
  const data = {
    ...contact(),
    paymentMethod: withFile ? ("bank_transfer" as const) : ("card" as const),
  };
  saved = await save(key, saved.version, 2, data, manifest);
  for (const item of manifest)
    objects.set(`e2e/drafts/drafts/${key.id}/${item.id}`, pdf);
  await confirmDraftFiles(key, saved.version);
  const input = initiateApplicationSchema.parse({
    ...data,
    declarationAccepted: true,
    declarationText,
    turnstileToken: "test-verified",
    honeypot: "",
    startedAt: Date.now() - 5000,
    idempotencyKey: crypto.randomUUID(),
    draftCredential: key,
    files: manifest,
    acceptedAmountMinor: nominationPricing({
      year: 2026,
      currency: "LKR",
      nominationFeeMinor: 6_500_000,
    }).amountMinor,
  });
  return { key, input, saved, manifest };
}
const finish = (
  session: { sessionToken: string; idempotencyKey: string },
  amount = 6_500_000,
) =>
  complete(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ...session, acceptedAmountMinor: amount }),
    }),
  );

async function issue(quantity = 1, discountMinor = 500000) {
  const input = {
    requestId: crypto.randomUUID(),
    cycleId,
    discountMinor,
    quantity,
  };
  const result = await issueSpecialInvites(input, actorId);
  const rows = await db
    .select()
    .from(schema.specialInvites)
    .where(eq(schema.specialInvites.batchId, result.batchId));
  return {
    input,
    result,
    rows,
    code: decryptInviteCode(rows[0].codeEncrypted),
  };
}

describe("special invites", () => {
  it("protects public claims with origin checks, body validation and both rate limits", async () => {
    const invite = await issue();
    const { key } = await prepared();
    const body = JSON.stringify({
      credential: key,
      code: invite.code.toLowerCase(),
    });
    const request = (text = body) =>
      claimInviteRequest(
        new Request("https://example.test/api/public/special-invites", {
          method: "POST",
          body: text,
        }),
      );
    security.origin.mockRejectedValueOnce(new Error("Unexpected origin"));
    expect((await request()).status).toBe(400);
    expect((await request("x".repeat(2049))).status).toBe(400);
    expect((await request("{")).status).toBe(400);
    expect(
      (await request(JSON.stringify({ credential: key, code: "BAD" }))).status,
    ).toBe(400);
    security.rate.mockRejectedValueOnce(new Error("Rate exceeded"));
    expect((await request()).status).toBe(429);
    security.rate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Rate exceeded"));
    expect((await request()).status).toBe(429);
    const [unchanged] = await db
      .select()
      .from(schema.specialInvites)
      .where(eq(schema.specialInvites.id, invite.rows[0].id));
    expect(unchanged.draftId).toBeNull();
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result.pricing.amountMinor).toBe(6000000);
    expect(JSON.stringify(result)).not.toContain(invite.code);
    expect(security.rate).toHaveBeenCalledWith(
      `invite-draft:${key.id}`,
      5,
      900,
    );
    expect(security.rate).toHaveBeenCalledWith(
      expect.stringMatching(/^invite-ip:/),
      20,
      900,
    );
  });
  it("retries a generated code collision without issuing duplicates", async () => {
    const existing = await issue();
    const generator = vi.spyOn(inviteCodes, "generateInviteCode");
    generator.mockReturnValueOnce(existing.code);
    const next = await issue();
    expect(next.code).not.toBe(existing.code);
    expect(next.rows).toHaveLength(1);
    expect(generator).toHaveBeenCalledTimes(2);
  });
  it("rejects the wrong cycle, closed nominations and drafts without saved contact details", async () => {
    const invite = await issue();
    const key = credential();
    await save(key);
    await expect(claimSpecialInvite(key, invite.code)).rejects.toThrow(
      /contact details/,
    );
    const ready = await prepared();
    const [cycle] = await db
      .select()
      .from(schema.awardCycles)
      .where(eq(schema.awardCycles.id, cycleId));
    const otherId = crypto.randomUUID();
    await db
      .insert(schema.awardCycles)
      .values({ ...cycle, id: otherId, slug: otherId });
    const other = await issueSpecialInvites(
      { ...invite.input, requestId: crypto.randomUUID(), cycleId: otherId },
      actorId,
    );
    const [otherCode] = await db
      .select()
      .from(schema.specialInvites)
      .where(eq(schema.specialInvites.batchId, other.batchId));
    await expect(
      claimSpecialInvite(ready.key, decryptInviteCode(otherCode.codeEncrypted)),
    ).rejects.toThrow(/invalid or no longer/);
    await db
      .update(schema.awardCycles)
      .set({ status: "closed" })
      .where(eq(schema.awardCycles.id, cycleId));
    await expect(claimSpecialInvite(ready.key, invite.code)).rejects.toThrow(
      /not currently open/,
    );
    const [unused] = await db
      .select()
      .from(schema.specialInvites)
      .where(eq(schema.specialInvites.id, invite.rows[0].id));
    expect(unused.draftId).toBeNull();
  });
  it("issues unique encrypted codes and idempotent concurrent batches without changing historical fees", async () => {
    const input = {
      requestId: crypto.randomUUID(),
      cycleId,
      discountMinor: 500000,
      quantity: 100,
    };
    const result = await Promise.all([
      issueSpecialInvites(input, actorId),
      issueSpecialInvites(input, actorId),
    ]);
    expect(result[0]).toEqual(result[1]);
    const rows = await db
      .select()
      .from(schema.specialInvites)
      .where(eq(schema.specialInvites.batchId, input.requestId));
    expect(rows).toHaveLength(100);
    const codes = rows.map((row) => decryptInviteCode(row.codeEncrypted));
    expect(new Set(codes).size).toBe(100);
    expect(codes.every((code) => /^[A-Z0-9]{6}$/.test(code))).toBe(true);
    expect(rows.every((row) => !codes.includes(row.codeEncrypted))).toBe(true);
    await expect(
      issueSpecialInvites({ ...input, quantity: 1 }, actorId),
    ).rejects.toThrow(/request changed/);
    const [cycle] = await db
      .select()
      .from(schema.awardCycles)
      .where(eq(schema.awardCycles.id, cycleId));
    expect(cycle.nominationFeeMinor).toBe(6500000);
  });
  it("validates positive payable amounts, quantity and staff issuing permissions", async () => {
    const input = {
      requestId: crypto.randomUUID(),
      cycleId,
      amount: "5000",
      quantity: 1,
    };
    expect((await generateSpecialInvites(input)).ok).toBe(false);
    configAllowed = true;
    expect((await generateSpecialInvites({ ...input, quantity: 101 })).ok).toBe(
      false,
    );
    expect(
      (await generateSpecialInvites({ ...input, amount: "65000" })).ok,
    ).toBe(false);
    expect((await generateSpecialInvites({ ...input, amount: "-1" })).ok).toBe(
      false,
    );
    expect((await generateSpecialInvites(input)).ok).toBe(true);
  });
  it("reserves to exactly one draft, accepts case-insensitive retries and never restarts its hour", async () => {
    const invite = await issue();
    const a = await prepared(),
      b = await prepared();
    const outcomes = await Promise.allSettled([
      claimSpecialInvite(a.key, invite.code),
      claimSpecialInvite(b.key, invite.code),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [stored] = await db
      .select()
      .from(schema.specialInvites)
      .where(eq(schema.specialInvites.id, invite.rows[0].id));
    const owner = stored.draftId === a.key.id ? a : b;
    vi.setSystemTime(Date.now() + 60000);
    const pricing = await claimSpecialInvite(
      owner.key,
      invite.code.toLowerCase(),
    );
    expect(pricing.specialInvite?.expiresAt).toBe(
      NOMINATION_OFFER.startsAt + 3600000,
    );
    expect(pricing.amountMinor).toBe(6000000);
    const [extra] = (await issue()).rows;
    await expect(
      claimSpecialInvite(owner.key, decryptInviteCode(extra.codeEncrypted)),
    ).rejects.toThrow(/one special invite/);
    await expect(
      claimSpecialInvite({ ...owner.key, secret: "0".repeat(64) }, invite.code),
    ).rejects.toThrow(/no longer available/);
    const resumed = await draftRequest(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ action: "resume", credential: owner.key }),
      }),
    );
    expect((await resumed.json()).data.pricing.amountMinor).toBe(6000000);
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.applicationId, stored.applicationId!)),
    ).toHaveLength(0);
  });
  it.each([false, true])(
    "consumes exactly once on %s bank submission, keeps discounted snapshots and moves the admin link",
    async (bank) => {
      const invite = await issue();
      const { key, input } = await prepared(bank);
      await claimSpecialInvite(key, invite.code);
      const before = await getSpecialInvites({
        cycleId,
        history: true,
        page: 1,
      });
      expect(before.rows[0].href).toContain(`/admin/in-progress/${key.id}`);
      const session = await initiateDraftSubmission({
        ...input,
        acceptedAmountMinor: 6000000,
      });
      const responses = await Promise.all([
        finish(session, 6000000),
        finish(session, 6000000),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const [used] = await db
        .select()
        .from(schema.specialInvites)
        .where(eq(schema.specialInvites.id, invite.rows[0].id));
      expect(used.consumedAt).not.toBeNull();
      const [payment] = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.applicationId, used.applicationId!));
      expect(payment.expectedAmountMinor).toBe(6000000);
      expect(payment.method).toBe(bank ? "bank_transfer" : "card");
      expect(
        (await getSpecialInvites({ cycleId, history: true, page: 1 })).rows[0]
          .href,
      ).toBe(`/admin/applications/${used.applicationId}`);
      vi.setSystemTime(NOMINATION_OFFER.endsAt + 1);
      expect((await finish(session, 8500000)).status).toBe(200);
      const [unchanged] = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, payment.id));
      expect(unchanged.expectedAmountMinor).toBe(6000000);
      await db
        .update(schema.applications)
        .set({ deletedAt: new Date() })
        .where(eq(schema.applications.id, used.applicationId!));
      const hidden = (
        await getSpecialInvites({ cycleId, history: true, page: 1 })
      ).rows[0];
      expect(hidden).toMatchObject({ status: "used", href: null, name: null });
      expect(
        (await getSpecialInvites({ cycleId, history: false, page: 1 })).total,
      ).toBe(0);
    },
  );
  it("locks the claimed fee across offer edits then expires exactly at an hour without consuming or losing files", async () => {
    const invite = await issue();
    const { key, input, saved } = await prepared(true);
    await claimSpecialInvite(key, invite.code);
    await saveNominationOffer({
      cycleId,
      expectedRevision: "",
      actorId,
      offer: { ...NOMINATION_OFFER, enabled: false },
    });
    expect(
      (
        await save(
          key,
          saved.version,
          2,
          { ...contact(), paymentMethod: "bank_transfer" },
          input.files,
        )
      ).pricing.amountMinor,
    ).toBe(6000000);
    vi.setSystemTime(NOMINATION_OFFER.startsAt + 59 * 60000);
    const session = await initiateDraftSubmission({
      ...input,
      acceptedAmountMinor: 6000000,
    });
    vi.setSystemTime(NOMINATION_OFFER.startsAt + 3600000);
    const expired = await finish(session, 6000000);
    expect(expired.status).toBe(409);
    expect((await expired.json()).pricing).toMatchObject({
      amountMinor: 8500000,
      specialInvite: { status: "expired" },
    });
    await expect(claimSpecialInvite(key, invite.code)).rejects.toThrow(
      /expired/,
    );
    const other = await prepared();
    await expect(claimSpecialInvite(other.key, invite.code)).rejects.toThrow(
      /no longer available/,
    );
    expect((await finish(session, 8500000)).status).toBe(200);
    const [row] = await db
      .select()
      .from(schema.specialInvites)
      .where(eq(schema.specialInvites.id, invite.rows[0].id));
    expect(row.consumedAt).toBeNull();
  });
  it("does not download claimed/used/cancelled invites and cancellation cannot undo a claim", async () => {
    configAllowed = true;
    const invite = await issue(2);
    const download = (query: string) =>
      downloadInvites(
        new Request(
          `https://example.test/api/admin/special-invites/download?${query}`,
        ),
      );
    const jpg = await download(`id=${invite.rows[0].id}`);
    expect(jpg.status).toBe(200);
    expect(jpg.headers.get("content-type")).toBe("image/jpeg");
    const { key } = await prepared();
    await claimSpecialInvite(key, invite.code);
    expect((await download(`id=${invite.rows[0].id}`)).status).toBe(409);
    await expect(
      revokeUnusedInvite(invite.rows[0].id, actorId),
    ).rejects.toThrow(/Only unused/);
    await revokeUnusedInvite(invite.rows[1].id, actorId);
    expect((await download(`batch=${invite.result.batchId}`)).status).toBe(409);
    configAllowed = false;
    expect((await download(`batch=${invite.result.batchId}`)).status).toBe(403);
  });
  it("cancels a deleted draft's claim permanently and never links deleted personal data", async () => {
    const invite = await issue();
    const { key } = await prepared();
    await claimSpecialInvite(key, invite.code);
    expect((await deleteInProgress({ id: key.id, source: "draft" })).ok).toBe(
      true,
    );
    const result = await getSpecialInvites({ cycleId, history: true, page: 1 });
    expect(result.rows[0]).toMatchObject({
      status: "cancelled",
      href: null,
      name: null,
    });
    const other = await prepared();
    await expect(claimSpecialInvite(other.key, invite.code)).rejects.toThrow(
      /no longer available/,
    );
  });
  it("does not accept a cancelled code, or one whose discount now exceeds the fee", async () => {
    const invite = await issue();
    const { key } = await prepared();
    await db
      .update(schema.specialInvites)
      .set({ revokedAt: new Date() })
      .where(eq(schema.specialInvites.id, invite.rows[0].id));
    await expect(claimSpecialInvite(key, invite.code)).rejects.toThrow(
      /invalid or no longer/,
    );
    const next = await issue();
    await saveNominationOffer({
      cycleId,
      expectedRevision: "",
      actorId,
      offer: { ...NOMINATION_OFFER, amountMinor: 100000 },
    });
    await expect(claimSpecialInvite(key, next.code)).rejects.toThrow(
      /current fee/,
    );
    const cycle = {
      id: cycleId,
      year: 2026,
      currency: "LKR",
      nominationFeeMinor: 6500000,
    };
    expect(
      (await getDraftNominationPricing(cycle, key.id)).specialInvite,
    ).toBeNull();
  });
});

describe("durable in-progress nominations", () => {
  it("persists an audited offer, rejects stale edits and leaves the base fee alone", async () => {
    const cycle = {
      id: cycleId,
      year: 2026,
      currency: "LKR",
      nominationFeeMinor: 6500000,
    };
    expect((await getNominationOffer(cycle)).revision).toBe("");
    const revision = await saveNominationOffer({
      cycleId,
      expectedRevision: "",
      offer: NOMINATION_OFFER,
      actorId,
    });
    expect((await getNominationOffer(cycle)).revision).toBe(revision);
    await expect(
      saveNominationOffer({
        cycleId,
        expectedRevision: "",
        offer: { ...NOMINATION_OFFER, amountMinor: 1 },
        actorId,
      }),
    ).rejects.toThrow("another window");
    const [stored] = await db
      .select()
      .from(schema.awardCycles)
      .where(eq(schema.awardCycles.id, cycleId));
    expect(stored.nominationFeeMinor).toBe(6500000);
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, cycleId));
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("nomination offer saved");
  });
  it("serializes concurrent first saves so one editor cannot overwrite another", async () => {
    const results = await Promise.allSettled(
      [6500000, 6000000].map((amountMinor) =>
        saveNominationOffer({
          cycleId,
          expectedRevision: "",
          actorId,
          offer: { ...NOMINATION_OFFER, amountMinor },
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("guards offer saves by configuration permission and validates server-side", async () => {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      cycleId,
      revision: "",
      enabled: "on",
      currency: "LKR",
      amount: "65000",
      standardAmount: "85000",
      startsAt: "2026-09-16T12:00",
      endsAt: "2026-09-17T12:00",
      bannerText: NOMINATION_OFFER.bannerText,
    }))
      data.set(key, value);
    const initial = { status: "idle" as const, message: "" };
    expect((await saveNominationOfferAction(initial, data)).status).toBe(
      "error",
    );
    expect(
      await db
        .select()
        .from(schema.systemSettings)
        .where(eq(schema.systemSettings.key, nominationOfferKey(cycleId))),
    ).toHaveLength(0);
    configAllowed = true;
    data.set("endsAt", "2026-09-15T12:00");
    expect((await saveNominationOfferAction(initial, data)).message).toContain(
      "End time",
    );
    data.set("endsAt", "2026-09-17T12:00");
    expect((await saveNominationOfferAction(initial, data)).status).toBe(
      "success",
    );
  });
  it.each([true, false])(
    "rechecks admin offer changes at final submission and preserves settled submissions (bank: %s)",
    async (bank) => {
      const { input, key } = await prepared(bank);
      const session = await initiateDraftSubmission(input);
      const revision = await saveNominationOffer({
        cycleId,
        expectedRevision: "",
        actorId,
        offer: { ...NOMINATION_OFFER, enabled: false },
      });
      const stale = await finish(session);
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({
        code: "PRICE_CHANGED",
        pricing: { phase: "disabled", amountMinor: 8500000 },
      });
      const [draft] = await db
        .select()
        .from(schema.nominationDrafts)
        .where(eq(schema.nominationDrafts.id, key.id));
      expect(draft.submittedAt).toBeNull();
      expect((await finish(session, 8500000)).status).toBe(200);
      await saveNominationOffer({
        cycleId,
        expectedRevision: revision,
        actorId,
        offer: { ...NOMINATION_OFFER, amountMinor: 5000000 },
      });
      expect((await finish(session, 5000000)).status).toBe(200);
      const [payment] = await db
        .select()
        .from(schema.payments)
        .where(
          eq(schema.payments.applicationId, session.sessionToken.split(".")[0]),
        );
      expect(payment.expectedAmountMinor).toBe(8500000);
      expect(payment.proofApplicationFileId !== null).toBe(bank);
    },
  );
  it("refreshes pricing on draft steps and fails closed for malformed stored offers", async () => {
    await saveNominationOffer({
      cycleId,
      expectedRevision: "",
      actorId,
      offer: { ...NOMINATION_OFFER, amountMinor: 6000000 },
    });
    expect((await save(credential())).pricing.amountMinor).toBe(6000000);
    await db
      .update(schema.systemSettings)
      .set({ value: { invalid: true } })
      .where(eq(schema.systemSettings.key, nominationOfferKey(cycleId)));
    await expect(
      getNominationOffer({
        id: cycleId,
        year: 2026,
        currency: "LKR",
        nominationFeeMinor: 6500000,
      }),
    ).rejects.toThrow();
  });
  it("enforces the same price on legacy clients without draft credentials", async () => {
    const { input } = await prepared();
    const { draftCredential: omitted, ...legacy } = input;
    expect(omitted).toBeDefined();
    vi.setSystemTime(NOMINATION_OFFER.endsAt);
    const request = (amount?: number) =>
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ ...legacy, acceptedAmountMinor: amount }),
      });
    expect((await initiate(request())).status).toBe(409);
    expect((await initiate(request(6_500_000))).status).toBe(409);
    const response = await initiate(request(8_500_000));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(
      (
        await finish(
          { ...result.data, idempotencyKey: input.idempotencyKey },
          8_500_000,
        )
      ).status,
    ).toBe(200);
    const [payment] = await db
      .select()
      .from(schema.payments)
      .where(
        eq(
          schema.payments.applicationId,
          result.data.sessionToken.split(".")[0],
        ),
      );
    expect(payment.expectedAmountMinor).toBe(8_500_000);
  });
  it.each([true, false])(
    "checks the final deadline and preserves retries (bank transfer: %s)",
    async (bank) => {
      vi.setSystemTime(NOMINATION_OFFER.endsAt - 60_000);
      const { input } = await prepared(bank);
      const session = await initiateDraftSubmission(input);
      const applicationId = session.sessionToken.split(".")[0];
      vi.setSystemTime(NOMINATION_OFFER.endsAt);
      const stale = await finish(session);
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({
        code: "PRICE_CHANGED",
        pricing: { amountMinor: 8_500_000 },
      });
      const [unsubmitted] = await db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.id, applicationId));
      expect(unsubmitted.reference).toBeNull();
      expect(unsubmitted.submittedAt).toBeNull();
      expect(
        await db
          .select()
          .from(schema.emailOutbox)
          .where(eq(schema.emailOutbox.applicationId, applicationId)),
      ).toHaveLength(0);
      const retry = await finish(session, 8_500_000);
      expect(retry.status).toBe(200);
      const [payment] = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.applicationId, applicationId));
      expect(payment.expectedAmountMinor).toBe(8_500_000);
      expect(payment.proofApplicationFileId !== null).toBe(bank);
      // A completed retry returns the original result, not a repriced nomination.
      expect((await finish(session)).status).toBe(200);
      expect(
        await db
          .select()
          .from(schema.emailOutbox)
          .where(eq(schema.emailOutbox.applicationId, applicationId)),
      ).toHaveLength(bank ? 2 : 0);
    },
  );

  it("does not reserve a discount for an unsubmitted draft", async () => {
    const { input } = await prepared();
    vi.setSystemTime(NOMINATION_OFFER.endsAt);
    await expect(initiateDraftSubmission(input)).rejects.toMatchObject({
      name: "NominationPriceChangedError",
    });
    const session = await initiateDraftSubmission({
      ...input,
      acceptedAmountMinor: 8_500_000,
    });
    expect((await finish(session, 8_500_000)).status).toBe(200);
  });

  it.each([true, false])(
    "never reprices a nomination already submitted during the offer (bank: %s)",
    async (bank) => {
      const { input } = await prepared(bank);
      const session = await initiateDraftSubmission(input);
      expect((await finish(session)).status).toBe(200);
      vi.setSystemTime(NOMINATION_OFFER.endsAt);
      expect((await finish(session, 8_500_000)).status).toBe(200);
      const [payment] = await db
        .select()
        .from(schema.payments)
        .where(
          eq(schema.payments.applicationId, session.sessionToken.split(".")[0]),
        );
      expect(payment.expectedAmountMinor).toBe(6_500_000);
    },
  );
  it("saves the first step without creating a nomination, payment or email", async () => {
    const key = credential();
    const saved = await save(key);
    expect(saved.version).toBe(1);
    expect((await getInProgress({ cycleId })).total).toBe(1);
    expect(
      await db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.cycleId, cycleId)),
    ).toHaveLength(0);
    const [row] = await db
      .select()
      .from(schema.nominationDrafts)
      .where(eq(schema.nominationDrafts.id, key.id));
    expect(row.applicationId).toBeNull();
    expect(row.tokenHash).not.toBe(key.secret);
  });
  it("makes lost-response retries idempotent and rejects stale conflicting saves", async () => {
    const key = credential();
    const first = await save(key);
    expect((await save(key)).version).toBe(first.version);
    await save(key, first.version, 1, contact());
    await expect(
      save(key, first.version, 0, { nomineeName: "Stale tab" }),
    ).rejects.toThrow(/another tab/);
    expect((await getInProgress({ cycleId })).total).toBe(1);
  });
  it("rejects forged draft access, invalid files and first-step challenge failures", async () => {
    const key = credential();
    await save(key);
    await expect(save({ ...key, secret: "0".repeat(64) })).rejects.toThrow(
      /no longer available/,
    );
    const response = await draftRequest(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({
          action: "resume",
          credential: { ...key, secret: "0".repeat(64) },
        }),
      }),
    );
    expect(response.status).toBe(404);
    expect(
      saveDraftSchema.safeParse({
        credential: key,
        cycleId,
        version: 1,
        step: 1,
        data: contact(),
        files: [
          {
            id: crypto.randomUUID(),
            name: "bad.exe",
            type: "image/png",
            size: 4,
            kind: "supporting_document",
          },
        ],
        honeypot: "",
        startedAt: Date.now(),
      }).success,
    ).toBe(false);
    const other = credential();
    await expect(
      saveNominationDraft(
        saveDraftSchema.parse({
          credential: other,
          cycleId,
          version: 0,
          step: 0,
          data: { nomineeName: "Test" },
          files: [],
          turnstileToken: "bad",
          honeypot: "",
          startedAt: Date.now() - 5000,
        }),
      ),
    ).rejects.toThrow(/Verification/);
  });
  it("resumes only verified attachments and retains details after an upload failure", async () => {
    const key = credential();
    let saved = await save(key);
    const item = {
      id: crypto.randomUUID(),
      name: "support.pdf",
      size: pdf.length,
      type: "application/pdf",
      kind: "supporting_document",
    };
    saved = await save(key, saved.version, 1, contact(), [item]);
    await expect(confirmDraftFiles(key, saved.version)).rejects.toThrow(
      /unavailable/,
    );
    objects.set(`e2e/drafts/drafts/${key.id}/${item.id}`, pdf);
    await confirmDraftFiles(key, saved.version);
    const response = await draftRequest(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ action: "resume", credential: key }),
      }),
    );
    const result = await response.json();
    expect(result.data.files).toEqual([item]);
    expect(result.data.payload.email).toBe("draft@example.test");
  });
  it("settles final submission once and reuses saved files without duplicate storage records", async () => {
    const { key, input, manifest } = await prepared(true);
    const results = await Promise.all([
      initiateDraftSubmission(input),
      initiateDraftSubmission(input),
    ]);
    expect(results[0].sessionToken).toBe(results[1].sessionToken);
    expect((await getInProgress({ cycleId })).total).toBe(1);
    const responses = await Promise.all([
      finish(results[0]),
      finish(results[1]),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await getInProgress({ cycleId })).total).toBe(0);
    const [draft] = await db
      .select()
      .from(schema.nominationDrafts)
      .where(eq(schema.nominationDrafts.id, key.id));
    const [app] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, draft.applicationId!));
    expect(app.reference).toMatch(/^GBE-2026-[1-9]\d{5}$/);
    expect(app.workflowStatus).toBe("submitted");
    expect(draft.submittedAt).not.toBeNull();
    expect(
      await db
        .select()
        .from(schema.applicationFiles)
        .where(eq(schema.applicationFiles.applicationId, app.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.files)
        .where(
          eq(
            schema.files.objectKey,
            `e2e/drafts/drafts/${key.id}/${manifest[0].id}`,
          ),
        ),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.applicationId, app.id)),
    ).toHaveLength(2);
    expect((await deleteInProgress({ id: key.id, source: "draft" })).ok).toBe(
      false,
    );
  });
  it("invalidates an older submission session after an edit and keeps one nomination", async () => {
    const { key, input, saved } = await prepared();
    const first = await initiateDraftSubmission(input);
    const updated = { ...contact(), nomineeName: "Corrected draft" };
    await save(key, saved.version, 2, updated);
    expect((await finish(first)).status).toBe(400);
    const second = await initiateDraftSubmission({
      ...input,
      ...updated,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(second.sessionToken.split(".")[0]).toBe(
      first.sessionToken.split(".")[0],
    );
    expect((await finish(second)).status).toBe(200);
    expect(
      await db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.cycleId, cycleId)),
    ).toHaveLength(1);
  });
  it("allows staff to delete drafts and rejects stale completion or further saves", async () => {
    const { key, input, saved } = await prepared(true);
    const session = await initiateDraftSubmission(input);
    expect((await deleteInProgress({ id: key.id, source: "draft" })).ok).toBe(
      true,
    );
    expect((await getInProgress({ cycleId })).total).toBe(0);
    expect((await finish(session)).status).toBe(400);
    await expect(save(key, saved.version, 1, contact())).rejects.toThrow(
      /no longer available/,
    );
    const [draft] = await db
      .select()
      .from(schema.nominationDrafts)
      .where(eq(schema.nominationDrafts.id, key.id));
    expect(draft.payload).toEqual({});
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.applicationId, draft.applicationId!)),
    ).toHaveLength(0);
  });
  it("does not permit non-staff deletion", async () => {
    const key = credential();
    await save(key);
    staffAllowed = false;
    expect((await deleteInProgress({ id: key.id, source: "draft" })).ok).toBe(
      false,
    );
    expect((await getInProgress({ cycleId })).total).toBe(1);
  });
  it("searches saved contact numbers with spaces and local prefixes", async () => {
    const key = credential();
    const saved = await save(key);
    await save(key, saved.version, 1, {
      ...contact(),
      phone: "+94 77 123 4567",
    });
    for (const search of ["+94 77 123 4567", "0771234567", "123-4567"])
      expect(
        (await getInProgress({ cycleId, search })).rows.map((row) => row.id),
      ).toContain(key.id);
  });
  it("bulk deletes eligible drafts while explicitly reporting submitted records", async () => {
    const { key, input } = await prepared(true);
    const session = await initiateDraftSubmission(input);
    expect((await finish(session)).status).toBe(200);
    const other = credential();
    await save(other);
    const result = await deleteInProgressBatch([
      { id: key.id, source: "draft" },
      { id: other.id, source: "draft" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.deleted.map((row) => row.id)).toEqual([other.id]);
    expect(result.failed.map((row) => row.id)).toEqual([key.id]);
    expect(result.failed[0].message).toMatch(/submitted/);
    expect((await getInProgress({ cycleId })).total).toBe(0);
  });
  it("rejects duplicate, oversized and unauthorized bulk deletion before mutation", async () => {
    const key = credential();
    await save(key);
    const item = { id: key.id, source: "draft" };
    expect((await deleteInProgressBatch([item, item])).ok).toBe(false);
    expect(
      (
        await deleteInProgressBatch(
          Array.from({ length: 101 }, () => ({
            id: crypto.randomUUID(),
            source: "draft",
          })),
        )
      ).ok,
    ).toBe(false);
    staffAllowed = false;
    expect((await deleteInProgressBatch([item])).ok).toBe(false);
    expect((await getInProgress({ cycleId })).total).toBe(1);
  });
  it("lets staff delete a mixed selection of drafts and unpaid card records", async () => {
    const { input } = await prepared();
    const session = await initiateDraftSubmission(input);
    expect((await finish(session)).status).toBe(200);
    const applicationId = session.sessionToken.split(".")[0];
    const key = credential();
    await save(key);
    const result = await deleteInProgressBatch([
      { id: key.id, source: "draft" },
      { id: applicationId, source: "card" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.deleted).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect((await getInProgress({ cycleId })).total).toBe(0);
    expect(
      await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.applicationId, applicationId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.applicationId, applicationId)),
    ).toHaveLength(0);
  });
  it("refuses a staff batch containing legacy uploads before deleting any drafts", async () => {
    const key = credential();
    await save(key);
    expect(
      (
        await deleteInProgressBatch([
          { id: key.id, source: "draft" },
          { id: crypto.randomUUID(), source: "upload" },
        ])
      ).ok,
    ).toBe(false);
    expect((await getInProgress({ cycleId })).total).toBe(1);
  });
  it("refuses legacy cleanup of a draft-linked nomination", async () => {
    const { input } = await prepared();
    const session = await initiateDraftSubmission(input);
    await expect(
      purgeIncompleteNominationShell(session.sessionToken.split(".")[0], {
        type: "staff",
        profileId: actorId,
        reason: "Test legacy cleanup guard",
      }),
    ).rejects.toThrow(/In-progress/);
    expect((await getInProgress({ cycleId })).total).toBe(1);
  });
  it("retains expired in-progress records and their verified files during cleanup", async () => {
    const { key, input, manifest } = await prepared(true);
    const session = await initiateDraftSubmission(input);
    const applicationId = session.sessionToken.split(".")[0];
    await db
      .update(schema.uploadSessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.uploadSessions.applicationId, applicationId));
    await cleanupStaleUploads();
    expect((await getInProgress({ cycleId })).total).toBe(1);
    expect(objects.has(`e2e/drafts/drafts/${key.id}/${manifest[0].id}`)).toBe(
      true,
    );
    const [app] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, applicationId));
    expect(app.deletedAt).toBeNull();
  });
  it("keeps drafts readable but refuses new saves after the cycle closes", async () => {
    const key = credential();
    const saved = await save(key);
    await db
      .update(schema.awardCycles)
      .set({ status: "closed" })
      .where(eq(schema.awardCycles.id, cycleId));
    await expect(save(key, saved.version, 1, contact())).rejects.toThrow(
      /not currently open/,
    );
    expect(
      (await getInProgress({ cycleId, search: "Draft Company", page: 999 }))
        .page,
    ).toBe(1);
  });
});
