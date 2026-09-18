import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { ticketCheckInReturn } from "@/lib/domain/ticket-return";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const protectedRoute =
    path.startsWith("/portal") || path.startsWith("/admin");
  if (
    protectedRoute &&
    !getSessionCookie(request, { cookiePrefix: "gbe_portal" })
  ) {
    const target = new URL("/login", request.url);
    target.searchParams.set("returnTo", path);
    const response = NextResponse.redirect(target);
    if (ticketCheckInReturn(path))
      response.cookies.set("gbe_ticket_checkin_return", path, {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 900,
      });
    return response;
  }
  return NextResponse.next();
}
export const config = { matcher: ["/portal/:path*", "/admin/:path*"] };
