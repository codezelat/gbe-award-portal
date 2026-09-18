import { NextResponse } from "next/server";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import {
  setTicketSession,
  validTicketAccessToken,
} from "@/server/security/ticket-session";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = z.uuid().safeParse((await context.params).id);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!id.success || !validTicketAccessToken(id.data, token))
    return new Response("This ticket link is not valid.", { status: 403 });
  await setTicketSession(id.data, token);
  return NextResponse.redirect(
    new URL(`/tickets/booking/${id.data}`, publicEnv.NEXT_PUBLIC_APP_URL),
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
