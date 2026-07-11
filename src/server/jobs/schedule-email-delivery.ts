import "server-only";
import { after } from "next/server";
import { env } from "@/lib/env";
import { processEmailOutbox } from "@/server/jobs/email-outbox";

export function scheduleEmailOutboxProcessing() {
  if (!env.RESEND_API_KEY) return;
  after(async () => {
    try {
      await processEmailOutbox();
    } catch {
      // The durable queue and daily fallback retain the message for retry.
    }
  });
}
