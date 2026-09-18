import { z } from "zod";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { buildGuestTicketPdf } from "@/server/services/ticket-document";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "payments.view"))
    return new Response("Forbidden", { status: 403 });
  try {
    const id = z.uuid().parse((await context.params).id);
    await enforceRateLimit(`ticket-admin-download:${profile.id}`, 30, 900);
    return new Response(new Uint8Array(await buildGuestTicketPdf(id)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=guest-tickets.pdf",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json(
      { message: "Tickets could not be downloaded. Refresh and retry." },
      { status: 400 },
    );
  }
}
