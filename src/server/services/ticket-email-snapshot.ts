import "server-only";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { env } from "@/lib/env";
import { getR2, r2ObjectKey } from "@/lib/r2/client";

// Freeze the entire provider request. PDF font subsetting is nondeterministic;
// Resend requires identical payloads for idempotent retries.
const messageSchema = z.object({
  from: z.string(),
  to: z.string(),
  replyTo: z.string(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  headers: z.object({ "X-Entity-Ref-ID": z.uuid() }),
  attachments: z.tuple([
    z.object({
      filename: z.string(),
      content: z.string(),
      contentType: z.literal("application/pdf"),
    }),
  ]),
});
export type TicketEmailMessage = z.infer<typeof messageSchema>;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export function ticketEmailSnapshotKey(id: string) {
  return r2ObjectKey(`ticket-email-snapshots/v1/${z.uuid().parse(id)}.json`);
}

function statusCode(error: unknown) {
  return error && typeof error === "object" && "$metadata" in error
    ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
    : undefined;
}

function validateMessage(value: unknown, id: string) {
  const message = messageSchema.parse(value);
  if (
    message.headers["X-Entity-Ref-ID"] !== id ||
    !Buffer.from(message.attachments[0].content, "base64")
      .subarray(0, 5)
      .equals(Buffer.from("%PDF-"))
  )
    throw new Error("Invalid ticket email snapshot.");
  return message;
}

export async function getTicketEmailSnapshot(
  id: string,
  required: boolean,
  create: () => Promise<TicketEmailMessage>,
) {
  const r2 = getR2();
  const location = {
    Bucket: env.R2_PRIVATE_BUCKET,
    Key: ticketEmailSnapshotKey(id),
  };
  const read = async () => {
    try {
      const result = await r2.send(new GetObjectCommand(location));
      if (
        !result.Body ||
        (result.ContentLength ?? Infinity) > MAX_SNAPSHOT_BYTES
      )
        throw new Error("Invalid ticket email snapshot size.");
      const bytes = await result.Body.transformToByteArray();
      if (bytes.length > MAX_SNAPSHOT_BYTES)
        throw new Error("Invalid ticket email snapshot size.");
      return validateMessage(JSON.parse(Buffer.from(bytes).toString()), id);
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  };
  try {
    const saved = await read();
    if (saved) return saved;
    // Never regenerate an attachment after a send might have been accepted.
    if (required) throw new Error("A saved ticket email is unavailable.");
    const message = validateMessage(await create(), id);
    const body = Buffer.from(JSON.stringify(message));
    if (body.length > MAX_SNAPSHOT_BYTES)
      throw new Error("Ticket email exceeds the attachment limit.");
    try {
      await r2.send(
        new PutObjectCommand({
          ...location,
          Body: body,
          ContentType: "application/json",
          CacheControl: "private, no-store",
          IfNoneMatch: "*",
        }),
      );
      return message;
    } catch (error) {
      if (![409, 412].includes(statusCode(error) ?? 0)) throw error;
      const winner = await read();
      if (winner) return winner;
      throw error;
    }
  } catch {
    // Provider/validation errors may contain private request content.
    throw new Error(
      "Ticket email attachment could not be prepared. Retry later.",
    );
  }
}
