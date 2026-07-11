import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
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
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/portal/:path*", "/admin/:path*"] };
