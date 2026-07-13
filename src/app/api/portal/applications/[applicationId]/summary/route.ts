import path from "node:path";
import { and, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applications,
  auditLogs,
  awardCycles,
  profiles,
} from "@/lib/db/schema";
import { buildApplicationSummaryPdf } from "@/lib/export/application-summary-pdf";
import { applicantVisibleStatus } from "@/lib/domain/outcome-visibility";
import { getFeatureFlags } from "@/server/services/feature-flags";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session)
      return NextResponse.json(
        { message: "Sign in required." },
        { status: 401 },
      );
    const { applicationId } = await params;
    const db = getDb();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, session.user.id))
      .limit(1);
    if (!profile?.isActive || profile.accountKind !== "applicant")
      return NextResponse.json({ message: "Access denied." }, { status: 403 });
    await enforceRateLimit(`application-summary:${profile.id}`, 20, 3600);
    const [row] = await db
      .select({
        application: applications,
        resultsReleaseAt: awardCycles.resultsReleaseAt,
      })
      .from(applications)
      .innerJoin(awardCycles, eq(awardCycles.id, applications.cycleId))
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.ownerProfileId, profile.id),
        ),
      )
      .limit(1);
    if (!row)
      return NextResponse.json(
        { message: "Application not found." },
        { status: 404 },
      );
    const flags = await getFeatureFlags();
    const visibleStatus = applicantVisibleStatus(
      row.application.workflowStatus,
      row.resultsReleaseAt,
      new Date(),
      flags.outcome_visibility_enabled,
    );
    const fontRoot = path.join(
      process.cwd(),
      "node_modules",
      "@expo-google-fonts",
      "noto-sans",
    );
    const regularFontPath = path.join(
      fontRoot,
      "400Regular",
      "NotoSans_400Regular.ttf",
    );
    const boldFontPath = path.join(fontRoot, "700Bold", "NotoSans_700Bold.ttf");
    const generatedAt = new Date();
    const body = await buildApplicationSummaryPdf({
      regularFontPath,
      boldFontPath,
      data: {
        reference: row.application.reference ?? "Pending reference",
        nomineeName: row.application.nomineeName,
        designation: row.application.designation,
        awardNomination: row.application.awardNomination,
        businessWebsite: row.application.businessWebsite,
        email: row.application.emailDisplay,
        phone: row.application.phoneDisplay,
        category: row.application.categoryNameSnapshot,
        workflowStatus: visibleStatus.replaceAll("_", " "),
        paymentStatus: row.application.paymentStatus.replaceAll("_", " "),
        submittedAt: row.application.submittedAt
          ? formatInTimeZone(
              row.application.submittedAt,
              "Asia/Colombo",
              "dd MMMM yyyy, HH:mm:ss XXX",
            )
          : "Not finalised",
        generatedAt: formatInTimeZone(
          generatedAt,
          "Asia/Colombo",
          "dd MMMM yyyy, HH:mm:ss XXX",
        ),
      },
    });
    await db.insert(auditLogs).values({
      actorProfileId: profile.id,
      actorType: "applicant",
      action: "application summary downloaded",
      entityType: "application",
      entityId: row.application.id,
      applicationId: row.application.id,
      metadataRedacted: { format: "pdf" },
      requestId: crypto.randomUUID(),
    });
    const reference = (row.application.reference ?? "application").replace(
      /[^a-zA-Z0-9-]/g,
      "_",
    );
    const responseBody = new ArrayBuffer(body.byteLength);
    new Uint8Array(responseBody).set(body);
    return new Response(responseBody, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${reference}-summary.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "The secure application summary could not be generated." },
      { status: 400 },
    );
  }
}
