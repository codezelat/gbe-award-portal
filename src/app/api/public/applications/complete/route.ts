import { createHash, randomInt } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  applicationFiles,
  applicationStatusHistory,
  applications,
  applicationVersions,
  auditLogs,
  awardCycles,
  cycleSequences,
  emailOutbox,
  files,
  payments,
  uploadSessions,
  nominationDrafts,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getR2, r2ObjectKey } from "@/lib/r2/client";
import {
  fileManifestItemSchema,
  isDetectedTypeAllowed,
} from "@/lib/validation/application";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
import { z } from "zod";
import { requireFeatureFlag } from "@/server/services/feature-flags";
import { setPaymentSession } from "@/server/security/payment-session";
import { draftFileRows } from "@/server/services/nomination-drafts";
import {
  assertNominationPrice,
  NominationPriceChangedError,
} from "@/lib/domain/nomination-pricing";
import { getNominationPricing } from "@/server/services/nomination-offers";

export const runtime = "nodejs";
const inputSchema = z.object({
  sessionToken: z.string(),
  idempotencyKey: z.uuid(),
  acceptedAmountMinor: z.number().int().nonnegative().optional(),
});
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "cause" in error &&
  typeof error.cause === "object" &&
  error.cause !== null &&
  "code" in error.cause &&
  error.cause.code === "23505";
