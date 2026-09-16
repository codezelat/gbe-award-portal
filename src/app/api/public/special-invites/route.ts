import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requireFeatureFlag } from "@/server/services/feature-flags";
import {
  claimInviteSchema,
  claimSpecialInvite,
  SpecialInviteError,
} from "@/server/services/special-invites";
import { DraftUnavailableError } from "@/server/services/nomination-drafts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const source = await assertSameOrigin();
    const ip = source.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const fingerprint = createHash("sha256").update(ip).digest("hex");
    try {
      await enforceRateLimit(`invite-ip:${fingerprint}`, 20, 900);
    } catch {
      return NextResponse.json(
        { ok: false, message: "Too many attempts. Try again in 15 minutes." },
        { status: 429, headers },
      );
    }
    await requireFeatureFlag("applications_enabled");
    if (Number(request.headers.get("content-length") ?? 0) > 2048)
      throw new SpecialInviteError("The request is too large.");
    const body = await request.text();
    if (body.length > 2048)
      throw new SpecialInviteError("The request is too large.");
    const input = claimInviteSchema.parse(JSON.parse(body));
    try {
      await enforceRateLimit(`invite-draft:${input.credential.id}`, 5, 900);
    } catch {
      return NextResponse.json(
        { ok: false, message: "Too many attempts. Try again in 15 minutes." },
        { status: 429, headers },
      );
    }
    const pricing = await claimSpecialInvite(input.credential, input.code);
    return NextResponse.json({ ok: true, pricing }, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof SpecialInviteError ||
          error instanceof DraftUnavailableError
            ? error.message
            : error instanceof z.ZodError
              ? "Enter a six-character invite code."
              : "Could not apply your invite. Please try again.",
      },
      { status: 400, headers },
    );
  }
}
