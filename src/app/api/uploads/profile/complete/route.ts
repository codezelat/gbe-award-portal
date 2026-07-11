import {
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { and, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { auditLogs, files, profiles } from "@/lib/db/schema";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/security/request";
export const runtime = "nodejs";
const schema = z.object({
  fileId: z.uuid(),
  crop: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
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
    const db = getDb();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (!profile) throw new Error("Access denied.");
    const [original] = await db
      .select()
      .from(files)
      .where(eq(files.id, input.fileId))
      .limit(1);
    if (
      !original ||
      original.createdByProfileId !== profile.id ||
      original.purpose !== "profile_original"
    )
      throw new Error("Profile upload not found.");
    if (original.status !== "pending") {
      const [derived] = await db
        .select({ id: files.id })
        .from(files)
        .where(
          and(
            eq(files.sourceFileId, original.id),
            eq(files.purpose, "profile_512"),
            eq(files.status, "ready"),
          ),
        )
        .limit(1);
      if (derived)
        return NextResponse.json({
          ok: true,
          data: {
            fileId: derived.id,
            url: `/api/files/${derived.id}/download`,
          },
        });
      throw new Error("This profile image is already being processed.");
    }
    const r2 = getR2();
    const head = await r2.send(
      new HeadObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: original.objectKey,
      }),
    );
    if (head.ContentLength !== original.sizeBytes)
      throw new Error("The profile image did not upload completely.");
    const object = await r2.send(
      new GetObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: original.objectKey,
      }),
    );
    const buffer = Buffer.from(await object.Body!.transformToByteArray());
    const detected = await fileTypeFromBuffer(buffer);
    if (
      !detected ||
      !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)
    )
      throw new Error("The uploaded file is not a supported image.");
    const oriented = sharp(buffer).autoOrient();
    const meta = await oriented.metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > 40000000)
      throw new Error("The image dimensions are not supported.");
    const left = Math.round(input.crop.x),
      top = Math.round(input.crop.y),
      width = Math.round(input.crop.width),
      height = Math.round(input.crop.height);
    if (
      left < 0 ||
      top < 0 ||
      left + width > meta.width ||
      top + height > meta.height
    )
      throw new Error("The selected crop is outside the image.");
    const cropped = oriented.extract({ left, top, width, height });
    const [large, small] = await Promise.all([
      cropped
        .clone()
        .resize(512, 512, { fit: "cover" })
        .webp({ quality: 84 })
        .toBuffer(),
      cropped
        .clone()
        .resize(96, 96, { fit: "cover" })
        .webp({ quality: 82 })
        .toBuffer(),
    ]);
    const largeKey = `profiles/derived/${profile.id}/${crypto.randomUUID()}-512.webp`;
    const smallKey = `profiles/derived/${profile.id}/${crypto.randomUUID()}-96.webp`;
    await Promise.all([
      r2.send(
        new PutObjectCommand({
          Bucket: env.R2_PRIVATE_BUCKET,
          Key: largeKey,
          Body: large,
          ContentType: "image/webp",
          CacheControl: "private, max-age=86400",
        }),
      ),
      r2.send(
        new PutObjectCommand({
          Bucket: env.R2_PRIVATE_BUCKET,
          Key: smallKey,
          Body: small,
          ContentType: "image/webp",
          CacheControl: "private, max-age=86400",
        }),
      ),
    ]);
    const now = new Date();
    let largeFile: { id: string };
    try {
      largeFile = await db.transaction(async (tx) => {
        const claimed = await tx
          .update(files)
          .set({ status: "validating", updatedAt: now })
          .where(and(eq(files.id, original.id), eq(files.status, "pending")))
          .returning({ id: files.id });
        if (!claimed.length)
          throw new Error("This profile image was already finalised.");
        const [createdLarge] = await tx
          .insert(files)
          .values({
            bucket: "private",
            objectKey: largeKey,
            purpose: "profile_512",
            sourceFileId: original.id,
            status: "ready",
            safeDownloadFilename: "profile-512.webp",
            extension: "webp",
            mimeTypeClaimed: "image/webp",
            mimeTypeDetected: "image/webp",
            sizeBytes: large.byteLength,
            width: 512,
            height: 512,
            createdByProfileId: profile.id,
            validatedAt: now,
          })
          .returning({ id: files.id });
        const [createdSmall] = await tx
          .insert(files)
          .values({
            bucket: "private",
            objectKey: smallKey,
            purpose: "profile_96",
            sourceFileId: original.id,
            status: "ready",
            safeDownloadFilename: "profile-96.webp",
            extension: "webp",
            mimeTypeClaimed: "image/webp",
            mimeTypeDetected: "image/webp",
            sizeBytes: small.byteLength,
            width: 96,
            height: 96,
            createdByProfileId: profile.id,
            validatedAt: now,
          })
          .returning({ id: files.id });
        await tx
          .update(files)
          .set({ status: "superseded", updatedAt: now })
          .where(
            and(
              eq(files.createdByProfileId, profile.id),
              inArray(files.purpose, ["profile_512", "profile_96"]),
              eq(files.status, "ready"),
              ne(files.id, createdLarge.id),
              ne(files.id, createdSmall.id),
            ),
          );
        await tx
          .update(files)
          .set({
            status: "superseded",
            mimeTypeDetected: detected.mime,
            etag: head.ETag,
            width: meta.width,
            height: meta.height,
            validatedAt: now,
            updatedAt: now,
          })
          .where(eq(files.id, original.id));
        await tx
          .update(profiles)
          .set({ profileImageFileId: createdLarge.id, updatedAt: now })
          .where(eq(profiles.id, profile.id));
        await tx.insert(auditLogs).values({
          actorProfileId: profile.id,
          actorType: "applicant",
          action: "profile image replaced",
          entityType: "profile",
          entityId: profile.id,
          beforeRedacted: { profileImageFileId: profile.profileImageFileId },
          afterRedacted: { profileImageFileId: createdLarge.id },
          metadataRedacted: {},
          requestId: crypto.randomUUID(),
        });
        return createdLarge;
      });
    } catch (error) {
      await Promise.all(
        [largeKey, smallKey].map((Key) =>
          r2
            .send(
              new DeleteObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET, Key }),
            )
            .catch(() => undefined),
        ),
      );
      throw error;
    }
    return NextResponse.json({
      ok: true,
      data: {
        fileId: largeFile.id,
        url: `/api/files/${largeFile.id}/download`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The profile image could not be processed.",
      },
      { status: 400 },
    );
  }
}
