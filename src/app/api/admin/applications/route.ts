import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  profiles,
  staffMemberships,
} from "@/lib/db/schema";
import { hasPermission } from "@/server/dal/auth";
const querySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce
    .number()
    .refine((value) => [25, 50, 100].includes(value))
    .default(25),
  search: z.string().trim().max(320).optional(),
  status: z.enum(applications.workflowStatus.enumValues).optional(),
  paymentStatus: z.enum(applications.paymentStatus.enumValues).optional(),
  accountStatus: z.enum(applications.accountAccessStatus.enumValues).optional(),
  category: z.uuid().optional(),
  reviewer: z.uuid().optional(),
  cycle: z.uuid().optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  actionRequired: z.enum(["true", "false"]).optional(),
  hasDocuments: z.enum(["true", "false"]).optional(),
  deleted: z.enum(["active", "include", "only"]).default("active"),
  sort: z
    .enum(["submitted", "activity", "nominee", "status", "category"])
    .default("submitted"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
function encode(value: { key: string; id: string }) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function decode(value: string) {
  return z
    .object({ key: z.string().min(1).max(500), id: z.uuid() })
    .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
}
export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session)
      return NextResponse.json(
        { ok: false, message: "Sign in required." },
        { status: 401 },
      );
    const db = getDb();
    const [staff] = await db
      .select({ profile: profiles, membership: staffMemberships })
      .from(profiles)
      .innerJoin(staffMemberships, eq(staffMemberships.profileId, profiles.id))
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (
      !staff ||
      staff.membership.suspendedAt ||
      (!hasPermission(staff.membership, "applications.view") &&
        !["admin", "super_admin", "reviewer", "finance", "support"].includes(
          staff.membership.role,
        ))
    )
      return NextResponse.json(
        { ok: false, message: "Access denied." },
        { status: 403 },
      );
    const url = new URL(request.url);
    const input = querySchema.parse(Object.fromEntries(url.searchParams));
    const sortColumn = {
      submitted: applications.submittedAt,
      activity: applications.lastActivityAt,
      nominee: applications.nomineeName,
      status: applications.workflowStatus,
      category: applications.categoryNameSnapshot,
    }[input.sort];
    const filters: SQL[] = [
      ne(applications.workflowStatus, "uploading"),
      isNotNull(applications.submittedAt),
    ];
    if (input.deleted === "only")
      filters.push(isNotNull(applications.deletedAt));
    else if (input.deleted !== "include")
      filters.push(isNull(applications.deletedAt));
    if (!hasPermission(staff.membership, "applications.view_all"))
      filters.push(eq(applications.assignedReviewerId, staff.profile.id));
    if (input.search)
      filters.push(
        or(
          ilike(applications.reference, `%${input.search}%`),
          ilike(applications.nomineeName, `%${input.search}%`),
          ilike(applications.emailNormalised, `%${input.search}%`),
          ilike(applications.phoneDisplay, `%${input.search}%`),
        )!,
      );
    if (input.status)
      filters.push(eq(applications.workflowStatus, input.status));
    if (input.paymentStatus)
      filters.push(eq(applications.paymentStatus, input.paymentStatus));
    if (input.accountStatus)
      filters.push(eq(applications.accountAccessStatus, input.accountStatus));
    if (input.category)
      filters.push(eq(applications.categoryId, input.category));
    if (input.reviewer)
      filters.push(eq(applications.assignedReviewerId, input.reviewer));
    if (input.cycle) filters.push(eq(applications.cycleId, input.cycle));
    if (input.dateFrom)
      filters.push(
        gte(
          applications.submittedAt,
          new Date(`${input.dateFrom}T00:00:00+05:30`),
        ),
      );
    if (input.dateTo)
      filters.push(
        lte(
          applications.submittedAt,
          new Date(`${input.dateTo}T23:59:59+05:30`),
        ),
      );
    if (input.actionRequired === "true")
      filters.push(eq(applications.workflowStatus, "changes_requested"));
    if (input.hasDocuments === "true")
      filters.push(
        exists(
          db
            .select({ value: sql`1` })
            .from(applicationFiles)
            .where(
              and(
                eq(applicationFiles.applicationId, applications.id),
                eq(applicationFiles.kind, "supporting_document"),
                eq(applicationFiles.isCurrent, true),
              ),
            ),
        ),
      );
    if (input.cursor) {
      const cursor = decode(input.cursor);
      const key = ["submitted", "activity"].includes(input.sort)
        ? new Date(cursor.key)
        : cursor.key;
      const keyComparison =
        input.direction === "asc"
          ? sql`${sortColumn} > ${key}`
          : sql`${sortColumn} < ${key}`;
      const idComparison =
        input.direction === "asc"
          ? gt(applications.id, cursor.id)
          : lt(applications.id, cursor.id);
      filters.push(
        or(keyComparison, and(sql`${sortColumn} = ${key}`, idComparison))!,
      );
    }
    const where = and(...filters);
    const [result, [total]] = await Promise.all([
      db
        .select({
          id: applications.id,
          reference: applications.reference,
          nomineeName: applications.nomineeName,
          designation: applications.designation,
          category: applications.categoryNameSnapshot,
          email: applications.emailDisplay,
          phone: applications.phoneDisplay,
          workflowStatus: applications.workflowStatus,
          paymentStatus: applications.paymentStatus,
          accountStatus: applications.accountAccessStatus,
          reviewerId: applications.assignedReviewerId,
          submittedAt: applications.submittedAt,
          lastActivityAt: applications.lastActivityAt,
        })
        .from(applications)
        .where(where)
        .orderBy(
          input.direction === "asc" ? asc(sortColumn) : desc(sortColumn),
          input.direction === "asc"
            ? asc(applications.id)
            : desc(applications.id),
        )
        .limit(input.pageSize + 1),
      db
        .select({ value: count() })
        .from(applications)
        .where(
          and(
            ...filters.filter(
              (_, index) => !input.cursor || index !== filters.length - 1,
            ),
          ),
        ),
    ]);
    const hasMore = result.length > input.pageSize;
    const rows = result.slice(0, input.pageSize);
    const last = rows.at(-1);
    return NextResponse.json({
      ok: true,
      data: {
        rows,
        nextCursor:
          hasMore && last
            ? encode({
                key:
                  input.sort === "submitted"
                    ? last.submittedAt!.toISOString()
                    : input.sort === "activity"
                      ? last.lastActivityAt.toISOString()
                      : input.sort === "nominee"
                        ? last.nomineeName
                        : input.sort === "status"
                          ? last.workflowStatus
                          : last.category,
                id: last.id,
              })
            : null,
        previousCursor: input.cursor ?? null,
        totalCount: total.value,
        filteredCount: total.value,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The application list could not be loaded.",
      },
      { status: 400 },
    );
  }
}
