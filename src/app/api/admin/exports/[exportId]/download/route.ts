import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { auditLogs, exportsTable, files, profiles } from "@/lib/db/schema";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/server/security/rate-limit";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session)
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const [profile] = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, session.user.id))
    .limit(1);
  if (!profile)
    return NextResponse.json({ message: "Access denied." }, { status: 403 });
  await enforceRateLimit(`export-download:${profile.id}`, 60, 3600);
  const { exportId } = await params;
  const [row] = await getDb()
    .select({ export: exportsTable, file: files })
    .from(exportsTable)
    .innerJoin(files, eq(exportsTable.fileId, files.id))
    .where(
      and(
        eq(exportsTable.id, exportId),
        eq(exportsTable.requestedBy, profile.id),
        eq(exportsTable.status, "ready"),
      ),
    )
    .limit(1);
  if (!row || row.export.expiresAt < new Date())
    return NextResponse.json(
      { message: "This export has expired or is unavailable." },
      { status: 410 },
    );
  const url = await getSignedUrl(
    getR2(),
    new GetObjectCommand({
      Bucket: env.R2_PRIVATE_BUCKET,
      Key: row.file.objectKey,
      ResponseContentDisposition: `attachment; filename="${row.file.safeDownloadFilename}"`,
    }),
    { expiresIn: 180 },
  );
  await getDb().insert(auditLogs).values({
    actorProfileId: profile.id,
    actorType: "staff",
    action: "export downloaded",
    entityType: "export",
    entityId: row.export.id,
    metadataRedacted: {},
    requestId: crypto.randomUUID(),
  });
  return NextResponse.redirect(url, 302);
}
