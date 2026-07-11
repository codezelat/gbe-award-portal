import { z } from "zod";
import { NextResponse } from "next/server";
import { GET as generateApplicationExport } from "./applications/route";
import { assertSameOrigin } from "@/server/security/request";

const requestSchema = z.object({
  format: z.enum(["xlsx", "csv"]).default("xlsx"),
  report: z.literal("applications").default("applications"),
  filters: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .default({}),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const input = requestSchema.parse(await request.json());
    const target = new URL("/api/admin/exports/applications", request.url);
    target.searchParams.set("format", input.format);
    for (const [key, value] of Object.entries(input.filters))
      for (const item of Array.isArray(value) ? value : [value])
        target.searchParams.append(key, item);
    return generateApplicationExport(
      new Request(target, { headers: request.headers }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The export request is invalid.",
      },
      { status: 400 },
    );
  }
}
