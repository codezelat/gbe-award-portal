import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
const send = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { R2_PRIVATE_BUCKET: "test-private" } }));
vi.mock("@/lib/r2/client", () => ({
  getR2: () => ({ send }),
  r2ObjectKey: (key: string) => `e2e/test/${key}`,
}));
const { getTicketEmailSnapshot } =
  await import("../../src/server/services/ticket-email-snapshot");
const id = "75699fba-f0ee-491e-afd8-e44be56ab8ee";
const message = () => ({
  from: "GBE Test <test@example.test>",
  to: "guest@example.test",
  replyTo: "test@example.test",
  subject: "Tickets",
  html: "<p>Tickets</p>",
  text: "Tickets",
  headers: { "X-Entity-Ref-ID": id },
  attachments: [
    {
      filename: "tickets.pdf",
      content: Buffer.from("%PDF-1.7 test").toString("base64"),
      contentType: "application/pdf" as const,
    },
  ] as [{ filename: string; content: string; contentType: "application/pdf" }],
});
const bodyResponse = (data: unknown) => {
  const bytes = Buffer.from(JSON.stringify(data));
  return {
    ContentLength: bytes.length,
    Body: { transformToByteArray: async () => bytes },
  };
};
beforeEach(() => {
  send.mockReset();
});
describe("private ticket email snapshots", () => {
  it("stores PDF bytes privately before delivery with a conditional create", async () => {
    send
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
      .mockResolvedValueOnce({});
    const factory = vi.fn(async () => message());
    expect(await getTicketEmailSnapshot(id, false, factory)).toEqual(message());
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    const put = send.mock.calls[1][0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({
      Bucket: "test-private",
      IfNoneMatch: "*",
      CacheControl: "private, no-store",
    });
    expect(put.input.Key).toBe(`e2e/test/ticket-email-snapshots/v1/${id}.json`);
  });
  it("loads saved bytes without rendering or overwriting", async () => {
    send.mockResolvedValue(bodyResponse(message()));
    const factory = vi.fn(async () => message());
    expect(await getTicketEmailSnapshot(id, true, factory)).toEqual(message());
    expect(factory).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([409, 412])(
    "uses the winning snapshot after a concurrent create (%s)",
    async (code) => {
      const winner = { ...message(), text: "First frozen message" };
      send
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: code } })
        .mockResolvedValueOnce(bodyResponse(winner));
      expect(
        await getTicketEmailSnapshot(id, false, async () => message()),
      ).toEqual(winner);
    },
  );
  it("fails closed if an already-used snapshot is missing", async () => {
    send.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    const factory = vi.fn(async () => message());
    await expect(getTicketEmailSnapshot(id, true, factory)).rejects.toThrow(
      "could not be prepared",
    );
    expect(factory).not.toHaveBeenCalled();
  });
  it("rejects another email's snapshot and hides sensitive provider errors", async () => {
    send.mockResolvedValueOnce(
      bodyResponse({
        ...message(),
        headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
      }),
    );
    await expect(
      getTicketEmailSnapshot(id, true, async () => message()),
    ).rejects.toThrow("could not be prepared");
    send.mockRejectedValueOnce(
      new Error("https://private.example.test/?token=SECRET"),
    );
    await expect(
      getTicketEmailSnapshot(id, false, async () => message()),
    ).rejects.toThrow(
      "Ticket email attachment could not be prepared. Retry later.",
    );
  });
  it("rejects oversize snapshots before reading their body", async () => {
    const read = vi.fn();
    send.mockResolvedValueOnce({
      ContentLength: 9 * 1024 * 1024,
      Body: { transformToByteArray: read },
    });
    await expect(
      getTicketEmailSnapshot(id, false, async () => message()),
    ).rejects.toThrow("could not be prepared");
    expect(read).not.toHaveBeenCalled();
  });
});
