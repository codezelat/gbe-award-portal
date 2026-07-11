import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  applicationFiles,
  applications,
  auditLogs,
  files,
  profiles,
  staffMemberships,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import { getAuth } from "@/lib/auth";
import { hasPermission } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session)
      return NextResponse.json(
        { message: "Sign in is required." },
        { status: 401 },
      );
    const db = getDb();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (!profile?.isActive)
      return NextResponse.json({ message: "Access denied." }, { status: 403 });
    await enforceRateLimit(`file-download:${profile.id}`, 120, 3600);
    const [record] = await db
      .select({ file: files, application: applications })
      .from(files)
      .leftJoin(applicationFiles, eq(applicationFiles.fileId, files.id))
      .leftJoin(
        applications,
        eq(applicationFiles.applicationId, applications.id),
      )
      .where(and(eq(files.id, fileId), eq(files.status, "ready")))
      .limit(1);
    if (!record)
      return NextResponse.json({ message: "File not found." }, { status: 404 });
    const requestedPreview =
      new URL(request.url).searchParams.get("view") === "1";
    const previewAllowed =
      requestedPreview &&
      (record.file.mimeTypeDetected === "application/pdf" ||
        record.file.mimeTypeDetected?.startsWith("image/"));
    if (profile.accountKind === "applicant") {
      const ownsApplication = record.application?.ownerProfileId === profile.id;
      const ownsProfileImage =
        record.file.createdByProfileId === profile.id &&
        ["profile_original", "profile_512", "profile_96"].includes(
          record.file.purpose,
        );
      if (!ownsApplication && !ownsProfileImage)
        return NextResponse.json(
          { message: "Access denied." },
          { status: 403 },
        );
    }
    if (profile.accountKind === "staff") {
      const [membership] = await db
        .select()
        .from(staffMemberships)
        .where(eq(staffMemberships.profileId, profile.id))
        .limit(1);
      if (
        !membership ||
        membership.suspendedAt ||
        !hasPermission(membership, "files.view")
      )
        return NextResponse.json(
          { message: "Access denied." },
          { status: 403 },
        );
      if (
        record.application &&
        !hasPermission(membership, "applications.view_all") &&
        record.application.assignedReviewerId !== profile.id
      )
        return NextResponse.json(
          { message: "Access denied." },
          { status: 403 },
        );
      if (
        !record.application &&
        record.file.purpose === "export" &&
        (!hasPermission(membership, "exports.create") ||
          record.file.createdByProfileId !== profile.id)
      )
        return NextResponse.json(
          { message: "Access denied." },
          { status: 403 },
        );
      if (
        !record.application &&
        ["profile_original", "profile_512", "profile_96"].includes(
          record.file.purpose,
        ) &&
        !hasPermission(membership, "applicants.manage")
      )
        return NextResponse.json(
          { message: "Access denied." },
          { status: 403 },
        );
    }
    const command = new GetObjectCommand({
      Bucket:
        record.file.bucket === "private"
          ? env.R2_PRIVATE_BUCKET
          : env.R2_PUBLIC_BUCKET,
      Key: record.file.objectKey,
      ResponseContentDisposition: `${previewAllowed ? "inline" : "attachment"}; filename="${(record.file.safeDownloadFilename ?? "download").replace(/["\\]/g, "_")}"`,
      ResponseContentType:
        record.file.mimeTypeDetected ?? "application/octet-stream",
    });
    const url = await getSignedUrl(getR2(), command, { expiresIn: 180 });
    await db.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: profile.accountKind,
      action: previewAllowed ? "file previewed" : "file downloaded",
      entityType: "file",
      entityId: record.file.id,
      applicationId: record.application?.id,
      metadataRedacted: {
        purpose: record.file.purpose,
        disposition: previewAllowed ? "inline" : "attachment",
      },
      requestId: crypto.randomUUID(),
    });
    return NextResponse.redirect(url, 302);
  } catch {
    return NextResponse.json(
      { message: "The secure download could not be prepared." },
      { status: 400 },
    );
  }
}
