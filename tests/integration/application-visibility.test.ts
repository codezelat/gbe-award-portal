import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import * as schema from "../../src/lib/db/schema";
import {
  nonDeletedApplications,
  submittedApplications,
} from "../../src/server/dal/application-visibility";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ getAuth: vi.fn() }));
vi.mock("@/server/dal/auth", () => ({
  requireStaff: async () => ({
    profile: { id: ownerId },
    membership: { role: "super_admin" },
  }),
  hasPermission: () => true,
}));
vi.mock("@/server/security/rate-limit", () => ({
  enforceRateLimit: async () => {},
}));
vi.mock("@/server/jobs/schedule-email-delivery", () => ({
  scheduleEmailOutboxProcessing: vi.fn(),
}));
vi.mock("@/server/services/feature-flags", () => ({
  requireFeatureFlag: async () => {},
}));
vi.mock("@/server/services/application-transition-service", () => ({
  changeApplicationStatus: vi.fn(),
  changeApplicationStatusWithTx: vi.fn(),
}));
vi.mock("@/server/services/invitation-service", () => ({
  createOrRefreshApplicantInvitation: vi.fn(),
}));
vi.mock("@/server/services/incomplete-nomination-cleanup", () => ({
  purgeIncompleteNominationShell: vi.fn(),
}));
const client = postgres(process.env.TEST_DATABASE_URL!, { max: 4 });
const db = drizzle(client, { schema });
const { getDashboardApplications } =
  await import("../../src/server/dal/dashboard-applications");
const { setApplicationDeletionAction, changeStatusAction } =
  await import("../../src/server/actions/application-actions");
const { revalidatePath } = await import("next/cache");
let cycleId: string;
let categoryId: string;
let ownerId: string;
const zeroCounts = {
  total: 0,
  review: 0,
  approved: 0,
  payments: 0,
  actionRequired: 0,
};

