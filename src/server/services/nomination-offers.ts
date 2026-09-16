import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import { auditLogs, awardCycles, systemSettings } from "@/lib/db/schema";
import {
  defaultNominationOffer,
  nominationPricing,
  type NominationOffer,
  type PricingCycle,
} from "@/lib/domain/nomination-pricing";
import {
  nominationOfferSchema,
  savedNominationOfferSchema,
} from "@/lib/validation/nomination-offer";

export const nominationOfferKey = (cycleId: string) =>
  `nomination_offer:${cycleId}`;

export async function getNominationOffer(
  cycle: PricingCycle & { id: string },
  db: Pick<Database, "select"> = getDb(),
) {
  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, nominationOfferKey(cycle.id)))
    .limit(1);
  if (!setting)
    return {
      offer: defaultNominationOffer(cycle),
      revision: "",
      serverNow: Date.now(),
    };
  // Invalid persisted pricing must not silently fall back to a cheaper price.
  const saved = savedNominationOfferSchema.parse(setting.value);
  if (saved.offer.currency !== cycle.currency)
    throw new Error("The offer currency does not match this award cycle.");
  return {
    offer: saved.offer,
    revision: saved.revision,
    serverNow: Date.now(),
  };
}

export async function getNominationPricing(
  cycle: PricingCycle & { id: string },
  db: Pick<Database, "select"> = getDb(),
) {
  const { offer } = await getNominationOffer(cycle, db);
  return nominationPricing(cycle, Date.now(), offer);
}

export class OfferConflictError extends Error {}

export async function saveNominationOffer(input: {
  cycleId: string;
  expectedRevision: string;
  offer: NominationOffer;
  actorId: string;
}) {
  const offer = nominationOfferSchema.parse(input.offer);
  return getDb().transaction(async (tx) => {
    // Also serializes first writes, when there is no settings row to lock yet.
    const [cycle] = await tx
      .select()
      .from(awardCycles)
      .where(eq(awardCycles.id, input.cycleId))
      .for("update");
    if (!cycle) throw new OfferConflictError("Award cycle not found.");
    const before = await getNominationOffer(cycle, tx);
    if (before.revision !== input.expectedRevision)
      throw new OfferConflictError(
        "This offer was changed in another window. Close and reopen the editor to load it.",
      );
    if (cycle.currency !== offer.currency)
      throw new OfferConflictError(
        "The cycle currency changed. Refresh before saving.",
      );
    const revision = crypto.randomUUID();
    const value = { version: 1 as const, revision, offer };
    await tx
      .insert(systemSettings)
      .values({
        key: nominationOfferKey(cycle.id),
        value,
        updatedBy: input.actorId,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedBy: input.actorId, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      actorProfileId: input.actorId,
      actorType: "staff",
      action: "nomination offer saved",
      entityType: "award_cycle",
      entityId: cycle.id,
      beforeRedacted: before.offer,
      afterRedacted: offer,
      metadataRedacted: { revision },
      requestId: crypto.randomUUID(),
    });
    return revision;
  });
}
