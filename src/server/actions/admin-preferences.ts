"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { awardCycles } from "@/lib/db/schema";
import { requireStaff } from "@/server/dal/auth";

export async function setAdminCycleAction(formData: FormData) {
  await requireStaff();
  const cycleId = z.uuid().parse(formData.get("cycleId"));
  const [cycle] = await getDb()
    .select({ id: awardCycles.id })
    .from(awardCycles)
    .where(eq(awardCycles.id, cycleId))
    .limit(1);
  if (!cycle) throw new Error("Award cycle not found.");
  (await cookies()).set("gbe_admin_cycle", cycleId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 180,
  });
}
