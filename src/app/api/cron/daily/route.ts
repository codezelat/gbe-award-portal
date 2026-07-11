import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  cleanupExpiredExports,
  cleanupRetention,
  cleanupStaleUploads,
} from "@/server/jobs/cleanup";
import { processEmailOutbox } from "@/server/jobs/email-outbox";
import { runTrackedJob } from "@/server/jobs/tracked-job";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  )
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });

  const jobs: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ["cleanup-uploads", cleanupStaleUploads],
    ["cleanup-exports", cleanupExpiredExports],
    ["cleanup-retention", cleanupRetention],
    ["email-outbox", () => processEmailOutbox(100)],
  ];
  const results: Record<string, unknown> = {};
  for (const [key, run] of jobs) {
    try {
      results[key] = await runTrackedJob(key, run);
    } catch (error) {
      results[key] = {
        ok: false,
        error: error instanceof Error ? error.message : "Job failed",
      };
    }
  }
  const failed = Object.values(results).some(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "ok" in value &&
      value.ok === false,
  );
  return NextResponse.json(
    { ok: !failed, jobs: results },
    { status: failed ? 500 : 200 },
  );
}
