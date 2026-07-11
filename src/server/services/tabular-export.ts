import "server-only";
import { createHash } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLogs, exportsTable, files } from "@/lib/db/schema";
import { getR2 } from "@/lib/r2/client";
import { env } from "@/lib/env";
import { exportFilename } from "@/server/services/export-service";
import { buildTabularArtifact } from "@/lib/export/tabular-artifact";

export async function createTabularExport(input: {
  requestedBy: string;
  reportKey: string;
  format: "xlsx" | "csv";
  headings: string[];
  rows: unknown[][];
  querySnapshot: Record<string, unknown>;
}) {
  const db = getDb();
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify([
        input.requestedBy,
        input.reportKey,
        input.format,
        input.querySnapshot,
        Math.floor(Date.now() / 60000),
      ]),
    )
    .digest("hex");
  const [claimed] = await db
    .insert(exportsTable)
    .values({
      requestedBy: input.requestedBy,
      format: input.format,
      reportKey: input.reportKey,
      querySnapshot: input.querySnapshot,
      idempotencyKey,
      status: "processing",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing({ target: exportsTable.idempotencyKey })
    .returning({ id: exportsTable.id });
  if (!claimed) {
    const [existing] = await db
      .select({ id: exportsTable.id, status: exportsTable.status })
      .from(exportsTable)
      .where(
        and(
          eq(exportsTable.idempotencyKey, idempotencyKey),
          gt(exportsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (existing?.status === "ready") return existing.id;
    throw new Error(
      "An identical export is already being generated. Refresh the exports page shortly.",
    );
  }
  const { body, mime, rowCount } = await buildTabularArtifact({
    format: input.format,
    sheetName: input.reportKey,
    headings: input.headings,
    rows: input.rows,
  });
  const filename = exportFilename(input.reportKey, input.format);
  const objectKey = `exports/${input.requestedBy}/${crypto.randomUUID()}/${filename}`;
  const r2 = getR2();
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: env.R2_PRIVATE_BUCKET,
        Key: objectKey,
        Body: body,
        ContentType: mime,
        ContentDisposition: `attachment; filename="${filename}"`,
      }),
    );
    return await db.transaction(async (tx) => {
      const [file] = await tx
        .insert(files)
        .values({
          bucket: "private",
          objectKey,
          purpose: "export",
          status: "ready",
          safeDownloadFilename: filename,
          mimeTypeClaimed: mime,
          mimeTypeDetected: mime,
          sizeBytes: body.byteLength,
          createdByProfileId: input.requestedBy,
          validatedAt: new Date(),
        })
        .returning({ id: files.id });
      await tx
        .update(exportsTable)
        .set({
          status: "ready",
          fileId: file.id,
          rowCount,
          completedAt: new Date(),
        })
        .where(eq(exportsTable.id, claimed.id));
      await tx.insert(auditLogs).values({
        actorProfileId: input.requestedBy,
        actorType: "staff",
        action: "export created",
        entityType: "export",
        entityId: claimed.id,
        metadataRedacted: {
          format: input.format,
          rowCount,
          reportKey: input.reportKey,
        },
        requestId: crypto.randomUUID(),
      });
      return claimed.id;
    });
  } catch (error) {
    await r2
      .send(
        new DeleteObjectCommand({
          Bucket: env.R2_PRIVATE_BUCKET,
          Key: objectKey,
        }),
      )
      .catch(() => undefined);
    await db
      .update(exportsTable)
      .set({
        status: "failed",
        errorSummary:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Export generation failed",
        completedAt: new Date(),
      })
      .where(eq(exportsTable.id, claimed.id));
    throw error;
  }
}
