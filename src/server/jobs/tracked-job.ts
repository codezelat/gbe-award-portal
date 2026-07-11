import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";

export async function runTrackedJob<T extends Record<string, unknown>>(
  jobKey: string,
  task: () => Promise<T>,
) {
  const db = getDb();
  const [run] = await db
    .insert(jobRuns)
    .values({ jobKey, status: "running" })
    .returning({ id: jobRuns.id });
  try {
    const result = await task();
    await db
      .update(jobRuns)
      .set({ status: "succeeded", result, finishedAt: new Date() })
      .where(eq(jobRuns.id, run.id));
    return result;
  } catch (error) {
    await db
      .update(jobRuns)
      .set({
        status: "failed",
        errorSummary:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Unknown job failure",
        finishedAt: new Date(),
      })
      .where(eq(jobRuns.id, run.id));
    throw error;
  }
}
