import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
export const runtime = "nodejs";
async function handler(request: Request) {
  try {
    scheduleEmailOutboxProcessing();
    return getAuth().handler(request);
  } catch {
    return NextResponse.json(
      { message: "Authentication is not configured." },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST };
