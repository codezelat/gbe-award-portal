import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "@/lib/db";
import {
  auditLogs,
  awardCycles,
  specialInviteBatches,
  specialInvites,
} from "@/lib/db/schema";
import {
  INVITE_BATCH_LIMIT,
  INVITE_VALIDITY_MS,
  inviteState,
  normaliseInviteCode,
} from "@/lib/domain/special-invite";
import {
  withSpecialInvite,
  type PricingCycle,
} from "@/lib/domain/nomination-pricing";
import {
  draftCredentialSchema,
  type DraftCredential,
} from "@/lib/validation/nomination-draft";
import {
  encryptInviteCode,
  generateInviteCode,
  inviteCodeHash,
} from "@/server/security/special-invite-code";
import { getNominationPricing } from "./nomination-offers";
import { lockDraft } from "./nomination-drafts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export class SpecialInviteError extends Error {}
export const issueInvitesSchema = z.object({
  requestId: z.uuid(),
  cycleId: z.uuid(),
  discountMinor: z.number().int().positive().max(2_000_000_000),
  quantity: z.number().int().min(1).max(INVITE_BATCH_LIMIT),
});
export const claimInviteSchema = z.object({
  credential: draftCredentialSchema,
  code: z
    .string()
    .max(32)
    .transform(normaliseInviteCode)
    .pipe(z.string().regex(/^[A-Z0-9]{6}$/)),
});

export async function issueSpecialInvites(
  input: z.infer<typeof issueInvitesSchema>,
  actorId: string,
) {
  const parsed = issueInvitesSchema.parse(input);
  return getDb().transaction(async (tx) => {
    // Cycle first serializes issuing with fee edits and bounds the unused pool.
    const [cycle] = await tx
      .select()
      .from(awardCycles)
      .where(eq(awardCycles.id, parsed.cycleId))
      .for("update");
    if (!cycle) throw new SpecialInviteError("Choose an award cycle.");
    const [prior] = await tx
      .select()
      .from(specialInviteBatches)
      .where(eq(specialInviteBatches.id, parsed.requestId));
    if (prior) {
      if (
        prior.createdBy !== actorId ||
        prior.cycleId !== cycle.id ||
        prior.discountMinor !== parsed.discountMinor ||
        prior.quantity !== parsed.quantity
      )
        throw new SpecialInviteError(
          "This request changed. Close and reopen Generate invites.",
        );
      return { batchId: prior.id, quantity: prior.quantity };
    }
    if (["completed", "archived"].includes(cycle.status))
      throw new SpecialInviteError("This award cycle has ended.");
    const pricing = await getNominationPricing(cycle, tx);
    if (
      !pricing.currency ||
      !pricing.amountMinor ||
      parsed.discountMinor >= pricing.amountMinor
    )
      throw new SpecialInviteError(
        "The discount must be less than the current nomination fee.",
      );
    const [unused] = await tx
      .select({ value: count() })
      .from(specialInvites)
      .where(
        and(
          eq(specialInvites.cycleId, cycle.id),
          isNull(specialInvites.draftId),
          isNull(specialInvites.revokedAt),
        ),
      );
    if (unused.value + parsed.quantity > 10000)
      throw new SpecialInviteError(
        "This cycle has reached its unused-invite limit.",
      );
    await tx.insert(specialInviteBatches).values({
      id: parsed.requestId,
      cycleId: cycle.id,
      discountMinor: parsed.discountMinor,
      currency: pricing.currency,
      quantity: parsed.quantity,
      createdBy: actorId,
    });
    let created = 0;
    for (
      let attempt = 0;
      created < parsed.quantity && attempt < 10;
      attempt++
    ) {
      const values = Array.from({ length: parsed.quantity - created }, () => {
        const code = generateInviteCode();
        return {
          batchId: parsed.requestId,
          cycleId: cycle.id,
          codeHash: inviteCodeHash(code),
          codeEncrypted: encryptInviteCode(code),
        };
      });
      const rows = await tx
        .insert(specialInvites)
        .values(values)
        .onConflictDoNothing({ target: specialInvites.codeHash })
        .returning({ id: specialInvites.id });
      created += rows.length;
    }
    if (created !== parsed.quantity)
      throw new SpecialInviteError(
        "Could not generate unique invites. Please retry.",
      );
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId: actorId,
      action: "special invites issued",
      entityType: "special_invite_batch",
      entityId: parsed.requestId,
      afterRedacted: {
        cycleId: cycle.id,
        quantity: created,
        discountMinor: parsed.discountMinor,
        currency: pricing.currency,
      },
      requestId: parsed.requestId,
    });
    return { batchId: parsed.requestId, quantity: created };
  });
}

export async function getDraftNominationPricing(
  cycle: PricingCycle & { id: string },
  draftId?: string,
  db: Pick<Database, "select"> = getDb(),
) {
  const pricing = await getNominationPricing(cycle, db);
  if (!draftId) return pricing;
  const [row] = await db
    .select({ invite: specialInvites, currency: specialInviteBatches.currency })
    .from(specialInvites)
    .innerJoin(
      specialInviteBatches,
      eq(specialInvites.batchId, specialInviteBatches.id),
    )
    .where(
      and(
        eq(specialInvites.draftId, draftId),
        eq(specialInvites.cycleId, cycle.id),
      ),
    );
  if (!row) return pricing;
  const { invite } = row;
  if (
    !invite.expiresAt ||
    invite.amountMinor === null ||
    invite.originalAmountMinor === null
  )
    throw new Error("Saved invite pricing is unavailable.");
  const state = inviteState(invite, pricing.serverNow);
  return withSpecialInvite(pricing, {
    id: invite.id,
    expiresAt: invite.expiresAt.getTime(),
    originalAmountMinor: invite.originalAmountMinor,
    amountMinor: invite.amountMinor,
    currency: row.currency,
    status: state === "unused" ? "cancelled" : state,
  });
}

export async function claimSpecialInvite(
  credential: DraftCredential,
  rawCode: string,
) {
  const input = claimInviteSchema.parse({ credential, code: rawCode });
  return getDb().transaction(async (tx) => {
    // All claim, finalization and deletion paths lock the draft first.
    const draft = await lockDraft(tx, input.credential);
    if (draft.submittedAt)
      throw new SpecialInviteError(
        "This nomination has already been submitted.",
      );
    if (draft.savedStep < 1)
      throw new SpecialInviteError("Save your contact details first.");
    const [cycle] = await tx
      .select()
      .from(awardCycles)
      .where(eq(awardCycles.id, draft.cycleId))
      .for("share");
    const now = new Date();
    if (
      !cycle ||
      cycle.status !== "open" ||
      now < cycle.opensAt ||
      now >= cycle.closesAt
    )
      throw new SpecialInviteError("Nominations are not currently open.");
    const codeHash = inviteCodeHash(input.code);
    const [prior] = await tx
      .select()
      .from(specialInvites)
      .where(eq(specialInvites.draftId, draft.id));
    if (prior) {
      if (prior.codeHash === codeHash && inviteState(prior) === "active")
        return getDraftNominationPricing(cycle, draft.id, tx);
      throw new SpecialInviteError(
        inviteState(prior) === "expired"
          ? "Your invite has expired. You can continue at the current fee."
          : "Only one special invite can be claimed per nomination.",
      );
    }
    const [invite] = await tx
      .select()
      .from(specialInvites)
      .where(
        and(
          eq(specialInvites.codeHash, codeHash),
          eq(specialInvites.cycleId, cycle.id),
        ),
      )
      .for("update");
    // Same response for unknown, wrong-cycle and previously claimed codes.
    if (!invite || invite.draftId || invite.revokedAt)
      throw new SpecialInviteError(
        "This invite is invalid or no longer available.",
      );
    const [batch] = await tx
      .select()
      .from(specialInviteBatches)
      .where(eq(specialInviteBatches.id, invite.batchId));
    const pricing = await getNominationPricing(cycle, tx);
    if (
      !pricing.amountMinor ||
      batch.currency !== pricing.currency ||
      batch.discountMinor >= pricing.amountMinor
    )
      throw new SpecialInviteError(
        "This invite cannot be applied to the current fee. Contact the awards team.",
      );
    const claimedAt = new Date(pricing.serverNow);
    await tx
      .update(specialInvites)
      .set({
        draftId: draft.id,
        claimedAt,
        expiresAt: new Date(claimedAt.getTime() + INVITE_VALIDITY_MS),
        originalAmountMinor: pricing.amountMinor,
        amountMinor: pricing.amountMinor - batch.discountMinor,
      })
      .where(eq(specialInvites.id, invite.id));
    await tx.insert(auditLogs).values({
      actorType: "public",
      action: "special invite claimed",
      entityType: "special_invite",
      entityId: invite.id,
      metadataRedacted: { draftId: draft.id },
      requestId: crypto.randomUUID(),
    });
    return getDraftNominationPricing(cycle, draft.id, tx);
  });
}

// Called inside finalization while holding the draft lock. Never consumes on a step save.
export async function consumeSpecialInvite(
  tx: Tx,
  draftId: string,
  applicationId: string,
  now: number,
) {
  const [invite] = await tx
    .select()
    .from(specialInvites)
    .where(eq(specialInvites.draftId, draftId))
    .for("update");
  if (!invite || inviteState(invite, now) !== "active") return;
  await tx
    .update(specialInvites)
    .set({ applicationId, consumedAt: new Date(now) })
    .where(eq(specialInvites.id, invite.id));
  await tx.insert(auditLogs).values({
    actorType: "public",
    action: "special invite used",
    entityType: "special_invite",
    entityId: invite.id,
    applicationId,
    metadataRedacted: { amountMinor: invite.amountMinor },
    requestId: crypto.randomUUID(),
  });
}

export async function revokeUnusedInvite(id: string, actorId: string) {
  return getDb().transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(specialInvites)
      .where(eq(specialInvites.id, id))
      .for("update");
    if (!invite || invite.draftId)
      throw new SpecialInviteError("Only unused invites can be cancelled.");
    if (invite.revokedAt) return;
    await tx
      .update(specialInvites)
      .set({ revokedAt: new Date() })
      .where(eq(specialInvites.id, id));
    await tx
      .insert(auditLogs)
      .values({
        actorType: "staff",
        actorProfileId: actorId,
        action: "special invite cancelled",
        entityType: "special_invite",
        entityId: id,
        requestId: crypto.randomUUID(),
      });
  });
}
