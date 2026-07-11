import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { awardCategories, awardCycles } from "@/lib/db/schema";

export async function getOpenCycleCategories() {
  if (!process.env.DATABASE_URL)
    return { categories: [], cycle: null, unavailable: true };
  const rows = await getDb()
    .select({
      id: awardCategories.id,
      name: awardCategories.name,
      cycleId: awardCycles.id,
      heading: awardCycles.heading,
      introCopy: awardCycles.introCopy,
      supportEmail: awardCycles.supportEmail,
    })
    .from(awardCategories)
    .innerJoin(awardCycles, eq(awardCategories.cycleId, awardCycles.id))
    .where(
      and(eq(awardCycles.status, "open"), eq(awardCategories.isActive, true)),
    )
    .orderBy(asc(awardCategories.displayOrder));
  const first = rows[0];
  return {
    categories: rows.map(({ id, name }) => ({ id, name })),
    cycle: first
      ? {
          id: first.cycleId,
          heading: first.heading,
          introCopy: first.introCopy,
          supportEmail: first.supportEmail,
        }
      : null,
    unavailable: rows.length === 0,
  };
}
