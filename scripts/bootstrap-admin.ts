import "dotenv/config";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import {
  auditLogs,
  profiles,
  staffMemberships,
  user,
} from "../src/lib/db/schema";

const input = z
  .object({
    BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2),
    BOOTSTRAP_ADMIN_EMAIL: z.email().transform((value) => value.toLowerCase()),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(16).max(128),
  })
  .parse(process.env);
const db = getDb();
const [existing] = await db
  .select({ value: count() })
  .from(staffMemberships)
  .where(eq(staffMemberships.role, "super_admin"));
if (existing.value)
  throw new Error(
    "A super administrator already exists. Use the staff administration page instead.",
  );
const created = await getAuth().api.createUser({
  body: {
    name: input.BOOTSTRAP_ADMIN_NAME,
    email: input.BOOTSTRAP_ADMIN_EMAIL,
    password: input.BOOTSTRAP_ADMIN_PASSWORD,
    role: "admin",
  },
});
if (!created.user?.id)
  throw new Error("The bootstrap identity could not be created.");
try {
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, created.user.id));
    const [profile] = await tx
      .insert(profiles)
      .values({
        authUserId: created.user.id,
        accountKind: "staff",
        displayName: input.BOOTSTRAP_ADMIN_NAME,
        officialName: input.BOOTSTRAP_ADMIN_NAME,
        isActive: true,
      })
      .returning({ id: profiles.id });
    await tx.insert(staffMemberships).values({
      profileId: profile.id,
      role: "super_admin",
      canViewAllApplications: true,
      mfaRequired: true,
      createdBy: profile.id,
    });
    await tx.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "staff",
      action: "initial super administrator bootstrapped",
      entityType: "profile",
      entityId: profile.id,
      metadataRedacted: {},
      requestId: crypto.randomUUID(),
    });
  });
} catch (error) {
  await db.delete(user).where(eq(user.id, created.user.id));
  throw error;
}
console.log(
  "Initial super administrator created. Sign in and enrol MFA immediately; then remove BOOTSTRAP_ADMIN_* values.",
);
