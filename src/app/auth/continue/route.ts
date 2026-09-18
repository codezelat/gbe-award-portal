import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { cookies } from "next/headers";
import { requireStaff } from "@/server/dal/auth";
import { ticketCheckInReturn } from "@/lib/domain/ticket-return";

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
  const ticketReturn = ticketCheckInReturn(
    (await cookies()).get("gbe_ticket_checkin_return")?.value,
  );
  if (ticketReturn && profile.accountKind === "staff") await requireStaff();
  const response = NextResponse.redirect(
    new URL(
      profile.accountKind === "staff" ? (ticketReturn ?? "/admin") : "/portal",
      origin,
    ),
  );
  response.cookies.delete("gbe_ticket_checkin_return");
  return response;
}
