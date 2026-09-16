import "server-only";
import {
  assertNominationPrice,
  nominationPricing,
} from "@/lib/domain/nomination-pricing";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "@/lib/db";
import {
  applications,
  awardCategories,
  awardCycles,
  files,
  nominationDraftFiles,
  nominationDrafts,
  payments,
  uploadSessions,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getR2, r2ObjectKey } from "@/lib/r2/client";
import {
  initiateApplicationSchema,
  isDetectedTypeAllowed,
  normalisePhone,
  normaliseUrl,
} from "@/lib/validation/application";
import {
  draftDataSchema,
  type DraftCredential,
  saveDraftSchema,
} from "@/lib/validation/nomination-draft";
import { verifyTurnstile } from "@/server/security/turnstile";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const draftHash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
export class DraftUnavailableError extends Error {}
export function assertDraftCredential(
  row: typeof nominationDrafts.$inferSelect | undefined,
  credential: DraftCredential,
) {
  if (
    !row ||
    row.deletedAt ||
    !timingSafeEqual(
      Buffer.from(row.tokenHash, "hex"),
      Buffer.from(draftHash(credential.secret), "hex"),
    )
  )
    throw new DraftUnavailableError(
      "This saved form is no longer available. Start a new nomination.",
    );
  return row;
}
export async function lockDraft(tx: Tx, credential: DraftCredential) {
  const [row] = await tx
    .select()
    .from(nominationDrafts)
    .where(eq(nominationDrafts.id, credential.id))
    .for("update");
  return assertDraftCredential(row, credential);
}
export async function draftFileRows(
  draftId: string,
  db: Database | Tx = getDb(),
) {
  return db
    .select({ link: nominationDraftFiles, file: files })
    .from(nominationDraftFiles)
    .innerJoin(files, eq(nominationDraftFiles.fileId, files.id))
    .where(
      and(
        eq(nominationDraftFiles.draftId, draftId),
        isNull(nominationDraftFiles.removedAt),
      ),
    );
}
export async function saveNominationDraft(
  input: z.infer<typeof saveDraftSchema>,
  ip?: string,
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(nominationDrafts)
    .where(eq(nominationDrafts.id, input.credential.id));
  if (existing) assertDraftCredential(existing, input.credential);
  else {
    if (input.step !== 0 || Date.now() - input.startedAt < 1500)
      throw new Error("Please review the nominee details before continuing.");
    await verifyTurnstile(input.turnstileToken ?? "", ip);
  }
  const [cycle] = await db
    .select()
    .from(awardCycles)
    .where(eq(awardCycles.id, input.cycleId));
  const now = new Date();
  if (
    !cycle ||
    cycle.status !== "open" ||
    now < cycle.opensAt ||
    now > cycle.closesAt
  )
    throw new Error(
      "Nominations are not currently open. Your previously saved details are retained.",
    );
  if (input.data.categoryId) {
    const [category] = await db
      .select({ id: awardCategories.id })
      .from(awardCategories)
      .where(
        and(
          eq(awardCategories.id, input.data.categoryId),
          eq(awardCategories.cycleId, cycle.id),
          eq(awardCategories.isActive, true),
        ),
      );
    if (!category) throw new Error("Choose an available award category.");
  }
  const result = await db.transaction(async (tx) => {
    await tx
      .insert(nominationDrafts)
      .values({
        id: input.credential.id,
        tokenHash: draftHash(input.credential.secret),
        cycleId: cycle.id,
        payload: input.data,
      })
      .onConflictDoNothing();
    const row = await lockDraft(tx, input.credential);
    if (row.submittedAt || row.cycleId !== cycle.id)
      throw new Error(
        "This nomination has already been submitted or belongs to another cycle.",
      );
    const linked = await draftFileRows(row.id, tx);
    const same =
      JSON.stringify(draftDataSchema.parse(row.payload)) ===
        JSON.stringify(input.data) &&
      row.savedStep === input.step &&
      linked.length === input.files.length &&
      input.files.every((item) =>
        linked.some(
          ({ link, file }) =>
            link.id === item.id &&
            file.originalFilename === item.name &&
            file.sizeBytes === item.size &&
            file.mimeTypeClaimed === item.type &&
            link.kind === item.kind,
        ),
      );
    if (row.version !== input.version && !same)
      throw new Error(
        "This form changed in another tab. Reload to use the latest saved details.",
      );
    if (same && row.version > 0) return row;
    const additions = input.files.filter(
      (item) => !linked.some(({ link }) => link.id === item.id),
    );
    if (additions.length) {
      const [history] = await tx
        .select({ value: count() })
        .from(nominationDraftFiles)
        .where(eq(nominationDraftFiles.draftId, row.id));
      if (history.value + additions.length > 60)
        throw new Error(
          "The file replacement limit has been reached. Contact the awards team for help.",
        );
    }
    if (row.applicationId) {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, row.applicationId))
        .for("update");
      if (
        !app ||
        app.deletedAt ||
        app.submittedAt ||
        app.workflowStatus !== "uploading"
      )
        throw new Error("This nomination can no longer be changed here.");
      await tx
        .update(uploadSessions)
        .set({ status: "failed", updatedAt: now })
        .where(
          and(
            eq(uploadSessions.applicationId, app.id),
            eq(uploadSessions.status, "uploading"),
          ),
        );
    }
    const removed = linked.filter(
      ({ link }) => !input.files.some((item) => item.id === link.id),
    );
    if (removed.length) {
      await tx
        .update(nominationDraftFiles)
        .set({ removedAt: now })
        .where(
          inArray(
            nominationDraftFiles.id,
            removed.map((row) => row.link.id),
          ),
        );
      await tx
        .update(files)
        .set({ status: "superseded", updatedAt: now })
        .where(
          inArray(
            files.id,
            removed.map((row) => row.file.id),
          ),
        );
    }
    for (const item of input.files) {
      const prior = linked.find((row) => row.link.id === item.id);
      if (prior) {
        if (
          prior.file.originalFilename !== item.name ||
          prior.file.sizeBytes !== item.size ||
          prior.file.mimeTypeClaimed !== item.type ||
          prior.link.kind !== item.kind ||
          prior.file.status === "deleted"
        )
          throw new Error(
            "A saved file changed. Remove it and choose the file again.",
          );
        continue;
      }
      const [stored] = await tx
        .insert(files)
        .values({
          bucket: "private",
          objectKey: r2ObjectKey(`drafts/${row.id}/${item.id}`),
          purpose: item.kind,
          status: "pending",
          originalFilename: item.name,
          safeDownloadFilename: item.name.replace(/[^a-zA-Z0-9._ -]/g, "_"),
          mimeTypeClaimed: item.type,
          sizeBytes: item.size,
          createdViaPublicSubmission: true,
        })
        .returning({ id: files.id });
      await tx.insert(nominationDraftFiles).values({
        id: item.id,
        draftId: row.id,
        fileId: stored.id,
        kind: item.kind,
      });
    }
    const [updated] = await tx
      .update(nominationDrafts)
      .set({
        payload: input.data,
        savedStep: input.step,
        version: row.version + 1,
        updatedAt: now,
      })
      .where(eq(nominationDrafts.id, row.id))
      .returning();
    return updated;
  });
  const linked = await draftFileRows(result.id);
  const uploads = await Promise.all(
    linked
      .filter((row) => row.file.status === "pending")
      .map(async ({ link, file }) => ({
        id: link.id,
        url: await getSignedUrl(
          getR2(),
          new PutObjectCommand({
            Bucket: env.R2_PRIVATE_BUCKET,
            Key: file.objectKey,
            ContentType: file.mimeTypeClaimed!,
            ContentLength: file.sizeBytes,
          }),
          { expiresIn: 60 },
        ),
        headers: { "content-type": file.mimeTypeClaimed! },
      })),
  );
  return { version: result.version, uploads };
}
export async function confirmDraftFiles(
  credential: DraftCredential,
  version: number,
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(nominationDrafts)
    .where(eq(nominationDrafts.id, credential.id));
  const draft = assertDraftCredential(row, credential);
  if (draft.submittedAt || draft.version !== version)
    throw new Error("The saved form changed. Please retry this step.");
  const linked = await draftFileRows(draft.id);
  const checked = await Promise.all(
    linked
      .filter((row) => row.file.status !== "ready")
      .map(async ({ file, link }) => {
        if (file.status !== "pending")
          throw new Error(
            "A file expired. Remove it and choose the file again.",
          );
        const head = await getR2().send(
          new HeadObjectCommand({
            Bucket: env.R2_PRIVATE_BUCKET,
            Key: file.objectKey,
          }),
        );
        if (head.ContentLength !== file.sizeBytes)
          throw new Error(
            `${file.safeDownloadFilename} did not upload completely.`,
          );
        const object = await getR2().send(
          new GetObjectCommand({
            Bucket: env.R2_PRIVATE_BUCKET,
            Key: file.objectKey,
            Range: "bytes=0-8191",
          }),
        );
        const bytes = await object.Body?.transformToByteArray();
        const detected = bytes ? await fileTypeFromBuffer(bytes) : undefined;
        if (
          !detected ||
          !isDetectedTypeAllowed(
            link.kind,
            file.mimeTypeClaimed!,
            detected.mime,
          )
        )
          throw new Error(
            `${file.safeDownloadFilename} is not an accepted file type.`,
          );
        return { id: file.id, mime: detected.mime, etag: head.ETag };
      }),
  );
  await db.transaction(async (tx) => {
    const current = await lockDraft(tx, credential);
    if (current.submittedAt || current.version !== version)
      throw new Error("The saved form changed. Please retry this step.");
    for (const file of checked)
      await tx
        .update(files)
        .set({
          status: "ready",
          mimeTypeDetected: file.mime,
          etag: file.etag,
          validatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(files.id, file.id), eq(files.status, "pending")));
  });
}

