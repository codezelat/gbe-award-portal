import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getDb } from "@/lib/db";
import { emailOutbox, invitations } from "@/lib/db/schema";
import { env } from "@/lib/env";
export async function POST(request: Request) {
  try {
    if (!env.RESEND_WEBHOOK_SECRET)
      return NextResponse.json(
        { message: "Webhook not configured." },
        { status: 503 },
      );
    const payload = await request.text();
    const event = new Resend(env.RESEND_API_KEY).webhooks.verify({
      payload,
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
    });
    if (!event.type.startsWith("email."))
      return NextResponse.json({ ok: true });
    const data = event.data as { email_id?: string };
    if (!data.email_id) return NextResponse.json({ ok: true });
    const status =
      event.type === "email.delivered"
        ? "delivered"
        : event.type === "email.bounced"
          ? "bounced"
          : event.type === "email.failed" || event.type === "email.suppressed"
            ? "failed"
            : null;
    if (status) {
      const db = getDb();
      const updated = await db
        .update(emailOutbox)
        .set({
          status,
          lastErrorCode:
            status === "failed" || status === "bounced" ? event.type : null,
          lastErrorSummary:
            status === "failed" || status === "bounced"
              ? "Provider delivery event recorded"
              : null,
        })
        .where(eq(emailOutbox.providerMessageId, data.email_id))
        .returning({
          templateKey: emailOutbox.templateKey,
          idempotencyKey: emailOutbox.idempotencyKey,
        });
      const item = updated[0];
      if (
        item &&
        ["failed", "bounced"].includes(status) &&
        ["applicant_invitation", "staff_invitation"].includes(item.templateKey)
      ) {
        const invitationId = item.idempotencyKey.split(":")[1];
        if (invitationId)
          await db
            .update(invitations)
            .set({
              status: "failed",
              lastError: event.type,
              updatedAt: new Date(),
            })
            .where(eq(invitations.id, invitationId));
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "Invalid webhook signature." },
      { status: 400 },
    );
  }
}
