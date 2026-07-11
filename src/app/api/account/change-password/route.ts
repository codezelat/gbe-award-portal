import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { auditLogs, emailOutbox, profiles } from "@/lib/db/schema";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return NextResponse.json(
        { ok: false, message: "Sign in required." },
        { status: 401 },
      );
    const input = schema.parse(await request.json());
    await enforceRateLimit(`password-change:${session.user.id}`, 5, 3600);
    await auth.api.changePassword({
      headers: request.headers,
      body: { ...input, revokeOtherSessions: true },
    });
    const db = getDb();
    const [profile] = await db
      .select({ id: profiles.id, accountKind: profiles.accountKind })
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (profile)
      await db.transaction(async (tx) => {
        await tx
          .insert(emailOutbox)
          .values({
            templateKey: "account_security_change",
            recipientEmail: session.user.email,
            recipientProfileId: profile.id,
            payload: {
              name: session.user.name,
              title: "Your GBE Awards password was changed",
              message:
                "Your portal password was changed and other active sessions were revoked. If you did not make this change, contact info@gbeaward.com immediately.",
            },
            idempotencyKey: `account_security_change:${session.user.id}:${crypto.randomUUID()}`,
          });
        await tx
          .insert(auditLogs)
          .values({
            actorProfileId: profile.id,
            actorType: profile.accountKind,
            action: "password changed",
            entityType: "profile",
            entityId: profile.id,
            metadataRedacted: { otherSessionsRevoked: true },
            requestId: crypto.randomUUID(),
          });
      });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "The current password was not accepted or the new password is invalid.",
      },
      { status: 400 },
    );
  }
}
