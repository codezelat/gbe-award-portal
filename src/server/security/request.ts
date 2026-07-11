import "server-only";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";

export async function assertSameOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const expected = new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;
  if (!origin || origin !== expected)
    throw new Error(
      "This request did not come from an approved portal origin.",
    );
  return requestHeaders;
}
