import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { getDb } from "@/lib/db";
import { emailOutbox, invitations } from "@/lib/db/schema";
import { env, requireProvider } from "@/lib/env";
import { NominationReceivedEmail } from "@/emails/templates/nomination-received";
import { PortalNotificationEmail } from "@/emails/templates/portal-notification";
import { getFeatureFlags } from "@/server/services/feature-flags";
const templateDefaults: Record<
  string,
  { title: string; message: string; actionLabel?: string }
> = {
  password_reset: {
    title: "Reset your GBE Awards portal password",
    message:
      "Use the secure link below to choose a new password. If you did not request this, you can ignore this email.",
    actionLabel: "Reset password",
  },
  email_verification: {
    title: "Verify your GBE Awards portal email",
    message:
      "Use the secure link below to verify this email address before signing in.",
    actionLabel: "Verify email address",
  },
  applicant_invitation: {
    title: "Activate your GBE Awards portal access",
    message:
      "Your nomination has been approved for secure portal access. Activate your invitation before it expires.",
    actionLabel: "Activate portal access",
  },
  staff_invitation: {
    title: "GBE Awards staff invitation",
    message:
      "You have been invited to the administration portal. Multi-factor authentication is mandatory.",
    actionLabel: "Accept staff invitation",
  },
  application_changes_requested: {
    title: "Action required for your GBE Awards nomination",
    message:
      "The GBE Awards team needs additional information. Sign in to review the exact request and deadline.",
    actionLabel: "Review requested updates",
  },
  payment_verified: {
    title: "Payment proof verified",
    message:
      "Your payment evidence has been verified by the GBE Awards finance team.",
    actionLabel: "View payment status",
  },
  payment_rejected: {
    title: "Replacement payment proof required",
    message:
      "Your payment evidence could not be verified. Sign in to review the reason and upload a replacement.",
    actionLabel: "Review payment request",
  },
  account_security_change: {
    title: "Your GBE Awards account security changed",
    message: "A security change was made to your portal account.",
  },
};
export async function processEmailOutbox(limit = 25) {
  requireProvider("email");
  const db = getDb();
  const flags = await getFeatureFlags();
  await db
    .update(emailOutbox)
    .set({ status: "queued" })
    .where(
      and(
        eq(emailOutbox.status, "processing"),
        lte(emailOutbox.nextAttemptAt, new Date()),
      ),
    );
  const rows = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, "queued"),
        lte(emailOutbox.nextAttemptAt, new Date()),
      ),
    )
    .orderBy(asc(emailOutbox.nextAttemptAt))
    .limit(limit);
  const resend = new Resend(env.RESEND_API_KEY);
  let sent = 0;
  for (const item of rows) {
    const claimed = await db
      .update(emailOutbox)
      .set({
        status: "processing",
        attemptCount: item.attemptCount + 1,
        nextAttemptAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      .where(and(eq(emailOutbox.id, item.id), eq(emailOutbox.status, "queued")))
      .returning({ id: emailOutbox.id });
    if (!claimed.length) continue;
    if (
      !flags.outcome_visibility_enabled &&
      [
        "application_shortlisted",
        "application_winner",
        "application_not_selected",
      ].includes(item.templateKey)
    ) {
      await db
        .update(emailOutbox)
        .set({
          status: "queued",
          nextAttemptAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .where(eq(emailOutbox.id, item.id));
      continue;
    }
    try {
      const payload = item.payload as Record<string, string>;
      const defaults = templateDefaults[item.templateKey] ?? {
        title: payload.status
          ? `GBE Awards update: ${payload.status}`
          : "Update from GBE Awards",
        message: "There is an important update in your GBE Awards portal.",
        actionLabel: "Open secure portal",
      };
      const title = payload.title ?? defaults.title;
      const message = payload.message ?? defaults.message;
      const element =
        item.templateKey === "nomination_received" ? (
          <NominationReceivedEmail
            name={payload.nomineeName ?? "Applicant"}
            reference={payload.reference ?? ""}
          />
        ) : (
          <PortalNotificationEmail
            title={title}
            name={payload.name ?? "Applicant"}
            message={message}
            action={
              payload.url
                ? {
                    label: defaults.actionLabel ?? "Open secure portal",
                    url: payload.url,
                  }
                : undefined
            }
          />
        );
      const html = await render(element);
      const text = await render(element, { plainText: true });
      const result = await resend.emails.send(
        {
          from: env.EMAIL_FROM,
          to: item.recipientEmail,
          replyTo: env.EMAIL_REPLY_TO,
          subject: title,
          html,
          text,
          headers: { "X-Entity-Ref-ID": item.id },
        },
        { idempotencyKey: item.id },
      );
      if (result.error) throw new Error(result.error.message);
      await db
        .update(emailOutbox)
        .set({
          status: "sent",
          providerMessageId: result.data?.id,
          sentAt: new Date(),
          lastErrorCode: null,
          lastErrorSummary: null,
        })
        .where(eq(emailOutbox.id, item.id));
      if (
        ["applicant_invitation", "staff_invitation"].includes(item.templateKey)
      ) {
        const invitationId = item.idempotencyKey.split(":")[1];
        if (invitationId)
          await db
            .update(invitations)
            .set({
              status: "sent",
              sentAt: new Date(),
              sendCount: sql`${invitations.sendCount}+1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(invitations.id, invitationId),
                eq(invitations.status, "pending"),
              ),
            );
      }
      sent++;
    } catch (error) {
      const attempts = item.attemptCount + 1;
      await db
        .update(emailOutbox)
        .set({
          status: attempts >= 5 ? "failed" : "queued",
          nextAttemptAt: new Date(
            Date.now() + Math.min(3600, 60 * 2 ** attempts) * 1000,
          ),
          lastErrorCode: "SEND_FAILED",
          lastErrorSummary:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown email error",
        })
        .where(eq(emailOutbox.id, item.id));
    }
  }
  return { processed: rows.length, sent };
}
