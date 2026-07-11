import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cleanupRetention } from "@/server/jobs/cleanup";
import { runTrackedJob } from "@/server/jobs/tracked-job";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  )
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
  return NextResponse.json(
    await runTrackedJob("cleanup-retention", () => cleanupRetention()),
  );
}
