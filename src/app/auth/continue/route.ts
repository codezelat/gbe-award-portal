import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const origin = new URL(request.url).origin;
  if (!session) return NextResponse.redirect(new URL("/login", origin));
  const [profile] = await getDb()
    .select({ accountKind: profiles.accountKind, isActive: profiles.isActive })
    .from(profiles)
    .where(eq(profiles.authUserId, session.user.id))
    .limit(1);
  if (!profile?.isActive)
    return NextResponse.redirect(new URL("/login?reason=inactive", origin));
  return NextResponse.redirect(
    new URL(profile.accountKind === "staff" ? "/admin" : "/portal", origin),
  );
}
