import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { FileText, MessageSquareText, ShieldCheck } from "lucide-react";
import { getDb } from "@/lib/db";
import {
  applicationChangeRequests,
  applicationFiles,
  applicationMessages,
  applicationNotes,
  applicationStatusHistory,
  applicationVersions,
  applications,
  auditLogs,
  awardCategories,
  files,
  payments,
  profiles,
} from "@/lib/db/schema";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import {
  addInternalNoteAction,
  changeStatusAction,
  editApplicationAction,
  issuePortalAccessAction,
  setApplicationDeletionAction,
  requestChangesAction,
  sendStaffMessageAction,
  updatePaymentAction,
} from "@/server/actions/application-actions";
import { bulkAssignReviewerAction } from "@/server/actions/bulk-actions";
import {
  transitionMap,
  type WorkflowStatus,
} from "@/lib/domain/application-status";
export default async function AdminApplicationDetail({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const { profile: staffProfile, membership } = await requireStaff();
  const db = getDb();
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!application) notFound();
  if (
    !hasPermission(membership, "applications.view_all") &&
    application.assignedReviewerId !== staffProfile.id
  )
    notFound();
  const [
    payment,
    linkedFiles,
    notes,
    history,
    versions,
    categories,
    owner,
    messages,
    changeRequests,
    audits,
    reviewers,
  ] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(eq(payments.applicationId, applicationId))
      .limit(1)
      .then((v) => v[0]),
    db
      .select({ link: applicationFiles, file: files })
      .from(applicationFiles)
      .innerJoin(files, eq(applicationFiles.fileId, files.id))
      .where(eq(applicationFiles.applicationId, applicationId)),
    db
      .select({ note: applicationNotes, author: profiles.displayName })
      .from(applicationNotes)
      .innerJoin(profiles, eq(applicationNotes.createdBy, profiles.id))
      .where(eq(applicationNotes.applicationId, applicationId))
      .orderBy(desc(applicationNotes.createdAt)),
    db
      .select()
      .from(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, applicationId))
      .orderBy(desc(applicationStatusHistory.effectiveAt)),
    db
      .select()
      .from(applicationVersions)
      .where(eq(applicationVersions.applicationId, applicationId))
      .orderBy(desc(applicationVersions.version)),
    db
      .select()
      .from(awardCategories)
      .where(eq(awardCategories.cycleId, application.cycleId))
      .orderBy(awardCategories.displayOrder),
    application.ownerProfileId
      ? db
          .select()
          .from(profiles)
          .where(eq(profiles.id, application.ownerProfileId))
          .limit(1)
          .then((rows) => rows[0])
      : Promise.resolve(undefined),
    db
      .select()
      .from(applicationMessages)
      .where(eq(applicationMessages.applicationId, applicationId))
      .orderBy(desc(applicationMessages.createdAt)),
    db
      .select()
      .from(applicationChangeRequests)
      .where(eq(applicationChangeRequests.applicationId, applicationId))
      .orderBy(desc(applicationChangeRequests.createdAt)),
    db
      .select({ audit: auditLogs, actor: profiles.displayName })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorProfileId, profiles.id))
      .where(eq(auditLogs.applicationId, applicationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50),
    db
      .select({ id: profiles.id, name: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.accountKind, "staff"))
      .orderBy(profiles.displayName),
  ]);
  const fields = [
    ["Nominee / organisation", application.nomineeName],
    ["Designation", application.designation || "Not provided"],
    ["Industry", application.industrySector],
    ["Website", application.businessWebsite || "Not provided"],
    ["Email", application.emailDisplay],
    ["Telephone", application.phoneDisplay],
    ["Category", application.categoryNameSnapshot],
    [
      "Submitted",
      application.submittedAt
        ? formatInTimeZone(
            application.submittedAt,
            "Asia/Colombo",
            "dd MMMM yyyy, HH:mm zzz",
          )
        : "Not finalised",
    ],
  ];
  const allowed =
    transitionMap[application.workflowStatus as WorkflowStatus] ?? [];
  const visibleAllowed = allowed.filter((status) => {
    if (status === "approved")
      return hasPermission(membership, "applications.approve");
    if (status === "rejected")
      return hasPermission(membership, "applications.reject");
    if (["shortlisted", "winner", "not_selected"].includes(status))
      return hasPermission(membership, "applications.release_outcome");
    return true;
  });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-antique-gold">
            {application.reference ?? "Provisional upload"}
          </p>
          <h1 className="page-heading mt-1">{application.nomineeName}</h1>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={application.workflowStatus} />
          <StatusBadge status={application.paymentStatus} />
        </div>
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section className="surface rounded-lg p-6">
            <h2 className="section-title">Submitted nomination</h2>
            <dl className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="border-b pb-4">
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-2 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs text-muted-foreground">
              Original version 1 is immutable. Administrative corrections must
              create a new version with a reason.
            </p>
          </section>
          <section className="surface rounded-lg p-6">
            <h2 className="section-title">Applicant and account access</h2>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Linked profile
                </dt>
                <dd className="mt-1 font-medium">
                  {owner?.displayName ?? "No applicant account linked"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Access state
                </dt>
                <dd className="mt-1">
                  <StatusBadge status={application.accountAccessStatus} />
                </dd>
              </div>
            </dl>
          </section>
          {hasPermission(membership, "applications.edit") ? (
            <details className="surface rounded-lg p-6">
              <summary className="cursor-pointer text-lg font-semibold">
                Correct submitted application data
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Every correction creates a new version. Primary email and
                category changes require super-administrator permission.
              </p>
              <form
                action={editApplicationAction}
                className="mt-6 grid gap-5 md:grid-cols-2"
              >
                <input
                  type="hidden"
                  name="applicationId"
                  value={application.id}
                />
                <input
                  type="hidden"
                  name="version"
                  value={application.currentVersion}
                />
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Nominee / organisation
                  <Input
                    name="nomineeName"
                    defaultValue={application.nomineeName}
                    required
                    className="h-11 bg-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Designation
                  <Input
                    name="designation"
                    defaultValue={application.designation ?? ""}
                    className="h-11 bg-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Industry / sector
                  <Input
                    name="industrySector"
                    defaultValue={application.industrySector}
                    required
                    className="h-11 bg-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Website
                  <Input
                    name="businessWebsite"
                    type="url"
                    defaultValue={application.businessWebsite ?? ""}
                    className="h-11 bg-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Primary email
                  <Input
                    name="email"
                    type="email"
                    defaultValue={application.emailDisplay}
                    required
                    className="h-11 bg-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Telephone
                  <Input
                    name="phoneDisplay"
                    defaultValue={application.phoneDisplay}
                    required
                    className="h-11 bg-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
                  Category
                  <select
                    name="categoryId"
                    defaultValue={application.categoryId}
                    className="h-11 rounded-md border bg-white px-3"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
                  Mandatory correction reason
                  <Textarea
                    name="reason"
                    required
                    minLength={8}
                    maxLength={1000}
                    className="bg-white"
                  />
                </label>
                {membership.role === "super_admin" ? (
                  <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
                    Current password for primary email or category changes
                    <Input
                      name="reauthPassword"
                      type="password"
                      autoComplete="current-password"
                      className="h-11 bg-white"
                    />
                    <span className="font-normal text-muted-foreground">
                      Required only when changing the primary email or award
                      category. A linked applicant will be signed out and must
                      verify the new address.
                    </span>
                  </label>
                ) : null}
                <div className="flex justify-end md:col-span-2">
                  <Button>Save audited correction</Button>
                </div>
              </form>
            </details>
          ) : null}
          <section className="surface rounded-lg p-6">
            <h2 className="section-title">Documents</h2>
            <div className="mt-5 flex flex-col gap-3">
              {linkedFiles.length ? (
                linkedFiles.map(({ link, file }) => (
                  <div
                    key={link.id}
                    className="flex items-center gap-3 rounded-md border bg-white p-4"
                  >
                    <FileText className="text-antique-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {file.safeDownloadFilename ?? "Protected file"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.kind.replaceAll("_", " ")} ·{" "}
                        {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {file.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {file.mimeTypeDetected === "application/pdf" ||
                      file.mimeTypeDetected?.startsWith("image/") ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          render={
                            <a
                              href={`/api/files/${file.id}/download?view=1`}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          Preview
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        render={<a href={`/api/files/${file.id}/download`} />}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No finalised files are linked.
                </p>
              )}
            </div>
          </section>
          <section className="surface rounded-lg p-6">
            <h2 className="section-title">Internal notes</h2>
            <form
              action={addInternalNoteAction}
              className="mt-5 flex flex-col gap-3"
            >
              <input type="hidden" name="applicationId" value={applicationId} />
              <select
                name="noteType"
                className="h-11 rounded-md border bg-white px-3"
              >
                <option value="general">General</option>
                <option value="review">Review</option>
                <option value="finance">Finance</option>
                <option value="security">Security</option>
              </select>
              <Textarea
                name="body"
                required
                minLength={2}
                maxLength={4000}
                placeholder="Add an internal note. Applicants cannot see this."
              />
              <Button className="self-start">
                <MessageSquareText data-icon="inline-start" />
                Add note
              </Button>
            </form>
            <div className="mt-6 flex flex-col gap-3">
              {notes.map(({ note, author }) => (
                <article key={note.id} className="rounded-md bg-muted p-4">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {note.noteType} · {author}
                    </span>
                    <time>
                      {formatInTimeZone(
                        note.createdAt,
                        "Asia/Colombo",
                        "dd MMM yyyy, HH:mm",
                      )}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {note.body}
                  </p>
                </article>
              ))}
            </div>
          </section>
          {hasPermission(membership, "messages.send") ? (
            <section className="surface rounded-lg p-6">
              <h2 className="section-title">Applicant communication</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This message is visible in the applicant portal and queues an
                email notification.
              </p>
              <form
                action={sendStaffMessageAction}
                className="mt-5 flex flex-col gap-3"
              >
                <input
                  type="hidden"
                  name="applicationId"
                  value={application.id}
                />
                <Input
                  name="subject"
                  required
                  minLength={2}
                  maxLength={160}
                  placeholder="Message subject"
                  className="h-11 bg-white"
                />
                <Textarea
                  name="body"
                  required
                  minLength={2}
                  maxLength={4000}
                  placeholder="Applicant-visible message"
                  className="min-h-32 bg-white"
                />
                <Button className="self-start">Send applicant message</Button>
              </form>
            </section>
          ) : null}
          <section className="surface rounded-lg p-6">
            <h2 className="section-title">Messages and change requests</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Applicant-visible messages
                </h3>
                <div className="mt-3 flex flex-col gap-3">
                  {messages.length ? (
                    messages.map((message) => (
                      <article
                        key={message.id}
                        className="rounded-md bg-muted p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {message.senderType} ·{" "}
                          {message.subject ?? "No subject"}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm">
                          {message.body}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No messages yet.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Information requests</h3>
                <div className="mt-3 flex flex-col gap-3">
                  {changeRequests.length ? (
                    changeRequests.map((request) => (
                      <article
                        key={request.id}
                        className="rounded-md border p-4"
                      >
                        <StatusBadge status={request.status} />
                        <p className="mt-2 text-sm">{request.instructions}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Fields:{" "}
                          {request.fieldKeys.join(", ") || "documents only"}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No information requests.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="surface rounded-lg p-6">
            <h2 className="section-title">Version and audit history</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                {versions.map((version) => (
                  <article key={version.id} className="border-b py-3">
                    <p className="text-sm font-medium">
                      Version {version.version} ·{" "}
                      {version.source.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {version.changedFields.length
                        ? `Changed: ${version.changedFields.join(", ")}`
                        : "Original snapshot"}
                      {version.reason ? ` · ${version.reason}` : ""}
                    </p>
                  </article>
                ))}
              </div>
              <div>
                {audits.map(({ audit, actor }) => (
                  <article key={audit.id} className="border-b py-3">
                    <p className="text-sm font-medium">{audit.action}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {actor ?? audit.actorType} ·{" "}
                      {formatInTimeZone(
                        audit.createdAt,
                        "Asia/Colombo",
                        "dd MMM yyyy, HH:mm",
                      )}
                      {audit.reason ? ` · ${audit.reason}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          {membership.role === "super_admin" ? (
            <section className="surface rounded-lg border-destructive/30 p-5">
              <h2 className="text-lg font-semibold">Retention control</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {application.deletedAt
                  ? "Restore this soft-deleted record while retention permits."
                  : "Soft-delete this record without erasing its audit history."}
              </p>
              <form
                action={setApplicationDeletionAction}
                className="mt-4 flex flex-col gap-3"
              >
                <input
                  type="hidden"
                  name="applicationId"
                  value={application.id}
                />
                <input
                  type="hidden"
                  name="mode"
                  value={application.deletedAt ? "restore" : "delete"}
                />
                <Textarea
                  name="reason"
                  required
                  minLength={12}
                  maxLength={1000}
                  placeholder="Mandatory retention or restoration reason"
                />
                <Button
                  variant={application.deletedAt ? "outline" : "destructive"}
                >
                  {application.deletedAt
                    ? "Restore application"
                    : "Soft-delete application"}
                </Button>
              </form>
            </section>
          ) : null}
          {application.workflowStatus === "approved" &&
          !["active", "invited"].includes(application.accountAccessStatus) &&
          hasPermission(membership, "applications.approve") ? (
            <section className="glass-feature rounded-lg p-5">
              <h2 className="text-lg font-semibold">Portal access</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Approval is recorded, but secure applicant access still needs to
                be issued or retried.
              </p>
              <form action={issuePortalAccessAction} className="mt-4">
                <input
                  type="hidden"
                  name="applicationId"
                  value={application.id}
                />
                <Button>Issue secure invitation</Button>
              </form>
            </section>
          ) : null}
          {hasPermission(membership, "applications.edit") ? (
            <section className="surface rounded-lg p-5">
              <h2 className="text-lg font-semibold">Assignment</h2>
              <form
                action={bulkAssignReviewerAction}
                className="mt-4 flex flex-col gap-3"
              >
                <input
                  type="hidden"
                  name="applicationIds"
                  value={application.id}
                />
                <select
                  name="reviewerId"
                  defaultValue={application.assignedReviewerId ?? ""}
                  className="h-11 rounded-md border bg-white px-3"
                >
                  <option value="">Unassigned</option>
                  {reviewers.map((reviewer) => (
                    <option key={reviewer.id} value={reviewer.id}>
                      {reviewer.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline">Save reviewer</Button>
              </form>
            </section>
          ) : null}
          <section className="glass-feature rounded-lg p-5">
            <h2 className="text-lg font-semibold">Review actions</h2>
            <form
              action={changeStatusAction}
              className="mt-4 flex flex-col gap-3"
            >
              <input type="hidden" name="applicationId" value={applicationId} />
              <select
                name="to"
                required
                className="h-11 rounded-md border bg-white px-3"
              >
                <option value="">Choose a valid next status</option>
                {visibleAllowed
                  .filter((status) => status !== "changes_requested")
                  .map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
              </select>
              <Textarea
                name="applicantMessage"
                placeholder="Applicant-facing message when needed"
              />
              <Textarea
                name="reason"
                placeholder="Internal reason (required for rejection/backward actions)"
              />
              <Button>Confirm status change</Button>
            </form>
          </section>
          {(visibleAllowed as readonly string[]).includes(
            "changes_requested",
          ) ? (
            <section className="surface rounded-lg p-5">
              <h2 className="text-lg font-semibold">Request information</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Select only the fields the applicant may edit. They lock again
                after resubmission.
              </p>
              <form
                action={requestChangesAction}
                className="mt-4 flex flex-col gap-3"
              >
                <input
                  type="hidden"
                  name="applicationId"
                  value={applicationId}
                />
                {[
                  ["nomineeName", "Nominee / organisation name"],
                  ["designation", "Designation"],
                  ["industrySector", "Industry / sector"],
                  ["businessWebsite", "Business website"],
                  ["phoneDisplay", "Telephone"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input type="checkbox" name="fieldKeys" value={value} />
                    {label}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="requestedFileKinds"
                    value="requested_document"
                  />
                  Additional supporting document
                </label>
                <label className="text-sm font-medium" htmlFor="dueAt">
                  Due date (optional)
                </label>
                <input
                  id="dueAt"
                  name="dueAt"
                  type="datetime-local"
                  className="h-11 rounded-md border bg-white px-3"
                />
                <Textarea
                  name="instructions"
                  required
                  minLength={10}
                  placeholder="Explain clearly what the applicant must update."
                />
                <Button variant="outline">Send request</Button>
              </form>
            </section>
          ) : null}
          {hasPermission(membership, "payments.verify") ? (
            <section className="surface rounded-lg p-5">
              <h2 className="text-lg font-semibold">Payment review</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Current: {payment?.status.replaceAll("_", " ") ?? "Missing"}
              </p>
              {payment ? (
                <form
                  action={updatePaymentAction}
                  className="mt-4 flex flex-col gap-3"
                >
                  <input
                    type="hidden"
                    name="applicationId"
                    value={applicationId}
                  />
                  <select
                    name="status"
                    className="h-11 rounded-md border bg-white px-3"
                  >
                    <option value="under_review">Under review</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                    <option value="waived">Waived</option>
                  </select>
                  <Textarea
                    name="note"
                    placeholder="Finance note or applicant-facing rejection reason"
                  />
                  <Button variant="outline">
                    <ShieldCheck data-icon="inline-start" />
                    Save payment decision
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}
          <section className="surface rounded-lg p-5">
            <h2 className="text-lg font-semibold">History</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {versions.length} saved application version(s)
            </p>
            <ol className="mt-4 flex flex-col gap-4">
              {history.map((item) => (
                <li key={item.id} className="border-l-2 border-champagne pl-3">
                  <p className="text-sm font-medium">{item.applicantLabel}</p>
                  <time className="text-xs text-muted-foreground">
                    {formatInTimeZone(
                      item.effectiveAt,
                      "Asia/Colombo",
                      "dd MMM yyyy, HH:mm",
                    )}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
