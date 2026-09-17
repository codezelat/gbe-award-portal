import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../../src/lib/db/schema";
import { hasPermission } from "../../src/lib/domain/permissions";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/dal/auth", () => ({
  requireStaff: async () => ({ profile: { id: staffId }, membership }),
  hasPermission,
}));
vi.mock("@/server/security/rate-limit", () => ({
  enforceRateLimit: async () => {},
}));
vi.mock("@/server/jobs/schedule-email-delivery", () => ({
  scheduleEmailOutboxProcessing: vi.fn(),
}));
vi.mock("@/server/services/invitation-service", () => ({
  createOrRefreshApplicantInvitation: vi.fn(),
}));
const client = postgres(process.env.TEST_DATABASE_URL!, { max: 4 });
const db = drizzle(client, { schema });
const { updateSelectedApplications } =
  await import("../../src/server/actions/application-bulk-update");
const { createOrRefreshApplicantInvitation } =
  await import("../../src/server/services/invitation-service");
let staffId: string, cycleId: string, categoryId: string;
let membership: { role: string; permissions: Record<string, boolean> };
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(createOrRefreshApplicantInvitation).mockResolvedValue({
    linked: true,
  });
  membership = { role: "staff", permissions: {} };
  const key = crypto.randomUUID();
  const [cycle] = await db
    .insert(schema.awardCycles)
    .values({
      name: "Bulk test",
      slug: key,
      year: 2026,
      status: "open",
      timezone: "Asia/Colombo",
      opensAt: new Date("2026-01-01"),
      closesAt: new Date("2027-01-01"),
      supportEmail: "test@example.test",
      heading: "Test",
      introCopy: "Test",
      declarationText: "Test",
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
    .values({ cycleId, name: "Test", code: "TEST", slug: key })
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
      isActive: true,
    })
    .returning();
  staffId = profile.id;
  await db
    .insert(schema.staffMemberships)
    .values({ profileId: staffId, role: "staff" });
});
afterAll(async () => {
  await client.end();
});
async function fixture(
  overrides: Partial<typeof schema.applications.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.applications)
    .values({
      cycleId,
      categoryId,
      nomineeName: "Bulk test",
      awardNomination: "Test nomination",
      emailNormalised: "bulk@example.test",
      emailDisplay: "bulk@example.test",
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
      paymentStatus: "proof_submitted",
      assignedReviewerId: staffId,
      ...overrides,
    })
    .returning();
  return row;
}
type Row = Awaited<ReturnType<typeof fixture>>;
const input = (rows: Row[], to = "under_review") => ({
  action: "status",
  to,
  reason: "Reviewed by the awards team",
  applicantMessage: "",
  requestId: crypto.randomUUID(),
  selection: rows.map((row) => ({
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
  })),
});
const stored = (rows: Row[]) =>
  db
    .select()
    .from(schema.applications)
    .where(
      inArray(
        schema.applications.id,
        rows.map((row) => row.id),
      ),
    );
const history = (rows: Row[]) =>
  db
    .select()
    .from(schema.applicationStatusHistory)
    .where(
      inArray(
        schema.applicationStatusHistory.applicationId,
        rows.map((row) => row.id),
      ),
    );
const mail = (rows: Row[]) =>
  db
    .select()
    .from(schema.emailOutbox)
    .where(
      inArray(
        schema.emailOutbox.applicationId,
        rows.map((row) => row.id),
      ),
    );

