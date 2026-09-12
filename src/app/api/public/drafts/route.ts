import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { nominationDrafts } from "@/lib/db/schema";
import {
  draftCredentialSchema,
  saveDraftSchema,
} from "@/lib/validation/nomination-draft";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requireFeatureFlag } from "@/server/services/feature-flags";
import {
  assertDraftCredential,
  DraftUnavailableError,
  confirmDraftFiles,
  draftFileRows,
  saveNominationDraft,
} from "@/server/services/nomination-drafts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const headers = await assertSameOrigin();
    const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const fingerprint = createHash("sha256").update(ip).digest("hex");
    await enforceRateLimit(`draft-ip:${fingerprint}`, 120, 3600);
    if (Number(request.headers.get("content-length") ?? 0) > 24000)
      throw new Error("The form is too large.");
    const text = await request.text();
    if (text.length > 24000) throw new Error("The form is too large.");
    const body = JSON.parse(text);
    const credential = draftCredentialSchema.parse(body.credential);
    await enforceRateLimit(`draft:${credential.id}`, 90, 3600);
    if (body.action === "resume") {
      const [row] = await getDb()
        .select()
        .from(nominationDrafts)
        .where(eq(nominationDrafts.id, credential.id));
      const draft = assertDraftCredential(row, credential);
      const linked = await draftFileRows(draft.id);
      return NextResponse.json(
        {
          ok: true,
          data: {
            cycleId: draft.cycleId,
            payload: draft.payload,
            step: draft.savedStep,
            version: draft.version,
            submitted: Boolean(draft.submittedAt),
            pendingFiles: linked.filter((row) => row.file.status !== "ready")
              .length,
            files: linked
              .filter((row) => row.file.status === "ready")
              .map(({ link, file }) => ({
                id: link.id,
                name: file.originalFilename,
                size: file.sizeBytes,
                type: file.mimeTypeClaimed,
                kind: link.kind,
              })),
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    await requireFeatureFlag("applications_enabled");
    if (body.action === "confirm") {
      await confirmDraftFiles(
        credential,
        z.number().int().nonnegative().parse(body.version),
      );
      return NextResponse.json({ ok: true });
    }
    const input = saveDraftSchema.parse(body);
    const data = await saveNominationDraft(input, ip);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof z.ZodError
            ? "Check the details in this step."
            : error instanceof Error && !("cause" in error)
              ? error.message
              : "Could not save this step. Please retry.",
      },
      {
        status: error instanceof DraftUnavailableError ? 404 : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
