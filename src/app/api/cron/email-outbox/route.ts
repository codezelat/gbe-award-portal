import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processEmailOutbox } from "@/server/jobs/email-outbox";
import { runTrackedJob } from "@/server/jobs/tracked-job";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  )
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
  return NextResponse.json(
    await runTrackedJob("email-outbox", () => processEmailOutbox()),
  );
}
