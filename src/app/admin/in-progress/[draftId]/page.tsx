import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { getDb } from "@/lib/db";
import {
  applications,
  awardCategories,
  nominationDrafts,
} from "@/lib/db/schema";
import {
  draftDataSchema,
  draftStepLabels,
} from "@/lib/validation/nomination-draft";
import { normaliseUrl } from "@/lib/validation/application";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { draftFileRows } from "@/server/services/nomination-drafts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteDraftButton } from "@/components/admin/delete-draft-button";
import { ProtectedFilePreview } from "@/components/admin/protected-file-preview";

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ draftId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "applications.view_all")) notFound();
  const id = z.uuid().safeParse((await params).draftId).data;
  if (!id) notFound();
  const source = (await searchParams).source === "upload" ? "upload" : "draft";
  const db = getDb();
  const [draft] =
    source === "draft"
      ? await db
          .select()
          .from(nominationDrafts)
          .where(
            and(
              eq(nominationDrafts.id, id),
              isNull(nominationDrafts.deletedAt),
            ),
          )
      : [];
  if (draft?.submittedAt && draft.applicationId)
    redirect(`/admin/applications/${draft.applicationId}`);
  const [legacy] =
    source === "upload"
      ? await db
          .select()
          .from(applications)
          .where(and(eq(applications.id, id), isNull(applications.deletedAt)))
      : [];
  if (legacy?.submittedAt) redirect(`/admin/applications/${legacy.id}`);
  if (!draft && (!legacy || legacy.workflowStatus !== "uploading")) notFound();
  const data = draft
    ? draftDataSchema.parse(draft.payload)
    : {
        nomineeName: legacy!.nomineeName,
        email: legacy!.emailDisplay,
        phone: legacy!.phoneDisplay,
        designation: legacy!.designation,
        businessWebsite: legacy!.businessWebsite,
        awardNomination: legacy!.awardNomination,
        categoryId: legacy!.categoryId,
        paymentMethod: undefined,
      };
  const [category] = data.categoryId
    ? await db
        .select({ name: awardCategories.name })
        .from(awardCategories)
        .where(eq(awardCategories.id, data.categoryId))
    : [];
  const linked = draft ? await draftFileRows(draft.id) : [];
  const url = normaliseUrl(data.businessWebsite ?? undefined);
  const website = url && /^https?:\/\//i.test(url) ? url : null;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
      <Button
        variant="ghost"
        className="self-start"
        render={<Link href="/admin/in-progress" />}
      >
        Back to In-progress
      </Button>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-heading break-words">{data.nomineeName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant="outline">
              {draftStepLabels[draft?.savedStep ?? 3]} saved
            </Badge>
            <p className="text-xs text-muted-foreground">
              {formatInTimeZone(
                (draft ?? legacy)!.updatedAt,
                "Asia/Colombo",
                "dd MMM yyyy, HH:mm",
              )}
            </p>
          </div>
        </div>
        {hasPermission(membership, "applications.edit") &&
        (draft || membership.role === "super_admin") ? (
          <DeleteDraftButton
            id={id}
            source={source}
            name={data.nomineeName}
            returnToList
          />
        ) : null}
      </header>
      <dl className="grid min-w-0 gap-6 rounded-lg border bg-card p-5 sm:grid-cols-2 sm:p-7">
        {[
          ["Email", data.email],
          ["Phone", data.phone],
          ["Designation", data.designation],
          ["Category", category?.name],
          ["Payment method", data.paymentMethod?.replaceAll("_", " ")],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-sm">{value}</dd>
            </div>
          ))}
        {website ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Website</dt>
            <dd className="mt-1 break-all text-sm">
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {data.businessWebsite}
              </a>
            </dd>
          </div>
        ) : null}
        {data.awardNomination ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Award nomination</dt>
            <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
              {data.awardNomination}
            </dd>
          </div>
        ) : null}
      </dl>
      {linked.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Attachments</h2>
          {linked.map(({ file, link }) => (
            <div
              key={link.id}
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{file.safeDownloadFilename}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.kind === "payment_proof"
                    ? "Payment proof"
                    : "Supporting document"}{" "}
                  · {file.status === "ready" ? "Saved" : "Upload incomplete"}
                </p>
              </div>
              {file.status === "ready" ? (
                <ProtectedFilePreview
                  fileId={file.id}
                  fileName={file.safeDownloadFilename ?? "Document"}
                />
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
