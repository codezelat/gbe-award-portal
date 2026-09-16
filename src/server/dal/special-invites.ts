import "server-only";
import { and, count, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  applications,
  nominationDrafts,
  specialInviteBatches,
  specialInvites,
} from "@/lib/db/schema";
import {
  decryptInviteCode,
  inviteCodeHash,
} from "@/server/security/special-invite-code";
import { inviteState, normaliseInviteCode } from "@/lib/domain/special-invite";

export async function getSpecialInvites(input: {
  cycleId: string;
  history: boolean;
  page: number;
  search?: string;
  batch?: string;
}) {
  const db = getDb();
  const filters = and(
    eq(specialInvites.cycleId, input.cycleId),
    input.history
      ? or(
          isNotNull(specialInvites.draftId),
          isNotNull(specialInvites.revokedAt),
        )
      : and(isNull(specialInvites.draftId), isNull(specialInvites.revokedAt)),
    input.search
      ? eq(
          specialInvites.codeHash,
          inviteCodeHash(normaliseInviteCode(input.search)),
        )
      : undefined,
    input.batch ? eq(specialInvites.batchId, input.batch) : undefined,
  );
  const [total] = await db
    .select({ value: count() })
    .from(specialInvites)
    .where(filters);
  const pages = Math.max(1, Math.ceil(total.value / 25));
  const page = Math.min(
    pages,
    Math.max(1, Number.isFinite(input.page) ? input.page : 1),
  );
  const rows = await db
    .select({
      invite: specialInvites,
      batch: specialInviteBatches,
      draft: nominationDrafts,
      application: applications,
    })
    .from(specialInvites)
    .innerJoin(
      specialInviteBatches,
      eq(specialInvites.batchId, specialInviteBatches.id),
    )
    .leftJoin(nominationDrafts, eq(specialInvites.draftId, nominationDrafts.id))
    .leftJoin(
      applications,
      eq(
        applications.id,
        sql`coalesce(${specialInvites.applicationId}, ${nominationDrafts.applicationId})`,
      ),
    )
    .where(filters)
    .orderBy(desc(specialInvites.createdAt), desc(specialInvites.id))
    .limit(25)
    .offset((page - 1) * 25);
  return {
    page,
    pages,
    total: total.value,
    rows: rows.map(({ invite, batch, draft, application }) => {
      const payload =
        draft?.payload &&
        typeof draft.payload === "object" &&
        "nomineeName" in draft.payload
          ? draft.payload
          : null;
      const activeApplication =
        application && application.submittedAt && !application.deletedAt;
      const activeDraft = draft && !draft.deletedAt && !draft.submittedAt;
      return {
        id: invite.id,
        code: decryptInviteCode(invite.codeEncrypted),
        discountMinor: batch.discountMinor,
        currency: batch.currency,
        status: inviteState(invite),
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        consumedAt: invite.consumedAt,
        amountMinor: invite.amountMinor,
        name: activeApplication
          ? application.nomineeName
          : activeDraft && typeof payload?.nomineeName === "string"
            ? payload.nomineeName
            : null,
        href: activeApplication
          ? `/admin/applications/${application.id}`
          : activeDraft
            ? `/admin/in-progress/${draft.id}?source=draft`
            : null,
        reference: activeApplication ? application.reference : null,
      };
    }),
  };
}
