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

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/dal/auth", () => ({
  requireStaff: async () => {
    if (!staffAllowed) throw new Error("Staff access required.");
    return { profile: { id: actorId }, membership: { role: "staff" } };
  },
  hasPermission: () => true,
}));
vi.mock("@/server/security/request", () => ({
  assertSameOrigin: async () => new Headers(),
}));
vi.mock("@/server/security/turnstile", () => ({
  verifyTurnstile: async (token: string) => {
    if (token !== "test-verified") throw new Error("Verification failed.");
  },
}));
vi.mock("@/server/security/rate-limit", () => ({
  enforceRateLimit: async () => {},
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
let nextPayment = 1000;
const { saveNominationDraft, confirmDraftFiles, initiateDraftSubmission } =
  await import("../../src/server/services/nomination-drafts");
const { POST: complete } =
  await import("../../src/app/api/public/applications/complete/route");
const { POST: initiate } =
  await import("../../src/app/api/public/applications/initiate/route");
const { POST: draftRequest } =
  await import("../../src/app/api/public/drafts/route");
const { deleteInProgress } =
  await import("../../src/server/actions/draft-actions");
const { getInProgress } = await import("../../src/server/dal/in-progress");
const { cleanupStaleUploads } = await import("../../src/server/jobs/cleanup");
const { purgeIncompleteNominationShell } =
  await import("../../src/server/services/incomplete-nomination-cleanup");
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOMINATION_OFFER.startsAt);
  staffAllowed = true;
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
afterEach(() => vi.useRealTimers());
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

describe("durable in-progress nominations", () => {
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
      ).toHaveLength(2);
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
