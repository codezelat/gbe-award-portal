import { createHash, randomBytes } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  awardCategories,
  awardCycles,
  applications,
  payments,
  uploadSessions,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
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
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const requestHeaders = await assertSameOrigin();
    await requireFeatureFlag("applications_enabled");
    const input = initiateApplicationSchema.parse(await request.json());
    if (Date.now() - input.startedAt < 1500)
      throw new Error("Please review the nomination before submitting.");
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? "local";
    await enforceRateLimit(`public-initiate:${ip}:${hash(input.email)}`);
    await verifyTurnstile(input.turnstileToken, ip);
    const db = getDb();
    const existing = await db
      .select({
        id: uploadSessions.id,
        applicationId: uploadSessions.applicationId,
      })
      .from(uploadSessions)
      .where(eq(uploadSessions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing[0])
      return NextResponse.json(
        {
          ok: false,
          message:
            "This nomination is already being processed. Please wait before trying again.",
          errorId: requestId,
        },
        { status: 409 },
      );
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
    const rawToken = randomBytes(32).toString("base64url");
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
    const r2 = getR2();
    const uploads = await Promise.all(
      input.files.map(async (file) => {
        const key = `${file.kind === "payment_proof" ? "payment-proofs" : "applications"}/${match.cycle.year}/${application.id}/${file.id}`;
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
