import { createHash, createHmac } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, count, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  awardCategories,
  awardCycles,
  applications,
  payments,
  uploadSessions,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { env, requireProvider } from "@/lib/env";
import { getR2 } from "@/lib/r2/client";
import {
  initiateApplicationSchema,
  normalisePhone,
  normaliseUrl,
} from "@/lib/validation/application";
import { assertSameOrigin } from "@/server/security/request";
import { verifyTurnstile } from "@/server/security/turnstile";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requireFeatureFlag } from "@/server/services/feature-flags";

export const runtime = "nodejs";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sessionToken = (applicationId: string, idempotencyKey: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET!)
    .update(`public-upload:${applicationId}:${idempotencyKey}`)
    .digest("base64url");
async function createUploadTargets(
  manifest: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    kind: "supporting_document" | "payment_proof";
  }>,
  cycleYear: number,
  applicationId: string,
) {
  const r2 = getR2();
  return Promise.all(
    manifest.map(async (file) => {
      const key = `${file.kind === "payment_proof" ? "payment-proofs" : "applications"}/${cycleYear}/${applicationId}/${file.id}`;
      const command = new PutObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: key,
        ContentType: file.type,
        ContentLength: file.size,
        Metadata: { "upload-id": file.id },
      });
      return {
        id: file.id,
        url: await getSignedUrl(r2, command, { expiresIn: 600 }),
        headers: { "content-type": file.type },
      };
    }),
  );
}
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const requestHeaders = await assertSameOrigin();
    await requireFeatureFlag("applications_enabled");
    requireProvider("auth");
    requireProvider("r2");
    const input = initiateApplicationSchema.parse(await request.json());
    if (Date.now() - input.startedAt < 1500)
      throw new Error("Please review the nomination before submitting.");
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? "local";
    await enforceRateLimit(`public-initiate:${ip}:${hash(input.email)}`);
    const db = getDb();
    const existing = await db
      .select({
        session: uploadSessions,
        application: applications,
        cycle: awardCycles,
      })
      .from(uploadSessions)
      .innerJoin(
        applications,
        eq(uploadSessions.applicationId, applications.id),
      )
      .innerJoin(awardCycles, eq(applications.cycleId, awardCycles.id))
      .where(eq(uploadSessions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing[0]) {
      const prior = existing[0];
      if (
        JSON.stringify(prior.session.expectedManifest) !==
        JSON.stringify(input.files)
      )
        throw new Error(
          "This retry does not match the original file selection. Start a fresh submission.",
        );
      if (prior.session.expiresAt < new Date())
        throw new Error(
          "The prior upload session expired. Start a fresh submission.",
        );
      const rawToken = sessionToken(
        prior.application.id,
        prior.session.idempotencyKey,
      );
      const uploads =
        prior.session.status === "completed"
          ? []
          : await createUploadTargets(
              input.files,
              prior.cycle.year,
              prior.application.id,
            );
      return NextResponse.json({
        ok: true,
        data: {
          sessionToken: `${prior.application.id}.${rawToken}`,
          uploads,
          resumed: true,
        },
      });
    }
    await verifyTurnstile(input.turnstileToken, ip);
    const categoryRows = await db
      .select({ category: awardCategories, cycle: awardCycles })
      .from(awardCategories)
      .innerJoin(awardCycles, eq(awardCategories.cycleId, awardCycles.id))
      .where(
        and(
          eq(awardCategories.id, input.categoryId),
          eq(awardCategories.isActive, true),
          eq(awardCycles.status, "open"),
        ),
      )
      .limit(1);
    const match = categoryRows[0];
    if (!match)
      throw new Error(
        "The selected category is not available in the current open award cycle.",
      );
    const now = new Date();
    if (now < match.cycle.opensAt || now > match.cycle.closesAt)
      throw new Error("Nominations are not currently open.");
    const [provisional] = await db
      .select({ value: count() })
      .from(applications)
      .where(
        and(
          eq(applications.emailNormalised, input.email.trim().toLowerCase()),
          eq(applications.workflowStatus, "uploading"),
          gte(applications.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
        ),
      );
    if (provisional.value >= 3)
      throw new Error(
        "Too many incomplete uploads are active for this email address. Wait for them to expire or contact support.",
      );
    const application = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(applications)
        .values({
          cycleId: match.cycle.id,
          categoryId: match.category.id,
          nomineeName: input.nomineeName,
          designation: input.designation || null,
          industrySector: input.industrySector,
          businessWebsite: normaliseUrl(input.businessWebsite) || null,
          emailNormalised: input.email.trim().toLowerCase(),
          emailDisplay: input.email,
          phoneE164: normalisePhone(input.phone) ?? null,
          phoneDisplay: input.phone,
          categoryNameSnapshot: match.category.name,
          categoryCodeSnapshot: match.category.code,
          declarationAccepted: true,
          declarationTextSnapshot: match.cycle.declarationText,
          declarationVersion: match.cycle.declarationVersion,
          termsVersion: match.cycle.termsVersion,
          privacyVersion: match.cycle.privacyVersion,
          formSchemaVersion: match.cycle.formSchemaVersion,
          lastActivityAt: now,
        })
        .returning({ id: applications.id });
      await tx.insert(payments).values({
        applicationId: created.id,
        status: "proof_submitted",
        currency: match.cycle.currency,
      });
      const rawToken = sessionToken(created.id, input.idempotencyKey);
      await tx.insert(uploadSessions).values({
        applicationId: created.id,
        publicTokenHash: hash(rawToken),
        idempotencyKey: input.idempotencyKey,
        expectedManifest: input.files,
        status: "uploading",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        requestFingerprintHash: hash(
          `${requestHeaders.get("user-agent") ?? ""}:${input.email}`,
        ),
      });
      return created;
    });
    const rawToken = sessionToken(application.id, input.idempotencyKey);
    const uploads = await createUploadTargets(
      input.files,
      match.cycle.year,
      application.id,
    );
    return NextResponse.json({
      ok: true,
      data: { sessionToken: `${application.id}.${rawToken}`, uploads },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        action: "public application initiate",
        requestId,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "We could not prepare the secure upload. Please try again.",
        errorId: requestId,
        retryable: true,
      },
      { status: 400 },
    );
  }
}
