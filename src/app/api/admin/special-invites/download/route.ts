import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { specialInvites } from "@/lib/db/schema";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { decryptInviteCode } from "@/server/security/special-invite-code";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const { profile, membership } = await requireStaff();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!hasPermission(membership, "configuration.manage"))
    return NextResponse.json(
      { message: "Access denied." },
      { status: 403, headers },
    );
  try {
    await enforceRateLimit(`invite-download:${profile.id}`, 60, 3600);
    const params = new URL(request.url).searchParams;
    const id = z
      .uuid()
      .optional()
      .parse(params.get("id") ?? undefined);
    const batch = z
      .uuid()
      .optional()
      .parse(params.get("batch") ?? undefined);
    if (Boolean(id) === Boolean(batch))
      throw new Error("Choose an invite or batch.");
    const db = getDb();
    const rows = await db
      .select({
        id: specialInvites.id,
        encrypted: specialInvites.codeEncrypted,
      })
      .from(specialInvites)
      .where(
        and(
          id ? eq(specialInvites.id, id) : eq(specialInvites.batchId, batch!),
          isNull(specialInvites.draftId),
          isNull(specialInvites.revokedAt),
        ),
      )
      .limit(100);
    if (!rows.length)
      return NextResponse.json(
        { message: "No unused invites are available to download." },
        { status: 409, headers },
      );
    const { specialInviteJpeg, specialInviteZip } =
      await import("@/server/services/special-invite-images");
    const images = [];
    for (const row of rows) {
      const code = decryptInviteCode(row.encrypted);
      images.push({ id: row.id, code, bytes: await specialInviteJpeg(code) });
    }
    // A claim while images were rendering must not leak into a fresh download.
    const available = await db
      .select({ id: specialInvites.id })
      .from(specialInvites)
      .where(
        and(
          inArray(
            specialInvites.id,
            rows.map((row) => row.id),
          ),
          isNull(specialInvites.draftId),
          isNull(specialInvites.revokedAt),
        ),
      );
    const ids = new Set(available.map((row) => row.id));
    const current = images.filter((item) => ids.has(item.id));
    if (!current.length)
      return NextResponse.json(
        { message: "These invites were just claimed. Refresh the list." },
        { status: 409, headers },
      );
    const bytes = id ? current[0].bytes : specialInviteZip(current);
    if (bytes.length > 4_000_000) throw new Error("Download too large.");
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type": id ? "image/jpeg" : "application/zip",
        "Content-Disposition": `attachment; filename="${id ? `GBE-${current[0].code}.jpg` : "GBE-special-invites.zip"}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Could not download these invites. Please retry shortly." },
      { status: 400, headers },
    );
  }
}
