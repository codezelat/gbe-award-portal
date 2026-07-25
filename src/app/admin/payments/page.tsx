import Link from "next/link";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Eye, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import {
  applicationFiles,
  applications,
  files,
  payments,
} from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { updatePaymentAction } from "@/server/actions/application-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  canPurgeIncompletePaymentShell,
  missingPaymentVerificationFields,
} from "@/lib/domain/payment-verification";
import { RemoveIncompleteNominationButton } from "@/components/admin/remove-incomplete-nomination-button";

const pageSizes = [25, 50, 100] as const;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
    pageSize?: string;
    incomplete?: string;
  }>;
}) {
  const query = await searchParams;
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "payments.view")) notFound();
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(query.pageSize ?? "25", 10);
  const pageSize = pageSizes.includes(requestedSize as 25 | 50 | 100)
    ? requestedSize
    : 25;
  const isIncompleteView =
    query.incomplete === "1" && membership.role === "super_admin";
  const filters: SQL[] = [
    isNull(applications.deletedAt),
    isIncompleteView
      ? eq(applications.workflowStatus, "uploading")
      : ne(applications.workflowStatus, "uploading"),
  ];
  if (
    query.status &&
    payments.status.enumValues.includes(query.status as never)
  )
    filters.push(
      eq(
        payments.status,
        query.status as (typeof payments.status.enumValues)[number],
      ),
    );
  if (query.search)
    filters.push(
      or(
        ilike(applications.reference, `%${query.search}%`),
        ilike(applications.nomineeName, `%${query.search}%`),
        ilike(payments.paymentReference, `%${query.search}%`),
        ilike(payments.bankReference, `%${query.search}%`),
        ilike(payments.payerName, `%${query.search}%`),
      )!,
    );
  const where = and(...filters);
  const db = getDb();
  const [rows, [total], [incompleteTotal]] = await Promise.all([
    db
      .select({
        payment: payments,
        application: applications,
        proofFileId: files.id,
        proofName: files.safeDownloadFilename,
        proofVersions: sql<number>`(
          select count(*)::int from application_files af
          where af.application_id = ${applications.id}
            and af.kind = 'payment_proof'
        )`,
      })
      .from(payments)
      .innerJoin(applications, eq(payments.applicationId, applications.id))
      .leftJoin(
        applicationFiles,
        eq(payments.proofApplicationFileId, applicationFiles.id),
      )
      .leftJoin(files, eq(applicationFiles.fileId, files.id))
      .where(where)
      .orderBy(desc(payments.updatedAt), desc(payments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(payments)
      .innerJoin(applications, eq(payments.applicationId, applications.id))
      .where(where),
    membership.role === "super_admin"
      ? db
          .select({ value: count() })
          .from(payments)
          .innerJoin(applications, eq(payments.applicationId, applications.id))
          .where(
            and(
              isNull(applications.deletedAt),
              eq(applications.workflowStatus, "uploading"),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
  ]);
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  params.set("pageSize", String(pageSize));
  const pageHref = (next: number) => {
    params.set("page", String(next));
    return `/admin/payments?${params.toString()}`;
  };
  return (
    <>
      <h1 className="page-heading">
        {isIncompleteView ? "Incomplete nominations" : "Payment review"}
      </h1>
      <p className="mt-2 text-graphite">
        {isIncompleteView
          ? "Remove abandoned nomination shells that have no retained evidence."
          : "Review private evidence, reconciliation details and payment decisions."}
      </p>
      <form className="surface mt-6 grid gap-3 rounded-lg p-4 md:grid-cols-[minmax(0,1fr)_210px_120px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={query.search}
            placeholder="Reference, nominee, payer or bank reference"
            className="h-11 bg-white pl-9"
          />
        </label>
        <select
          name="status"
          defaultValue={query.status ?? ""}
          className="h-11 rounded-md border bg-white px-3 text-sm"
        >
          <option value="">All payment states</option>
          {payments.status.enumValues.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          name="pageSize"
          defaultValue={pageSize}
          className="h-11 rounded-md border bg-white px-3 text-sm"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
        <Button className="h-11">Apply filters</Button>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>{total.value} matching payment record(s)</p>
        {isIncompleteView ? (
          <Link href="/admin/payments" className="underline">
            Back to payment review
          </Link>
        ) : query.search || query.status ? (
          <Link href="/admin/payments" className="underline">
            Clear filters
          </Link>
        ) : membership.role === "super_admin" && incompleteTotal.value ? (
          <Link href="/admin/payments?incomplete=1" className="underline">
            {incompleteTotal.value} incomplete nomination(s) awaiting cleanup
          </Link>
        ) : null}
      </div>
      <div className="data-table-scroll mt-5 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Payer context</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(
                ({
                  payment,
                  application,
                  proofFileId,
                  proofName,
                  proofVersions,
                }) => {
                  const verificationGaps =
                    payment.status === "verified"
                      ? missingPaymentVerificationFields({
                          applicationReference: application.reference,
                          applicationSubmittedAt: application.submittedAt,
                          paymentReference: payment.paymentReference,
                          proofApplicationFileId:
                            payment.proofApplicationFileId,
                          payerName: payment.payerName,
                          bankReference: payment.bankReference,
                          amountMinor: payment.amountMinor,
                          currency: payment.currency,
                          paidAt: payment.paidAt,
                        })
                      : [];
                  const needsCorrection = verificationGaps.length > 0;
                  const canRemove =
                    membership.role === "super_admin" &&
                    canPurgeIncompletePaymentShell({
                      workflowStatus: application.workflowStatus,
                      applicationReference: application.reference,
                      applicationSubmittedAt: application.submittedAt,
                      paymentReference: payment.paymentReference,
                      proofApplicationFileId: payment.proofApplicationFileId,
                      payerName: payment.payerName,
                      bankReference: payment.bankReference,
                      amountMinor: payment.amountMinor,
                      currency: payment.currency,
                      paidAt: payment.paidAt,
                    });
                  return (
                    <tr
                    key={payment.id}
                    className="border-t align-top hover:bg-muted/40"
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/applications/${application.id}`}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {application.reference ?? "Incomplete nomination"}
                      </Link>
                      <p className="mt-1 font-medium">
                        {application.nomineeName}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {payment.paymentReference ?? "Reference pending"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p>{payment.payerName ?? "Not recorded"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payment.bankReference ?? "No bank reference"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={payment.status} />
                      {needsCorrection ? (
                        <p className="mt-2 max-w-52 text-xs font-medium text-amber-800">
                          Needs correction: {verificationGaps.join(", ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <p className="max-w-48 truncate">
                        {proofName ?? "No current proof"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {proofVersions} retained version(s)
                      </p>
                      {proofFileId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2"
                          render={
                            <a
                              href={`/api/files/${proofFileId}/download?view=1`}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          <Eye data-icon="inline-start" /> Preview
                        </Button>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {payment.amountMinor === null
                        ? "Not recorded"
                        : `${payment.currency ?? ""} ${(payment.amountMinor / 100).toFixed(2)}`}
                      {payment.receiptReference ? (
                        <p className="mt-1 font-mono text-xs">
                          {payment.receiptReference}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-xs">
                      {formatInTimeZone(
                        payment.updatedAt,
                        "Asia/Colombo",
                        "dd MMM yyyy, HH:mm",
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {hasPermission(membership, "payments.verify") &&
                        ["proof_submitted", "under_review"].includes(
                          payment.status,
                        ) ? (
                          <form action={updatePaymentAction}>
                            <input
                              type="hidden"
                              name="applicationId"
                              value={application.id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value={
                                payment.status === "proof_submitted"
                                  ? "under_review"
                                  : "verified"
                              }
                            />
                            <Button size="sm" variant="outline">
                              {payment.status === "proof_submitted"
                                ? "Begin review"
                                : "Verify"}
                            </Button>
                          </form>
                        ) : null}
                        <Button
                          size="sm"
                          variant={needsCorrection ? "outline" : "ghost"}
                          render={
                            <Link
                              href={`/admin/applications/${application.id}`}
                            />
                          }
                        >
                          {needsCorrection ? "Update record" : "Full review"}
                        </Button>
                        {canRemove ? (
                          <RemoveIncompleteNominationButton
                            applicationId={application.id}
                            nomineeName={application.nomineeName}
                          />
                        ) : null}
                      </div>
                    </td>
                    </tr>
                  );
                },
              )
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="h-40 px-4 text-center text-muted-foreground"
                >
                  No payment records match these filters. Clear filters or
                  select another status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav
        className="mt-5 flex flex-wrap items-center justify-between gap-3"
        aria-label="Payment pagination"
      >
        <Button
          variant="outline"
          disabled={page === 1}
          render={page > 1 ? <Link href={pageHref(page - 1)} /> : undefined}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {Math.max(1, Math.ceil(total.value / pageSize))}
        </span>
        <Button
          variant="outline"
          disabled={page * pageSize >= total.value}
          render={
            page * pageSize < total.value ? (
              <Link href={pageHref(page + 1)} />
            ) : undefined
          }
        >
          Next
        </Button>
      </nav>
    </>
  );
}
