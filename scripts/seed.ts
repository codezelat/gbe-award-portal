import "dotenv/config";
import { eq } from "drizzle-orm";
import { declarationText } from "../src/config/brand";
import { getDb } from "../src/lib/db";
import {
  awardCategories,
  awardCycles,
  cycleSequences,
} from "../src/lib/db/schema";
const opensAt = process.env.SEED_CYCLE_OPENS_AT;
const closesAt = process.env.SEED_CYCLE_CLOSES_AT;
if (!opensAt || !closesAt)
  throw new Error(
    "Set SEED_CYCLE_OPENS_AT and SEED_CYCLE_CLOSES_AT to approved ISO timestamps before seeding.",
  );
const db = getDb();
const [existing] = await db
  .select()
  .from(awardCycles)
  .where(eq(awardCycles.slug, "gbe-awards-2026"))
  .limit(1);
const [cycle] = existing
  ? [existing]
  : await db
      .insert(awardCycles)
      .values({
        name: "GBE Awards 2026",
        slug: "gbe-awards-2026",
        year: 2026,
        status: "draft",
        timezone: "Asia/Colombo",
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        supportEmail: "info@gbeaward.com",
        heading: "Global Business Excellence Awards 2026",
        introCopy:
          "Recognising outstanding businesses and visionaries across the world.",
        declarationText,
        declarationVersion: "2026-1",
        termsVersion: "2026-1",
        privacyVersion: "2026-1",
        formSchemaVersion: "2.0",
      })
      .returning();
await db
  .insert(cycleSequences)
  .values({ cycleId: cycle.id })
  .onConflictDoNothing();
const names = [
  "Business & Entrepreneurship",
  "Technology & Innovation",
  "Finance & Banking",
  "Healthcare & Wellness",
  "Marketing, Branding & Advertising",
  "Media & Broadcasting",
  "Education & Academia",
  "Corporate Excellence",
  "Retail & E-commerce",
  "Real Estate & Property Development",
  "Hospitality & Tourism",
  "Manufacturing & Industrial",
  "Digital Transformation",
  "Sustainability & ESG",
  "Social Impact & Community",
  "Women in Business Leadership",
];
for (const [index, name] of names.entries()) {
  const slug = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  await db
    .insert(awardCategories)
    .values({
      cycleId: cycle.id,
      code: `GBE26-${String(index + 1).padStart(2, "0")}`,
      name,
      slug,
      displayOrder: index,
      isActive: true,
    })
    .onConflictDoNothing();
}
console.log(
  `Seeded ${cycle.name} in draft status with ${names.length} categories. Review settings before opening.`,
);
