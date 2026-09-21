import "server-only";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getR2 } from "@/lib/r2/client";
import { ticketEmailSnapshotKey } from "@/server/services/ticket-email-snapshot";

export async function cleanupTicketEmailSnapshots() {
  const db = getDb();
  const rows = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.templateKey, "guest_tickets"),
        inArray(emailOutbox.status, [
          "sent",
          "delivered",
          "bounced",
          "failed",
          "cancelled",
        ]),
        lt(emailOutbox.createdAt, new Date(Date.now() - 30 * 86400000)),
        sql`${emailOutbox.payload}->>'ticketDeliveryVersion' = 'attachment-v1'`,
        sql`coalesce(${emailOutbox.payload}->>'ticketEmailSnapshot', '') <> 'removed'`,
      ),
    )
    .limit(100);
  if (!rows.length) return { removed: 0 };
  const r2 = getR2();
  let removed = 0;
  for (const row of rows) {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.id, row.id))
        .for("update");
      if (
        !current ||
        ["queued", "processing"].includes(current.status) ||
        (current.payload as Record<string, string>).ticketEmailSnapshot ===
          "removed"
      )
        return;
      await r2.send(
        new DeleteObjectCommand({
          Bucket: env.R2_PRIVATE_BUCKET,
          Key: ticketEmailSnapshotKey(row.id),
        }),
      );
      await tx
        .update(emailOutbox)
        .set({
          payload: sql`${emailOutbox.payload} || '{"ticketEmailSnapshot":"removed"}'::jsonb`,
        })
        .where(eq(emailOutbox.id, row.id));
      removed++;
    });
  }
  return { removed };
}
