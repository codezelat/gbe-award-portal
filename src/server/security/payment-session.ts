import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  applications,
  payments,
  profiles,
  uploadSessions,
} from "@/lib/db/schema";
import { publicEnv } from "@/lib/env";

export async function setPaymentSession(applicationId: string, token: string) {
  (await cookies()).set(`gbe_payment_${applicationId}`, token, {
    httpOnly: true,
    secure: new URL(publicEnv.NEXT_PUBLIC_APP_URL).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function requirePaymentSession(applicationId: string) {
  z.uuid().parse(applicationId);
  const token = (await cookies()).get(`gbe_payment_${applicationId}`)?.value;
  if (token) {
    const [row] = await getDb()
      .select({ application: applications, payment: payments })
      .from(uploadSessions)
      .innerJoin(
        applications,
        eq(applications.id, uploadSessions.applicationId),
      )
      .innerJoin(payments, eq(payments.applicationId, applications.id))
      .where(
        and(
          eq(applications.id, applicationId),
          eq(
            uploadSessions.publicTokenHash,
            createHash("sha256").update(token).digest("hex"),
          ),
          eq(uploadSessions.status, "completed"),
          gt(uploadSessions.expiresAt, new Date()),
          isNull(applications.deletedAt),
        ),
      )
      .limit(1);
    if (row?.payment.method) return row;
  }
  {
    const session = await getAuth().api.getSession({
      headers: await headers(),
    });
    if (session) {
      const [owned] = await getDb()
        .select({ application: applications, payment: payments })
        .from(applications)
        .innerJoin(payments, eq(payments.applicationId, applications.id))
        .innerJoin(profiles, eq(profiles.id, applications.ownerProfileId))
        .where(
          and(
            eq(applications.id, applicationId),
            eq(profiles.authUserId, session.user.id),
            eq(profiles.isActive, true),
            isNull(applications.deletedAt),
          ),
        )
        .limit(1);
      if (owned?.payment.method) return owned;
    }
  }
  throw new Error(
    "Your secure payment session has expired. Contact the GBE Awards team with your nomination reference.",
  );
}
