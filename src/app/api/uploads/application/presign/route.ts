import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applicationChangeRequests,
  applications,
  files,
  profiles,
} from "@/lib/db/schema";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import {
  MAX_FILE_SIZE,
  isExtensionAllowed,
  paymentTypes,
  supportTypes,
} from "@/lib/validation/application";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { assertSameOrigin } from "@/server/security/request";
export const runtime = "nodejs";
const schema = z.object({
  applicationId: z.uuid(),
  kind: z.enum(["requested_document", "payment_proof"]),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
  type: z.string(),
});
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session)
      return NextResponse.json(
        { ok: false, message: "Sign in required." },
        { status: 401 },
      );
    const input = schema.parse(await request.json());
    const allowed =
      input.kind === "payment_proof" ? paymentTypes : supportTypes;
    if (!(allowed as readonly string[]).includes(input.type))
      throw new Error("This file type is not accepted.");
    if (!isExtensionAllowed(input.name, input.type))
      throw new Error(
        "The filename extension does not match the selected file type.",
      );
    const db = getDb();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (!profile?.isActive) throw new Error("Access denied.");
    await enforceRateLimit(`app-upload:${profile.id}`, 15, 3600);
    const [application] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.ownerProfileId, profile.id),
        ),
      )
      .limit(1);
    if (!application) throw new Error("Application not found.");
    if (
      input.kind === "payment_proof" &&
      application.paymentStatus !== "rejected"
    )
      throw new Error(
        "A replacement payment proof is not currently requested.",
      );
    if (input.kind === "requested_document") {
      const [open] = await db
        .select()
        .from(applicationChangeRequests)
        .where(
          and(
            eq(applicationChangeRequests.applicationId, application.id),
            eq(applicationChangeRequests.status, "open"),
          ),
        )
        .limit(1);
      if (!open?.requestedFileKinds.includes("requested_document"))
        throw new Error("A supporting document is not currently requested.");
    }
    const prefix =
      input.kind === "payment_proof" ? "payment-proofs" : "requested-documents";
    const [file] = await db
      .insert(files)
      .values({
        bucket: "private",
        objectKey: `${prefix}/${application.cycleId}/${application.id}/${crypto.randomUUID()}`,
        purpose: input.kind,
        status: "pending",
        originalFilename: input.name,
        safeDownloadFilename: input.name.replace(/[^a-zA-Z0-9._ -]/g, "_"),
        mimeTypeClaimed: input.type,
        sizeBytes: input.size,
        createdByProfileId: profile.id,
      })
      .returning();
    const url = await getSignedUrl(
      getR2(),
      new PutObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: file.objectKey,
        ContentType: input.type,
        ContentLength: input.size,
        Metadata: { "file-id": file.id },
      }),
      { expiresIn: 600 },
    );
    return NextResponse.json({
      ok: true,
      data: { fileId: file.id, url, headers: { "content-type": input.type } },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The upload could not be prepared.",
      },
      { status: 400 },
    );
  }
}
