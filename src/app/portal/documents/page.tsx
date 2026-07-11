import { and, desc, eq } from "drizzle-orm";
import { Download, FileText, LockKeyhole } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { requirePortalSession } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import {
  applicationChangeRequests,
  applicationFiles,
  applications,
  files,
} from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { AuthenticatedUpload } from "@/components/uploads/authenticated-upload";
export default async function DocumentsPage() {
  const { profile } = await requirePortalSession();
  const rows = await getDb()
    .select({ application: applications, file: files, link: applicationFiles })
    .from(applicationFiles)
    .innerJoin(
      applications,
      eq(applicationFiles.applicationId, applications.id),
    )
    .innerJoin(files, eq(applicationFiles.fileId, files.id))
    .where(
      and(
        eq(applications.ownerProfileId, profile.id),
        eq(files.status, "ready"),
      ),
    )
    .orderBy(desc(applicationFiles.createdAt));
  const openRequests = await getDb()
    .select({ request: applicationChangeRequests, application: applications })
    .from(applicationChangeRequests)
    .innerJoin(
      applications,
      eq(applicationChangeRequests.applicationId, applications.id),
    )
    .where(
      and(
        eq(applications.ownerProfileId, profile.id),
        eq(applicationChangeRequests.status, "open"),
      ),
    );
  return (
    <>
      <h1 className="page-heading">Documents</h1>
      <p className="mt-2 text-graphite">
        Private files linked to your approved applications.
      </p>
      <div className="mt-7 flex flex-col gap-3">
        {openRequests
          .filter(({ request }) =>
            request.requestedFileKinds.includes("requested_document"),
          )
          .map((openRequest) => (
            <section
              key={openRequest.request.id}
              className="glass-feature mb-3 rounded-lg p-6"
            >
              <h2 className="section-title">Supporting document requested</h2>
              <p className="mb-5 mt-2 text-sm leading-6 text-graphite">
                {openRequest.request.instructions}
              </p>
              <AuthenticatedUpload
                applicationId={openRequest.application.id}
                kind="requested_document"
              />
            </section>
          ))}
        {rows.length ? (
          rows.map(({ application, file, link }) => (
            <article
              key={link.id}
              className="surface flex flex-wrap items-center gap-4 rounded-lg p-5"
            >
              <FileText className="text-antique-gold" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {file.safeDownloadFilename ?? "Protected file"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {application.reference} · {link.kind.replaceAll("_", " ")} ·{" "}
                  {formatInTimeZone(
                    link.createdAt,
                    "Asia/Colombo",
                    "dd MMM yyyy, HH:mm",
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                render={<a href={`/api/files/${file.id}/download`} />}
              >
                <Download data-icon="inline-start" />
                Download
              </Button>
            </article>
          ))
        ) : (
          <div className="surface rounded-lg p-10 text-center">
            <LockKeyhole className="mx-auto text-antique-gold" />
            <p className="mt-4 font-medium">
              No authorised documents are available
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Documents will appear after they are finalised and linked to your
              account.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