beforeEach(async () => {
  const key = crypto.randomUUID();
  const [cycle] = await db
    .insert(schema.awardCycles)
    .values({
      name: "Visibility tests",
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
    .values({
      cycleId,
      name: "Test",
      code: "TEST",
      slug: key,
    })
    .returning();
  categoryId = category.id;
  await db
    .insert(schema.user)
    .values({ id: key, name: "Test", email: `${key}@example.test` });
  const [profile] = await db
    .insert(schema.profiles)
    .values({
      authUserId: key,
      accountKind: "applicant",
      displayName: "Test",
    })
    .returning();
  ownerId = profile.id;
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
      ownerProfileId: ownerId,
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
      paymentStatus: "proof_submitted",
      ...overrides,
    })
    .returning();
  return row;
}
const dashboard = () =>
  getDashboardApplications(eq(schema.applications.cycleId, cycleId));

describe("nomination visibility", () => {
  it("excludes deleted records from every dashboard metric and queue", async () => {
    const statuses = [
      "submitted",
      "under_review",
      "resubmitted",
      "approved",
      "changes_requested",
    ] as const;
    const active = [];
    for (const workflowStatus of statuses) {
      active.push(await fixture({ workflowStatus }));
      await fixture({ workflowStatus, deletedAt: new Date() });
    }
    const result = await dashboard();
    expect(result.counts).toEqual({
      total: 5,
      review: 3,
      approved: 1,
      payments: 5,
      actionRequired: 1,
    });
    expect(result.recent.map((row) => row.id).sort()).toEqual(
      active.map((row) => row.id).sort(),
    );
    expect(result.unassigned.map((row) => row.id).sort()).toEqual(
      active
        .slice(0, 3)
        .map((row) => row.id)
        .sort(),
    );
  });

  it("omits incomplete shells even when their status or payment is inconsistent", async () => {
    await fixture({
      workflowStatus: "uploading",
      submittedAt: null,
      reference: null,
    });
    await fixture({ workflowStatus: "uploading" });
    await fixture({ submittedAt: null });
    expect(await dashboard()).toEqual({
      counts: zeroCounts,
      recent: [],
      unassigned: [],
    });
  });

  it("keeps cycle and reviewer restrictions on all three queries", async () => {
    await fixture();
    const assigned = await fixture({ assignedReviewerId: ownerId });
    await fixture({ assignedReviewerId: ownerId, deletedAt: new Date() });
    const result = await getDashboardApplications(
      and(
        eq(schema.applications.cycleId, cycleId),
        eq(schema.applications.assignedReviewerId, ownerId),
      ),
    );
    expect(result.counts.total).toBe(1);
    expect(result.recent.map((row) => row.id)).toEqual([assigned.id]);
    expect(result.unassigned).toEqual([]);
    expect(
      await getDashboardApplications(
        eq(schema.applications.cycleId, crypto.randomUUID()),
      ),
    ).toEqual({ counts: zeroCounts, recent: [], unassigned: [] });
  });

  it("reflects deletion and restoration without changing retained nomination data", async () => {
    const row = await fixture();
    vi.mocked(revalidatePath).mockClear();
    const changeDeletion = async (mode: "delete" | "restore") => {
      const form = new FormData();
      form.set("applicationId", row.id);
      form.set("mode", mode);
      form.set("reason", "Isolated deletion visibility test");
      await setApplicationDeletionAction(form);
    };
    expect((await dashboard()).counts.total).toBe(1);
    await changeDeletion("delete");
    expect(await dashboard()).toEqual({
      counts: zeroCounts,
      recent: [],
      unassigned: [],
    });
    await changeDeletion("restore");
    expect((await dashboard()).recent[0].reference).toBe(row.reference);
    expect((await dashboard()).counts.total).toBe(1);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/admin/applications/${row.id}`],
      ["/admin", "layout"],
      ["/portal", "layout"],
      [`/admin/applications/${row.id}`],
      ["/admin", "layout"],
      ["/portal", "layout"],
    ]);
    expect(
      await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.applicationId, row.id)),
    ).toHaveLength(2);
  });

  it("rejects a stale status action on a deleted nomination", async () => {
    const row = await fixture({ deletedAt: new Date() });
    const form = new FormData();
    form.set("applicationId", row.id);
    form.set("to", "under_review");
    await expect(changeStatusAction(form)).rejects.toThrow(
      "Application not found or not assigned to you.",
    );
    const [stored] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, row.id));
    expect(stored.workflowStatus).toBe("submitted");
  });

  it("selects the latest active owned nomination instead of a newer deleted one", async () => {
    const active = await fixture({ submittedAt: new Date("2026-01-01") });
    await fixture({
      submittedAt: new Date("2026-02-01"),
      deletedAt: new Date(),
    });
    const rows = await db
      .select()
      .from(schema.applications)
      .where(
        nonDeletedApplications(eq(schema.applications.ownerProfileId, ownerId)),
      )
      .orderBy(desc(schema.applications.submittedAt))
      .limit(1);
    expect(rows.map((row) => row.id)).toEqual([active.id]);
  });

  it("retains an applicant profile when all linked nominations are deleted", async () => {
    await fixture({ deletedAt: new Date() });
    const rows = await db
      .select({
        profileId: schema.profiles.id,
        applicationId: schema.applications.id,
      })
      .from(schema.profiles)
      .leftJoin(
        schema.applications,
        nonDeletedApplications(
          eq(schema.applications.ownerProfileId, schema.profiles.id),
        ),
      )
      .where(eq(schema.profiles.id, ownerId));
    expect(rows).toEqual([{ profileId: ownerId, applicationId: null }]);
  });

  it("excludes deleted and incomplete records from normal summaries while preserving explicit archive queries", async () => {
    const active = await fixture();
    const deleted = await fixture({ deletedAt: new Date() });
    await fixture({ workflowStatus: "uploading", submittedAt: null });
    const normal = await db
      .select()
      .from(schema.applications)
      .where(submittedApplications(eq(schema.applications.cycleId, cycleId)));
    expect(normal.map((row) => row.id)).toEqual([active.id]);
    const archived = await db
      .select()
      .from(schema.applications)
      .where(
        and(
          eq(schema.applications.cycleId, cycleId),
          isNotNull(schema.applications.deletedAt),
        ),
      );
    expect(archived.map((row) => row.id)).toEqual([deleted.id]);
  });
});
