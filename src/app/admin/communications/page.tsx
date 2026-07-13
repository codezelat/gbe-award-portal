import Link from "next/link";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Mail, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import { applications, emailOutbox } from "@/lib/db/schema";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import {
  retryEmailAction,
  saveEmailTemplateAction,
  sendManualApplicantMessageAction,
} from "@/server/actions/communication-actions";
import { getEmailTemplateCopies } from "@/server/services/email-template-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const pageSizes = [25, 50, 100] as const;

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    template?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const query = await searchParams;
  const { membership } = await requireStaff();
  if (
    !hasPermission(membership, "messages.send") ||
    !hasPermission(membership, "applications.view_all")
  )
    notFound();
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(query.pageSize ?? "25", 10);
  const pageSize = pageSizes.includes(requestedSize as 25 | 50 | 100)
    ? requestedSize
    : 25;
  const filters: SQL[] = [];
  if (
    query.status &&
    emailOutbox.status.enumValues.includes(query.status as never)
  )
    filters.push(
      eq(
        emailOutbox.status,
        query.status as (typeof emailOutbox.status.enumValues)[number],
      ),
    );
  if (query.template) filters.push(eq(emailOutbox.templateKey, query.template));
  if (query.search)
    filters.push(
      or(
        ilike(emailOutbox.recipientEmail, `%${query.search}%`),
        ilike(emailOutbox.templateKey, `%${query.search}%`),
        ilike(emailOutbox.providerMessageId, `%${query.search}%`),
        ilike(applications.reference, `%${query.search}%`),
      )!,
    );
  if (query.dateFrom) {
    const value = new Date(`${query.dateFrom}T00:00:00+05:30`);
    if (!Number.isNaN(value.getTime()))
      filters.push(gte(emailOutbox.createdAt, value));
  }
  if (query.dateTo) {
    const value = new Date(`${query.dateTo}T23:59:59.999+05:30`);
    if (!Number.isNaN(value.getTime()))
      filters.push(lte(emailOutbox.createdAt, value));
  }
  const where = filters.length ? and(...filters) : undefined;
  const db = getDb();
  const templates = await getEmailTemplateCopies();
  const templateKeys = Object.keys(templates).sort();
  const [rows, [total]] = await Promise.all([
    db
      .select({
        email: emailOutbox,
        applicationReference: applications.reference,
      })
      .from(emailOutbox)
      .leftJoin(applications, eq(emailOutbox.applicationId, applications.id))
      .where(where)
      .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(emailOutbox)
      .leftJoin(applications, eq(emailOutbox.applicationId, applications.id))
      .where(where),
  ]);
  const params = new URLSearchParams();
  for (const key of [
    "search",
    "status",
    "template",
    "dateFrom",
    "dateTo",
  ] as const)
    if (query[key]) params.set(key, query[key]!);
  params.set("pageSize", String(pageSize));
  const pageHref = (next: number) => {
    params.set("page", String(next));
    return `/admin/communications?${params.toString()}`;
  };
  return (
    <>
      <h1 className="page-heading">Communications</h1>
      <p className="mt-2 text-graphite">
        Transactional delivery state, approved copy and audited applicant
        messages.
      </p>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          <form className="surface grid gap-3 rounded-lg p-4 md:grid-cols-2 xl:grid-cols-[1fr_150px_210px_150px_150px_120px_110px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input
                name="search"
                defaultValue={query.search}
                placeholder="Recipient, reference or provider ID"
                className="h-11 bg-white pl-9"
              />
            </label>
            <select
              name="status"
              defaultValue={query.status ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All states</option>
              {emailOutbox.status.enumValues.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              name="template"
              defaultValue={query.template ?? ""}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">All templates</option>
              {templateKeys.map((key) => (
                <option key={key} value={key}>
                  {key.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <Input
              name="dateFrom"
              type="date"
              defaultValue={query.dateFrom}
              className="h-11 bg-white"
              aria-label="Created from"
            />
            <Input
              name="dateTo"
              type="date"
              defaultValue={query.dateTo}
              className="h-11 bg-white"
              aria-label="Created to"
            />
            <select
              name="pageSize"
              defaultValue={String(pageSize)}
              aria-label="Rows per page"
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>
            <Button className="h-11">Filter</Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>{total.value} matching email(s)</p>
            {filters.length ? (
              <Link href="/admin/communications" className="underline">
                Clear filters
              </Link>
            ) : null}
          </div>
          <div className="data-table-scroll mt-5 overflow-x-auto rounded-lg border bg-white">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map(({ email, applicationReference }) => (
                    <tr
                      key={email.id}
                      className="border-t align-top hover:bg-muted/40"
                    >
                      <td className="px-4 py-4">
                        <p>{email.recipientEmail}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {applicationReference ?? "No application"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {email.templateKey.replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border px-2 py-1 text-xs">
                          {email.status}
                        </span>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {email.attemptCount} attempt(s)
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-48 truncate font-mono text-xs">
                          {email.providerMessageId ?? "Pending provider ID"}
                        </p>
                        {email.lastErrorSummary ? (
                          <p className="mt-2 max-w-60 text-xs text-destructive">
                            {email.lastErrorSummary}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {formatInTimeZone(
                          email.createdAt,
                          "Asia/Colombo",
                          "dd MMM yyyy, HH:mm",
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {["failed", "cancelled"].includes(email.status) ? (
                          <form action={retryEmailAction}>
                            <input
                              type="hidden"
                              name="emailId"
                              value={email.id}
                            />
                            <Button size="sm" variant="outline">
                              Retry
                            </Button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="h-40 text-center text-muted-foreground"
                    >
                      No communications match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <nav
            className="mt-5 flex flex-wrap items-center justify-between gap-3"
            aria-label="Communication pagination"
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
        </div>
        <aside className="flex flex-col gap-5">
          <section className="glass-feature rounded-lg p-5">
            <Mail className="text-antique-gold" />
            <h2 className="mt-3 text-lg font-semibold">
              Send applicant message
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The application is resolved server-side from its official
              reference.
            </p>
            <form
              action={sendManualApplicantMessageAction}
              className="mt-4 flex flex-col gap-3"
            >
              <Input
                name="applicationReference"
                required
                placeholder="GBE-2026-000001"
                className="h-11 bg-white font-mono"
              />
              <Input
                name="subject"
                required
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
              <Button>Queue message</Button>
            </form>
          </section>
        </aside>
      </div>
      <section className="surface mt-7 rounded-lg p-6">
        <h2 className="section-title">Approved transactional templates</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Preview the effective copy. Super administrators can update copy
          without changing provider or security behaviour.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {templateKeys.map((key) => {
            const template = templates[key];
            return (
              <details key={key} className="rounded-lg border bg-white p-4">
                <summary className="cursor-pointer font-medium">
                  {key.replaceAll("_", " ")}
                </summary>
                <div className="mt-4 rounded-md bg-[#f8f6f1] p-4">
                  <p className="font-display text-xl font-semibold">
                    {template.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-graphite">
                    {template.message}
                  </p>
                  {template.actionLabel ? (
                    <span className="mt-3 inline-block rounded-md bg-ink px-3 py-2 text-xs text-white">
                      {template.actionLabel}
                    </span>
                  ) : null}
                </div>
                {hasPermission(membership, "settings.manage") ? (
                  <form
                    action={saveEmailTemplateAction}
                    className="mt-4 grid gap-3"
                  >
                    <input type="hidden" name="templateKey" value={key} />
                    <Input
                      name="title"
                      defaultValue={template.title}
                      required
                      maxLength={180}
                      className="h-10 bg-white"
                    />
                    <Textarea
                      name="message"
                      defaultValue={template.message}
                      required
                      maxLength={1000}
                      className="bg-white"
                    />
                    <Input
                      name="actionLabel"
                      defaultValue={template.actionLabel ?? ""}
                      maxLength={80}
                      placeholder="Action label (optional)"
                      className="h-10 bg-white"
                    />
                    <Button size="sm" variant="outline">
                      Save template copy
                    </Button>
                  </form>
                ) : null}
              </details>
            );
          })}
        </div>
      </section>
    </>
  );
}
