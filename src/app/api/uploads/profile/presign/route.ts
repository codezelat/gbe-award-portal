import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { files, profiles } from "@/lib/db/schema";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import {
  isExtensionAllowed,
  MAX_FILE_SIZE,
} from "@/lib/validation/application";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
export const runtime = "nodejs";
const schema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
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
    if (!isExtensionAllowed(input.name, input.type))
      throw new Error("The image extension does not match its file type.");
    const [profile] = await getDb()
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (!profile?.isActive) throw new Error("Access denied.");
    await enforceRateLimit(`profile-image:${profile.id}`, 10, 3600);
    const [file] = await getDb()
      .insert(files)
      .values({
        bucket: "private",
        objectKey: `profiles/originals/${profile.id}/${crypto.randomUUID()}`,
        purpose: "profile_original",
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
            : "The profile upload could not be prepared.",
      },
      { status: 400 },
    );
  }
}
