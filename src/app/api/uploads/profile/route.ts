import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { auditLogs, files, profiles } from "@/lib/db/schema";
import { assertSameOrigin } from "@/server/security/request";
export async function DELETE(request: Request) {
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
    const db = getDb();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (!profile?.profileImageFileId) return NextResponse.json({ ok: true });
    const previous = profile.profileImageFileId;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({ status: "superseded", updatedAt: now })
        .where(
          and(
            eq(files.createdByProfileId, profile.id),
            inArray(files.purpose, ["profile_512", "profile_96"]),
            eq(files.status, "ready"),
          ),
        );
      await tx
        .update(profiles)
        .set({ profileImageFileId: null, updatedAt: now })
        .where(eq(profiles.id, profile.id));
      await tx.insert(auditLogs).values({
        actorProfileId: profile.id,
        actorType: profile.accountKind,
        action: "profile image removed",
        entityType: "profile",
        entityId: profile.id,
        beforeRedacted: { profileImageFileId: previous },
        afterRedacted: { profileImageFileId: null },
        metadataRedacted: {},
        requestId: crypto.randomUUID(),
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "The profile image could not be removed." },
      { status: 400 },
    );
  }
}
