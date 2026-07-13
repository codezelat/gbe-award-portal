import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Send } from "lucide-react";
import { requirePortalSession } from "@/server/dal/auth";
import { getDb } from "@/lib/db";
import { applicationMessages, applications } from "@/lib/db/schema";
import { sendApplicantMessageAction } from "@/server/actions/applicant-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getFeatureFlags } from "@/server/services/feature-flags";
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string }>;
}) {
  const { applicationId } = await searchParams;
  const { profile } = await requirePortalSession();
  const [flags, owned] = await Promise.all([
    getFeatureFlags(),
    getDb()
      .select()
      .from(applications)
      .where(eq(applications.ownerProfileId, profile.id))
      .orderBy(desc(applications.lastActivityAt)),
  ]);
  const selected = owned.find((item) => item.id === applicationId) ?? owned[0];
  const messages = selected
    ? await getDb()
        .select()
        .from(applicationMessages)
        .where(
          and(
            eq(applicationMessages.applicationId, selected.id),
            eq(applicationMessages.visibility, "applicant"),
          ),
        )
        .orderBy(asc(applicationMessages.createdAt))
    : [];
  return (
    <>
      <h1 className="page-heading">Messages</h1>
      <p className="mt-2 text-graphite">
        Official correspondence with the GBE Awards team.
      </p>
      {owned.length > 1 ? (
        <nav
          aria-label="Choose application messages"
          className="mt-5 flex flex-wrap gap-2"
        >
          {owned.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={item.id === selected?.id ? "default" : "outline"}
              render={
                <Link href={`/portal/messages?applicationId=${item.id}`} />
              }
            >
              {item.reference}
            </Button>
          ))}
        </nav>
      ) : null}
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface rounded-lg p-6">
          <h2 className="section-title">
            {selected?.reference ?? "No linked application"}
          </h2>
          <div className="mt-5 flex flex-col gap-4">
            {messages.length ? (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[85%] rounded-lg p-4 ${message.senderType === "applicant" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {message.body}
                  </p>
                  <time className="mt-2 block text-xs opacity-70">
                    {formatInTimeZone(
                      message.createdAt,
                      "Asia/Colombo",
                      "dd MMM yyyy, HH:mm",
                    )}
                  </time>
                </article>
              ))
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No messages have been sent for this application.
              </p>
            )}
          </div>
        </section>
        <section className="glass-feature h-fit rounded-lg p-5">
          <h2 className="text-lg font-semibold">Send a message</h2>
          {selected && flags.applicant_messages_enabled ? (
            <form
              action={sendApplicantMessageAction}
              className="mt-4 flex flex-col gap-3"
            >
              <input type="hidden" name="applicationId" value={selected.id} />
              <Input
                name="subject"
                maxLength={160}
                placeholder="Subject (optional)"
                className="h-11 bg-white"
              />
              <Textarea
                name="body"
                required
                minLength={2}
                maxLength={4000}
                placeholder="Write your message"
                className="min-h-40 bg-white"
              />
              <Button>
                <Send data-icon="inline-start" />
                Send securely
              </Button>
            </form>
          ) : selected ? (
            <p className="mt-4 text-sm text-muted-foreground">
              New applicant messages are temporarily disabled. Existing
              correspondence remains available.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              An approved application must be linked before messaging is
              available.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
