import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "@/lib/db";
import { emailOutbox, invitations } from "@/lib/db/schema";
import { env, requireProvider } from "@/lib/env";
import { getFeatureFlags } from "@/server/services/feature-flags";
import { getEmailTemplateCopies } from "@/server/services/email-template-service";

function htmlToPlainText(html: string) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character]!,
  );
}

function renderEmail({
  title,
  content,
  action,
}: {
  title: string;
  content: string;
  action?: { label: string; url: string };
}) {
  const actionMarkup = action
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;border-radius:12px;background:#171713;color:#fffdf8;padding:14px 22px;font-weight:600;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="en-GB"><body style="margin:0;background:#f8f6f1;color:#171713;font-family:Arial,sans-serif;padding:32px 12px"><main style="max-width:600px;margin:auto;overflow:hidden;border:1px solid #e8e5dd;border-radius:18px;background:#fffdf8"><header style="padding:28px 36px 18px;border-bottom:1px solid #e8e5dd"><p style="margin:0;color:#9b6d20;font-size:12px;font-weight:700;letter-spacing:.16em">GBE AWARDS · 2026 PORTAL</p><h1 style="margin:14px 0 0;font-family:Georgia,serif;font-size:34px;line-height:1.1">${escapeHtml(title)}</h1></header><section style="padding:28px 36px;font-size:16px;line-height:1.7">${content}${actionMarkup}<hr style="margin:30px 0 20px;border:0;border-top:1px solid #e8e5dd"><p style="margin:0;color:#747168;font-size:13px;line-height:1.6">Global Business Excellence Awards · Need help? Reply to this email or contact info@gbeaward.com.</p></section></main></body></html>`;
}
export async function processEmailOutbox(limit = 25) {
  requireProvider("email");
  const db = getDb();
  const flags = await getFeatureFlags();
  const templateDefaults = await getEmailTemplateCopies();
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
      const html =
        item.templateKey === "nomination_received"
          ? renderEmail({
              title: "Nomination received",
              content: `<p>Dear ${escapeHtml(payload.nomineeName ?? "Applicant")},</p><p>Thank you. Your nomination has been received and is now in the GBE Awards administrative review queue.</p><p style="border-radius:10px;background:#f4ecd8;padding:14px 18px;font-family:monospace;font-size:18px;font-weight:700">${escapeHtml(payload.reference ?? "")}</p><p>No portal account has been created at this stage. If the nomination is approved, we will send a secure invitation separately.</p>`,
            })
          : renderEmail({
              title,
              content: `<p>Dear ${escapeHtml(payload.name ?? "Applicant")},</p><p>${escapeHtml(message)}</p>`,
              action: payload.url
                ? {
                    label: defaults.actionLabel ?? "Open secure portal",
                    url: payload.url,
                  }
                : undefined,
            });
      const text = htmlToPlainText(html);
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