describe("atomic bulk nomination updates", () => {
  it("updates mixed eligible statuses with history, outbox and a durable batch audit", async () => {
    const rows = [
      await fixture(),
      await fixture({ workflowStatus: "resubmitted" }),
    ];
    const data = input(rows);
    expect(await updateSelectedApplications(data)).toMatchObject({
      ok: true,
      message: "2 nominations updated.",
      warnings: [],
    });
    expect(
      (await stored(rows)).every(
        (row) => row.workflowStatus === "under_review",
      ),
    ).toBe(true);
    expect(await history(rows)).toHaveLength(2);
    expect(await mail(rows)).toHaveLength(2);
    expect(
      await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.id, data.requestId)),
    ).toHaveLength(1);
  });
  it("serializes simultaneous retries without duplicate notifications or history", async () => {
    const rows = [await fixture()];
    const data = input(rows);
    const responses = await Promise.all([
      updateSelectedApplications(data),
      updateSelectedApplications(data),
    ]);
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(await history(rows)).toHaveLength(1);
    expect(await mail(rows)).toHaveLength(1);
    expect(
      (await updateSelectedApplications({ ...data, to: "approved" })).ok,
    ).toBe(false);
  });
  it("skips unchanged rows without duplicate history", async () => {
    const rows = [
      await fixture(),
      await fixture({ workflowStatus: "under_review" }),
    ];
    expect(await updateSelectedApplications(input(rows))).toMatchObject({
      ok: true,
      message: "1 nomination updated. 1 already had this status.",
    });
    expect(await history(rows)).toHaveLength(1);
  });
  it("rejects the entire batch if one transition is invalid", async () => {
    const rows = [
      await fixture(),
      await fixture({ workflowStatus: "archived" }),
    ];
    expect((await updateSelectedApplications(input(rows))).ok).toBe(false);
    expect(
      (await stored(rows)).find((row) => row.id === rows[0].id)?.workflowStatus,
    ).toBe("submitted");
    expect(await history(rows)).toHaveLength(0);
    expect(await mail(rows)).toHaveLength(0);
  });
  it("rejects stale, deleted and unfinished records without partial changes", async () => {
    for (const change of [
      { updatedAt: new Date("2030-01-01") },
      { deletedAt: new Date() },
      { submittedAt: null },
    ]) {
      const rows = [await fixture(), await fixture()];
      await db
        .update(schema.applications)
        .set(change)
        .where(eq(schema.applications.id, rows[1].id));
      expect((await updateSelectedApplications(input(rows))).ok).toBe(false);
      expect(await history(rows)).toHaveLength(0);
    }
  });
  it("rejects unpaid card recovery records", async () => {
    const row = await fixture();
    await db.insert(schema.payments).values({
      applicationId: row.id,
      method: "card",
      status: "awaiting_payment",
      expectedAmountMinor: 6500000,
      currency: "LKR",
    });
    expect((await updateSelectedApplications(input([row]))).ok).toBe(false);
    expect(await history([row])).toHaveLength(0);
  });
  it("enforces assignment scope and each target permission", async () => {
    const rows = [await fixture({ assignedReviewerId: null })];
    membership.permissions["applications.view_all"] = false;
    expect((await updateSelectedApplications(input(rows))).ok).toBe(false);
    membership.permissions = { "applications.approve": false };
    expect((await updateSelectedApplications(input(rows, "approved"))).ok).toBe(
      false,
    );
    membership.permissions = { "applications.reject": false };
    expect((await updateSelectedApplications(input(rows, "rejected"))).ok).toBe(
      false,
    );
    membership.permissions = { "applications.change_status": false };
    expect((await updateSelectedApplications(input(rows))).ok).toBe(false);
    expect(await history(rows)).toHaveLength(0);
  });
  it("requires a meaningful reason and refuses applicant-only transitions", async () => {
    const row = await fixture();
    expect(
      (
        await updateSelectedApplications({
          ...input([row], "rejected"),
          reason: " ",
        })
      ).ok,
    ).toBe(false);
    for (const status of [
      "changes_requested",
      "resubmitted",
      "submitted",
      "uploading",
    ])
      expect((await updateSelectedApplications(input([row], status))).ok).toBe(
        false,
      );
    expect(await history([row])).toHaveLength(0);
  });
  it("requires verified payment before entry confirmation", async () => {
    const rows = [
      await fixture({ workflowStatus: "approved", paymentStatus: "verified" }),
      await fixture({ workflowStatus: "approved" }),
    ];
    expect(
      (await updateSelectedApplications(input(rows, "entry_confirmed"))).ok,
    ).toBe(false);
    expect(await history(rows)).toHaveLength(0);
  });
  it("preserves the outcome release date and refuses an unconfigured cycle", async () => {
    const row = await fixture({ workflowStatus: "entry_confirmed" });
    expect(
      (await updateSelectedApplications(input([row], "shortlisted"))).ok,
    ).toBe(false);
    const release = new Date("2030-01-01T00:00:00.000Z");
    await db
      .update(schema.awardCycles)
      .set({ resultsReleaseAt: release })
      .where(eq(schema.awardCycles.id, cycleId));
    expect(
      (await updateSelectedApplications(input([row], "shortlisted"))).ok,
    ).toBe(true);
    expect((await mail([row]))[0].nextAttemptAt).toEqual(release);
  });
  it("reports invitation failure separately from a committed approval", async () => {
    const row = await fixture();
    vi.mocked(createOrRefreshApplicantInvitation).mockRejectedValueOnce(
      new Error("provider details must not leak"),
    );
    const data = input([row], "approved");
    expect(await updateSelectedApplications(data)).toMatchObject({
      ok: true,
      warnings: [{ id: row.id, reference: row.reference }],
    });
    expect((await stored([row]))[0].workflowStatus).toBe("approved");
    await updateSelectedApplications(data);
    expect(createOrRefreshApplicantInvitation).toHaveBeenCalledTimes(1);
    expect(await history([row])).toHaveLength(1);
  });
  it("validates selected IDs and a 100-record upper bound", async () => {
    const row = await fixture();
    const data = input([row]);
    for (const selection of [
      [],
      [data.selection[0], data.selection[0]],
      Array.from({ length: 101 }, () => ({
        id: crypto.randomUUID(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    ])
      expect(
        (await updateSelectedApplications({ ...data, selection })).ok,
      ).toBe(false);
  });
  it("assigns staff once and rejects suspended staff", async () => {
    const row = await fixture({ assignedReviewerId: null });
    const data = { ...input([row]), action: "assign", reviewerId: staffId };
    expect((await updateSelectedApplications(data)).ok).toBe(true);
    expect((await updateSelectedApplications(data)).ok).toBe(true);
    expect((await stored([row]))[0].assignedReviewerId).toBe(staffId);
    await db
      .update(schema.staffMemberships)
      .set({ suspendedAt: new Date() })
      .where(eq(schema.staffMemberships.profileId, staffId));
    const other = await fixture({ assignedReviewerId: null });
    expect(
      (
        await updateSelectedApplications({
          ...input([other]),
          action: "assign",
          reviewerId: staffId,
        })
      ).ok,
    ).toBe(false);
  });
  it("queues selected messages once and protects portal-only reminders", async () => {
    const row = await fixture();
    const data = {
      ...input([row]),
      action: "message",
      template: "review_update",
    };
    expect((await updateSelectedApplications(data)).ok).toBe(true);
    expect((await updateSelectedApplications(data)).ok).toBe(true);
    expect(await mail([row])).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.applicationMessages)
        .where(eq(schema.applicationMessages.applicationId, row.id)),
    ).toHaveLength(1);
    expect(
      (
        await updateSelectedApplications({
          ...data,
          requestId: crypto.randomUUID(),
          template: "deadline_reminder",
        })
      ).ok,
    ).toBe(false);
  });
});