export async function initiateDraftSubmission(
  input: z.infer<typeof initiateApplicationSchema>,
  ip?: string,
) {
  if (!input.draftCredential) throw new Error("Saved form access is required.");
  const credential = input.draftCredential;
  const db = getDb();
  const [prior] = await db
    .select()
    .from(nominationDrafts)
    .where(eq(nominationDrafts.id, credential.id));
  assertDraftCredential(prior, credential);
  const [retry] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.idempotencyKey, input.idempotencyKey));
  if (retry && retry.applicationId !== prior.applicationId)
    throw new Error(
      "This submission key belongs to another form. Start a fresh submission.",
    );
  if (
    !retry ||
    retry.applicationId !== prior.applicationId ||
    retry.status === "failed" ||
    retry.expiresAt < new Date()
  )
    await verifyTurnstile(input.turnstileToken, ip);
  return db.transaction(async (tx) => {
    const draft = await lockDraft(tx, credential);
    const [cycle] = await tx
      .select()
      .from(awardCycles)
      .where(eq(awardCycles.id, draft.cycleId));
    const [category] = await tx
      .select()
      .from(awardCategories)
      .where(
        and(
          eq(awardCategories.id, input.categoryId),
          eq(awardCategories.cycleId, draft.cycleId),
          eq(awardCategories.isActive, true),
        ),
      );
    const now = new Date();
    if (
      !cycle ||
      !category ||
      cycle.status !== "open" ||
      now < cycle.opensAt ||
      now > cycle.closesAt
    )
      throw new Error("Nominations are not currently open for this category.");
    const pricing = nominationPricing(cycle);
    if (
      input.paymentMethod === "card" &&
      (!pricing.amountMinor || cycle.currency !== "LKR")
    )
      throw new Error("Card payment is unavailable for this cycle.");
    const linked = await draftFileRows(draft.id, tx);
    if (
      linked.length !== input.files.length ||
      input.files.some(
        (item) =>
          !linked.some(
            ({ link, file }) =>
              link.id === item.id &&
              link.kind === item.kind &&
              file.status === "ready" &&
              file.sizeBytes === item.size &&
              file.originalFilename === item.name &&
              file.mimeTypeClaimed === item.type,
          ),
      )
    )
      throw new Error("Save your selected files before submitting.");
    let appId = draft.applicationId;
    if (appId) {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, appId))
        .for("update");
      if (!app || app.deletedAt)
        throw new Error("This nomination is no longer available.");
      const [existing] = await tx
        .select()
        .from(uploadSessions)
        .where(
          and(
            eq(uploadSessions.applicationId, appId),
            eq(uploadSessions.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (
        existing &&
        ["uploading", "completed"].includes(existing.status) &&
        existing.expiresAt > now
      ) {
        const raw = createHmac("sha256", env.BETTER_AUTH_SECRET!)
          .update(`public-upload:${appId}:${existing.idempotencyKey}`)
          .digest("base64url");
        return {
          sessionToken: `${appId}.${raw}`,
          idempotencyKey: existing.idempotencyKey,
          uploads: [],
          preparedFileIds: input.files.map((file) => file.id),
        };
      }
      if (
        app.submittedAt ||
        draft.submittedAt ||
        app.workflowStatus !== "uploading"
      )
        throw new Error("This nomination has already been submitted.");
    }
    assertNominationPrice(pricing, input.acceptedAmountMinor);
    const values = {
      cycleId: cycle.id,
      categoryId: category.id,
      nomineeName: input.nomineeName,
      designation: input.designation || null,
      awardNomination: input.awardNomination,
      businessWebsite: normaliseUrl(input.businessWebsite) || null,
      emailNormalised: input.email.trim().toLowerCase(),
      emailDisplay: input.email,
      phoneE164: normalisePhone(input.phone) ?? null,
      phoneDisplay: input.phone,
      categoryNameSnapshot: category.name,
      categoryCodeSnapshot: category.code,
      declarationAccepted: true,
      declarationTextSnapshot: cycle.declarationText,
      declarationVersion: cycle.declarationVersion,
      termsVersion: cycle.termsVersion,
      privacyVersion: cycle.privacyVersion,
      formSchemaVersion: cycle.formSchemaVersion,
      paymentStatus:
        input.paymentMethod === "card"
          ? ("awaiting_payment" as const)
          : ("proof_submitted" as const),
      lastActivityAt: now,
      updatedAt: now,
    };
    if (appId)
      await tx
        .update(applications)
        .set(values)
        .where(eq(applications.id, appId));
    else {
      const [created] = await tx
        .insert(applications)
        .values(values)
        .returning({ id: applications.id });
      appId = created.id;
      await tx
        .update(nominationDrafts)
        .set({ applicationId: appId })
        .where(eq(nominationDrafts.id, draft.id));
    }
    await tx
      .insert(payments)
      .values({
        applicationId: appId,
        method: input.paymentMethod,
        status: values.paymentStatus,
        expectedAmountMinor: pricing.amountMinor,
        currency: cycle.currency,
      })
      .onConflictDoUpdate({
        target: payments.applicationId,
        set: {
          method: input.paymentMethod,
          status: values.paymentStatus,
          expectedAmountMinor: pricing.amountMinor,
          currency: cycle.currency,
          updatedAt: now,
        },
      });
    await tx
      .update(uploadSessions)
      .set({ status: "failed", updatedAt: now })
      .where(
        and(
          eq(uploadSessions.applicationId, appId),
          eq(uploadSessions.status, "uploading"),
        ),
      );
    const raw = createHmac("sha256", env.BETTER_AUTH_SECRET!)
      .update(`public-upload:${appId}:${input.idempotencyKey}`)
      .digest("base64url");
    const session = {
      applicationId: appId,
      publicTokenHash: draftHash(raw),
      idempotencyKey: input.idempotencyKey,
      expectedManifest: input.files,
      status: "uploading" as const,
      expiresAt: new Date(Date.now() + 30 * 60000),
      updatedAt: now,
    };
    const inserted = await tx
      .insert(uploadSessions)
      .values(session)
      .onConflictDoNothing()
      .returning({ id: uploadSessions.id });
    if (!inserted.length) {
      const updated = await tx
        .update(uploadSessions)
        .set(session)
        .where(
          and(
            eq(uploadSessions.idempotencyKey, input.idempotencyKey),
            eq(uploadSessions.applicationId, appId),
          ),
        )
        .returning({ id: uploadSessions.id });
      if (!updated.length)
        throw new Error("This submission key belongs to another form.");
    }
    await tx
      .update(nominationDrafts)
      .set({
        payload: draftDataSchema.parse(input),
        savedStep: 3,
        updatedAt: now,
      })
      .where(eq(nominationDrafts.id, draft.id));
    return {
      sessionToken: `${appId}.${raw}`,
      idempotencyKey: input.idempotencyKey,
      uploads: [],
      preparedFileIds: input.files.map((file) => file.id),
    };
  });
}