export async function POST(request: Request) {
  scheduleEmailOutboxProcessing();
  const requestId = crypto.randomUUID();
  try {
    await assertSameOrigin();
    await requireFeatureFlag("applications_enabled");
    const input = inputSchema.parse(await request.json());
    const [applicationId, token] = input.sessionToken.split(".");
    if (!applicationId || !token)
      throw new Error("The upload session is invalid or expired.");
    await enforceRateLimit(`public-complete:${applicationId}`, 10, 1800);
    const db = getDb();
    const rows = await db
      .select({
        session: uploadSessions,
        application: applications,
        cycle: awardCycles,
        payment: payments,
      })
      .from(uploadSessions)
      .innerJoin(
        applications,
        eq(uploadSessions.applicationId, applications.id),
      )
      .innerJoin(awardCycles, eq(applications.cycleId, awardCycles.id))
      .innerJoin(payments, eq(payments.applicationId, applications.id))
      .where(
        and(
          eq(uploadSessions.applicationId, applicationId),
          eq(uploadSessions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row || row.session.publicTokenHash !== hash(token))
      throw new Error("The upload session is invalid or expired.");
    if (row.application.deletedAt)
      throw new Error("This nomination is no longer available.");
    if (row.session.status === "completed" && row.application.reference) {
      if (row.payment.method === "card" && row.session.expiresAt > new Date())
        await setPaymentSession(applicationId, token);
      return NextResponse.json({
        ok: true,
        data: {
          reference: row.application.reference,
          paymentUrl:
            row.payment.method === "card"
              ? `/apply/payment/${applicationId}`
              : undefined,
        },
      });
    }
    if (row.session.expiresAt < new Date())
      throw new Error(
        "The upload session expired. Your entered details remain on this page; please submit again.",
      );
    if (row.session.status !== "uploading")
      throw new Error(
        "The form changed. Please submit the latest saved details.",
      );
    if (row.cycle.status !== "open" || new Date() > row.cycle.closesAt)
      throw new Error("Nominations are no longer open for completion.");
    const manifest = z
      .array(fileManifestItemSchema)
      .parse(row.session.expectedManifest);
    const r2 = getR2();
    const [draft] = await db
      .select()
      .from(nominationDrafts)
      .where(eq(nominationDrafts.applicationId, applicationId));
    if (draft?.deletedAt)
      throw new Error("This nomination is no longer available.");
    const savedFiles = draft ? await draftFileRows(draft.id) : [];
    const readyFiles: Array<{
      id: string;
      kind: "supporting_document" | "payment_proof";
      key: string;
      name: string;
      size: number;
      claimed: string;
      detected: string;
      etag?: string;
      storedFileId?: string;
    }> = [];
    for (const item of manifest) {
      const saved = savedFiles.find(({ link }) => link.id === item.id);
      if (draft && (!saved || saved.file.status !== "ready"))
        throw new Error("A saved file is no longer available.");
      const key =
        saved?.file.objectKey ??
        r2ObjectKey(
          `${item.kind === "payment_proof" ? "payment-proofs" : "applications"}/${row.cycle.year}/${row.application.id}/${item.id}`,
        );
      const head = await r2.send(
        new HeadObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET, Key: key }),
      );
      if (head.ContentLength !== item.size)
        throw new Error(`${item.name} did not upload completely.`);
      const object = await r2.send(
        new GetObjectCommand({
          Bucket: env.R2_PRIVATE_BUCKET,
          Key: key,
          Range: "bytes=0-8191",
        }),
      );
      const bytes = await object.Body?.transformToByteArray();
      const detected = bytes ? await fileTypeFromBuffer(bytes) : undefined;
      if (
        !detected ||
        !isDetectedTypeAllowed(item.kind, item.type, detected.mime)
      )
        throw new Error(`${item.name} does not match an accepted file type.`);
      readyFiles.push({
        id: item.id,
        storedFileId: saved?.file.id,
        kind: item.kind,
        key,
        name: item.name,
        size: item.size,
        claimed: item.type,
        detected: detected.mime,
        etag: head.ETag,
      });
    }
    const reference = await db.transaction(async (tx) => {
      if (draft) {
        const [current] = await tx
          .select()
          .from(nominationDrafts)
          .where(eq(nominationDrafts.id, draft.id))
          .for("update");
        if (!current || current.deletedAt)
          throw new Error("This nomination is no longer available.");
      }
      const claimed = await tx
        .update(uploadSessions)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(uploadSessions.id, row.session.id),
            eq(uploadSessions.idempotencyKey, input.idempotencyKey),
            eq(uploadSessions.status, "uploading"),
          ),
        )
        .returning({ id: uploadSessions.id });
      if (!claimed.length) {
        const [completed] = await tx
          .select({ reference: applications.reference })
          .from(applications)
          .where(eq(applications.id, row.application.id))
          .limit(1);
        if (completed?.reference) return completed.reference;
        throw new Error("This upload session is already being finalised.");
      }
      // Only an unsubmitted nomination reaches here. Recheck after uploads and
      // locks, so an unfinished draft cannot carry the offer past its deadline.
      const [currentCycle] = await tx
        .select()
        .from(awardCycles)
        .where(eq(awardCycles.id, row.cycle.id))
        .for("share");
      if (!currentCycle) throw new Error("Award cycle is unavailable.");
      const pricing = await getNominationPricing(currentCycle, tx);
      assertNominationPrice(pricing, input.acceptedAmountMinor);
      await tx
        .insert(cycleSequences)
        .values({
          cycleId: row.cycle.id,
          nextApplicationNumber: 2,
          nextPaymentNumber: 2,
        })
        .onConflictDoUpdate({
          target: cycleSequences.cycleId,
          set: {
            nextApplicationNumber: sql`${cycleSequences.nextApplicationNumber}+1`,
            nextPaymentNumber: sql`${cycleSequences.nextPaymentNumber}+1`,
            updatedAt: new Date(),
          },
        });
      const [sequence] = await tx
        .select({
          nextApplication: cycleSequences.nextApplicationNumber,
          nextPayment: cycleSequences.nextPaymentNumber,
        })
        .from(cycleSequences)
        .where(eq(cycleSequences.cycleId, row.cycle.id));
      const paymentNumber = Math.max(1, sequence.nextPayment - 1);
      let reference: string | undefined;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = `GBE-${row.cycle.year}-${randomInt(100000, 1_000_000)}`;
        try {
          const [claimedReference] = await tx.transaction(async (savepoint) =>
            savepoint
              .update(applications)
              .set({ reference: candidate, updatedAt: new Date() })
              .where(
                and(
                  eq(applications.id, row.application.id),
                  eq(applications.workflowStatus, "uploading"),
                  isNull(applications.reference),
                  isNull(applications.deletedAt),
                ),
              )
              .returning({ id: applications.id }),
          );
          if (claimedReference) {
            reference = candidate;
            break;
          }
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      if (!reference)
        throw new Error("We could not allocate a unique nomination reference.");
      const paymentReference = `PAY-${row.cycle.year}-${String(paymentNumber).padStart(6, "0")}`;
      await tx
        .update(payments)
        .set({
          paymentReference,
          ...(pricing.phase !== "none"
            ? { expectedAmountMinor: pricing.amountMinor }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(payments.applicationId, row.application.id));
      for (const item of readyFiles) {
        const [stored] = item.storedFileId
          ? [{ id: item.storedFileId }]
          : await tx
              .insert(files)
              .values({
                bucket: "private",
                objectKey: item.key,
                purpose: item.kind,
                status: "ready",
                originalFilename: item.name,
                safeDownloadFilename: item.name.replace(
                  /[^a-zA-Z0-9._ -]/g,
                  "_",
                ),
                mimeTypeClaimed: item.claimed,
                mimeTypeDetected: item.detected,
                sizeBytes: item.size,
                etag: item.etag,
                createdViaPublicSubmission: true,
                validatedAt: new Date(),
              })
              .returning({ id: files.id });
        const [link] = await tx
          .insert(applicationFiles)
          .values({
            applicationId: row.application.id,
            fileId: stored.id,
            kind: item.kind,
          })
          .returning({ id: applicationFiles.id });
        if (item.kind === "payment_proof")
          await tx
            .update(payments)
            .set({ proofApplicationFileId: link.id, updatedAt: new Date() })
            .where(eq(payments.applicationId, row.application.id));
      }
      const submittedAt = new Date(pricing.serverNow);
      const snapshot = {
        nomineeName: row.application.nomineeName,
        designation: row.application.designation,
        awardNomination: row.application.awardNomination,
        businessWebsite: row.application.businessWebsite,
        email: row.application.emailDisplay,
        phone: row.application.phoneDisplay,
        categoryName: row.application.categoryNameSnapshot,
        submittedAt: submittedAt.toISOString(),
      };
      await tx.insert(applicationVersions).values({
        applicationId: row.application.id,
        version: 1,
        source: "public_submission",
        payload: snapshot,
      });
      const updatedApplication = await tx
        .update(applications)
        .set({
          workflowStatus: "submitted",
          submittedAt,
          currentVersion: 1,
          lastActivityAt: submittedAt,
          updatedAt: submittedAt,
        })
        .where(
          and(
            eq(applications.id, row.application.id),
            eq(applications.workflowStatus, "uploading"),
            isNull(applications.deletedAt),
          ),
        )
        .returning({ id: applications.id });
      if (!updatedApplication.length)
        throw new Error("This nomination was already finalised.");
      if (draft)
        await tx
          .update(nominationDrafts)
          .set({ submittedAt, updatedAt: submittedAt })
          .where(eq(nominationDrafts.id, draft.id));
      await tx.insert(applicationStatusHistory).values({
        applicationId: row.application.id,
        fromStatus: "uploading",
        toStatus: "submitted",
        applicantLabel: "Nomination received",
        applicantMessage:
          "Your nomination has been received for administrative review.",
        isSystemAction: true,
        effectiveAt: submittedAt,
      });
      await tx
        .update(uploadSessions)
        .set({
          status: "completed",
          completedAt: submittedAt,
          ...(row.payment.method === "card"
            ? { expiresAt: new Date(Date.now() + 7 * 86400_000) }
            : {}),
          updatedAt: submittedAt,
        })
        .where(eq(uploadSessions.id, row.session.id));
      await tx.insert(auditLogs).values({
        actorType: "public",
        action: "application submitted",
        entityType: "application",
        entityId: row.application.id,
        applicationId: row.application.id,
        afterRedacted: { reference, paymentReference },
        metadataRedacted: { fileCount: readyFiles.length },
        requestId,
      });
      await tx.insert(emailOutbox).values({
        templateKey: "nomination_received",
        recipientEmail: row.application.emailNormalised,
        applicationId: row.application.id,
        payload: {
          reference,
          paymentReference,
          nomineeName: row.application.nomineeName,
        },
        idempotencyKey: `nomination_received:${row.application.id}:1`,
      });
      await tx.insert(emailOutbox).values({
        templateKey: "admin_nomination_received",
        recipientEmail: env.SUPPORT_EMAIL,
        applicationId: row.application.id,
        payload: {
          title: "New GBE Awards nomination",
          reference,
          nomineeName: row.application.nomineeName,
          categoryName: row.application.categoryNameSnapshot,
          awardNomination: row.application.awardNomination,
          submittedAt: submittedAt.toISOString(),
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/applications/${row.application.id}`,
        },
        idempotencyKey: `admin_nomination_received:${row.application.id}:1`,
      });
      return reference;
    });
    if (row.payment.method === "card")
      await setPaymentSession(applicationId, token);
    return NextResponse.json({
      ok: true,
      data: {
        reference,
        paymentUrl:
          row.payment.method === "card"
            ? `/apply/payment/${applicationId}`
            : undefined,
      },
    });
  } catch (error) {
    if (error instanceof NominationPriceChangedError)
      return NextResponse.json(
        {
          ok: false,
          code: "PRICE_CHANGED",
          message: error.message,
          pricing: error.pricing,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    console.error(
      JSON.stringify({
        level: "error",
        action: "public application complete",
        requestId,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && !("cause" in error)
            ? error.message
            : "We could not confirm your nomination. Please try again.",
        errorId: requestId,
        retryable: true,
      },
      { status: 400 },
    );
  }
}
