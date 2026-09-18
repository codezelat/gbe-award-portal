import "server-only";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  isNotNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import {
  applications,
  awardCategories,
  nominationDrafts,
} from "@/lib/db/schema";
import { pendingCardPayment } from "./application-visibility";

export async function getInProgress({
  cycleId,
  search,
  page = 1,
}: {
  cycleId?: string;
  search?: string;
  page?: number;
}) {
  const db = getDb();
  const drafts = db
    .select({
      id: nominationDrafts.id,
      source: sql<string>`'draft'`.as("source"),
      nomineeName: sql<string>`${nominationDrafts.payload}->>'nomineeName'`.as(
        "nominee_name",
      ),
      email: sql<string | null>`${nominationDrafts.payload}->>'email'`.as(
        "email",
      ),
      phone: sql<string | null>`${nominationDrafts.payload}->>'phone'`.as(
        "phone",
      ),
      nomination: sql<
        string | null
      >`${nominationDrafts.payload}->>'awardNomination'`.as("nomination"),
      category: sql<string | null>`${awardCategories.name}`.as("category"),
      step: sql<number>`${nominationDrafts.savedStep}`.as("step"),
      updatedAt: nominationDrafts.updatedAt,
    })
    .from(nominationDrafts)
    .leftJoin(
      awardCategories,
      sql`${awardCategories.id}::text = ${nominationDrafts.payload}->>'categoryId'`,
    )
    .where(
      and(
        isNull(nominationDrafts.deletedAt),
        isNull(nominationDrafts.submittedAt),
        cycleId ? eq(nominationDrafts.cycleId, cycleId) : undefined,
      ),
    );
  const legacy = db
    .select({
      id: applications.id,
      source: sql<string>`'upload'`,
      nomineeName: applications.nomineeName,
      email: applications.emailDisplay,
      phone: applications.phoneDisplay,
      nomination: applications.awardNomination,
      category: applications.categoryNameSnapshot,
      step: sql<number>`3`,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .where(
      and(
        isNull(applications.deletedAt),
        isNull(applications.submittedAt),
        eq(applications.workflowStatus, "uploading"),
        cycleId ? eq(applications.cycleId, cycleId) : undefined,
        notExists(
          db
            .select({ id: nominationDrafts.id })
            .from(nominationDrafts)
            .where(eq(nominationDrafts.applicationId, applications.id)),
        ),
      ),
    );
  const awaitingCard = db
    .select({
      id: applications.id,
      source: sql<string>`'card'`,
      nomineeName: applications.nomineeName,
      email: applications.emailDisplay,
      phone: applications.phoneDisplay,
      nomination: applications.awardNomination,
      category: applications.categoryNameSnapshot,
      step: sql<number>`3`,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .where(
      and(
        isNull(applications.deletedAt),
        isNotNull(applications.submittedAt),
        pendingCardPayment(),
        cycleId ? eq(applications.cycleId, cycleId) : undefined,
      ),
    );
  const all = unionAll(drafts, legacy, awaitingCard).as("in_progress");
  const phoneDigits =
    search && /^[+\d\s().-]+$/.test(search)
      ? search.replace(/\D/g, "").replace(/^0+/, "")
      : "";
  const where = search
    ? or(
        ilike(all.nomineeName, `%${search}%`),
        ilike(all.email, `%${search}%`),
        ilike(all.nomination, `%${search}%`),
        ilike(all.category, `%${search}%`),
        ilike(all.phone, `%${search}%`),
        phoneDigits.length >= 3
          ? sql`regexp_replace(${all.phone}, '[^0-9]', '', 'g') like ${`%${phoneDigits}%`}`
          : undefined,
      )
    : undefined;
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(all)
    .where(where);
  const pages = Math.max(1, Math.ceil(total / 25));
  const currentPage = Math.min(Math.max(1, page), pages);
  const rows = await db
    .select()
    .from(all)
    .where(where)
    .orderBy(desc(all.updatedAt), desc(all.id))
    .limit(25)
    .offset((currentPage - 1) * 25);
  return { rows, total, pages, page: currentPage };
}
