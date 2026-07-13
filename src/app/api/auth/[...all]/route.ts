import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
export const runtime = "nodejs";
async function handler(request: Request) {
  try {
    scheduleEmailOutboxProcessing();
    const auth = getAuth();
    if (
      request.method === "POST" &&
      new URL(request.url).pathname.endsWith("/two-factor/enable")
    ) {
      const session = await auth.api.getSession({ headers: request.headers });
      const [profile] = session
        ? await getDb()
            .select({ accountKind: profiles.accountKind })
            .from(profiles)
            .where(eq(profiles.authUserId, session.user.id))
            .limit(1)
        : [];
      if (profile?.accountKind !== "staff")
        return NextResponse.json(
          { message: "Two-factor authentication is available to staff only." },
          { status: 403 },
        );
    }
    return auth.handler(request);
  } catch {
    return NextResponse.json(
      { message: "Authentication is not configured." },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST };
