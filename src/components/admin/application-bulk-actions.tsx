"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ListChecks, Mail, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  bulkCommunicationTemplates,
  bulkStatusIssue,
  bulkStatusOptions,
  type BulkActionResult,
  type BulkPermissions,
  type BulkSelection,
  type BulkStatus,
} from "@/lib/domain/bulk-applications";
import { updateSelectedApplications } from "@/server/actions/application-bulk-update";

type Action = "status" | "assign" | "message";
const titles = {
  status: "Update status",
  assign: "Assign staff",
  message: "Send message",
};
const selectClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ApplicationBulkActions({
  selected,
  reviewers,
  permissions,
  exportUrl,
  onClear,
}: {
  selected: BulkSelection[];
  reviewers: Array<{ id: string; name: string }>;
  permissions: BulkPermissions;
  exportUrl: string;
  onClear: () => void;
}) {
  const router = useRouter();
  const toolbar = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<{
    action: Action;
    rows: BulkSelection[];
  } | null>(null);
  const [to, setTo] = useState<BulkStatus | "">("");
  const [reviewer, setReviewer] = useState("choose");
  const [template, setTemplate] =
    useState<keyof typeof bulkCommunicationTemplates>("review_update");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const [result, setResult] = useState<BulkActionResult | null>(null);
  const rows = dialog?.rows ?? [];
  const issues = to
    ? rows.flatMap((row) => {
        const issue = bulkStatusIssue(row, to);
        return issue ? [{ ...row, issue }] : [];
      })
    : [];
  const changed = to
    ? rows.filter((row) => row.workflowStatus !== to).length
    : 0;
  const deleted = rows.some((row) => row.deleted);
  const unavailable =
    deleted ||
    (dialog?.action === "status" &&
      (!to || issues.length > 0 || changed === 0)) ||
    (dialog?.action === "assign" && reviewer === "choose");

  function open(action: Action) {
    setResult(null);
    setTo("");
    setReviewer("choose");
    setTemplate("review_update");
    request.current = null;
    setDialog({ action, rows: [...selected] });
  }
  function close() {
    if (submitting.current) return;
    setDialog(null);
    if (result?.ok) {
      onClear();
      router.refresh();
    }
  }
  async function submit(form: FormData) {
    if (!dialog || submitting.current || unavailable) return;
    submitting.current = true;
    setPending(true);
    setResult(null);
    const payload = {
      selection: rows.map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
      ...(dialog.action === "status"
        ? {
            action: "status",
            to,
            reason: String(form.get("reason") ?? ""),
            applicantMessage: String(form.get("applicantMessage") ?? ""),
          }
        : dialog.action === "assign"
          ? { action: "assign", reviewerId: reviewer || null }
          : { action: "message", template }),
    };
    const signature = JSON.stringify(payload);
    if (request.current?.payload !== signature)
      request.current = { payload: signature, id: crypto.randomUUID() };
    try {
      const response = await updateSelectedApplications({
        ...payload,
        requestId: request.current.id,
      });
      setResult(response);
      if (response.ok && !response.warnings.length) {
        toast.success(response.message);
        setDialog(null);
        onClear();
        router.refresh();
      }
    } catch {
      setResult({
        ok: false,
        message:
          "Could not confirm the update. Retry safely, or refresh the list to check its result.",
      });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div
        ref={toolbar}
        tabIndex={-1}
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-background p-3 shadow-sm outline-none"
        role="region"
        aria-label="Selected application actions"
      >
        <strong className="mr-auto text-sm tabular-nums" aria-live="polite">
          {selected.length} selected
        </strong>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {permissions.status.length > 0 && (
            <Button className="min-h-11" onClick={() => open("status")}>
              <ListChecks data-icon="inline-start" />
              Update status
            </Button>
          )}
          {permissions.assign && (
            <Button
              className="min-h-11"
              variant="outline"
              onClick={() => open("assign")}
            >
              <UserRoundCheck data-icon="inline-start" />
              Assign
            </Button>
          )}
          {permissions.message && (
            <Button
              className="min-h-11"
              variant="outline"
              onClick={() => open("message")}
            >
              <Mail data-icon="inline-start" />
              Message
            </Button>
          )}
          {permissions.export && (
            <a
              className={buttonVariants({
                variant: "outline",
                className: "min-h-11",
              })}
              href={exportUrl}
            >
              <Download data-icon="inline-start" />
              Export
            </a>
          )}
        </div>
      </div>
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
          showCloseButton={!pending}
          finalFocus={toolbar}
        >
          <DialogHeader className="pr-6">
            <DialogTitle>
              {dialog ? titles[dialog.action] : "Selected nominations"}
            </DialogTitle>
            <DialogDescription>
              {rows.length} selected nomination{rows.length === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>
          {result?.ok ? (
            <>
              <p role="status">{result.message}</p>
              <p className="text-sm text-muted-foreground">
                Portal access needs attention for these nominations. Open each
                and retry the invitation.
              </p>
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {result.warnings.map((row) => (
                  <li key={row.id}>
                    <Link
                      className="text-primary underline underline-offset-4"
                      href={`/admin/applications/${row.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {row.reference ?? "Open nomination"}
                    </Link>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button onClick={close}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(new FormData(event.currentTarget));
              }}
              className="min-w-0 space-y-4"
              aria-busy={pending}
            >
              <fieldset disabled={pending} className="min-w-0 space-y-4">
                <details className="rounded-lg border px-3">
                  <summary className="cursor-pointer py-3 text-sm text-muted-foreground">
                    View selection
                  </summary>
                  <ul className="max-h-44 space-y-3 overflow-y-auto pb-3">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t pt-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">
                            {row.reference ?? "No reference"}
                          </p>
                          <p className="break-words text-sm [overflow-wrap:anywhere]">
                            {row.nomineeName}
                          </p>
                        </div>
                        <StatusBadge status={row.workflowStatus} />
                      </li>
                    ))}
                  </ul>
                </details>
                <FieldGroup>
                  {dialog?.action === "status" && (
                    <>
                      <Field>
                        <FieldLabel htmlFor="bulk-status">
                          New status
                        </FieldLabel>
                        <select
                          id="bulk-status"
                          value={to}
                          onChange={(event) => {
                            const next = bulkStatusOptions.find(
                              (option) => option.value === event.target.value,
                            );
                            setTo(next?.value ?? "");
                            setResult(null);
                          }}
                          className={selectClass}
                          required
                        >
                          <option value="">Choose status</option>
                          {bulkStatusOptions
                            .filter((option) =>
                              permissions.status.includes(option.value),
                            )
                            .map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                        </select>
                      </Field>
                      {to && issues.length > 0 && (
                        <div
                          role="alert"
                          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                        >
                          <p className="font-medium">
                            {issues.length} cannot use this status. Nothing will
                            change.
                          </p>
                          <ul className="mt-2 max-h-32 space-y-2 overflow-y-auto text-xs">
                            {issues.map((row) => (
                              <li key={row.id}>
                                <span className="font-medium">
                                  {row.reference ?? row.nomineeName}
                                </span>
                                : {row.issue}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs">
                            Choose another status or adjust your selection.
                          </p>
                        </div>
                      )}
                      {to && !issues.length && (
                        <p className="text-sm text-muted-foreground">
                          {changed
                            ? `${changed} will change${changed < rows.length ? `; ${rows.length - changed} already have this status` : ""}.`
                            : "All selected nominations already have this status."}
                        </p>
                      )}
                      {to && ["rejected", "archived"].includes(to) && (
                        <Field>
                          <FieldLabel htmlFor="bulk-reason">
                            Internal reason
                          </FieldLabel>
                          <Textarea
                            id="bulk-reason"
                            name="reason"
                            required
                            minLength={8}
                            maxLength={1000}
                            rows={3}
                            placeholder="Why are you making this change?"
                          />
                        </Field>
                      )}
                      {to && (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {to === "approved"
                              ? "Approval notifies nominees and prepares their portal access."
                              : [
                                    "shortlisted",
                                    "winner",
                                    "not_selected",
                                  ].includes(to)
                                ? "Outcome emails follow each cycle's results release date."
                                : "Nominees receive the status update by email."}
                          </p>
                          <details>
                            <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
                              Add a message (optional)
                            </summary>
                            <Field className="mt-2">
                              <FieldLabel
                                htmlFor="bulk-applicant-message"
                                className="sr-only"
                              >
                                Message to nominees
                              </FieldLabel>
                              <Textarea
                                id="bulk-applicant-message"
                                name="applicantMessage"
                                maxLength={2000}
                                rows={3}
                                placeholder="Included in every selected nominee's update"
                              />
                            </Field>
                          </details>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Request corrections from an individual nomination.
                      </p>
                    </>
                  )}
                  {dialog?.action === "assign" && (
                    <Field>
                      <FieldLabel htmlFor="bulk-reviewer">
                        Staff member
                      </FieldLabel>
                      <select
                        id="bulk-reviewer"
                        value={reviewer}
                        onChange={(event) => setReviewer(event.target.value)}
                        className={selectClass}
                      >
                        <option value="choose" disabled>
                          Choose staff member
                        </option>
                        <option value="">Unassigned</option>
                        {reviewers.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {dialog?.action === "message" && (
                    <>
                      <Field>
                        <FieldLabel htmlFor="bulk-template">Message</FieldLabel>
                        <select
                          id="bulk-template"
                          value={template}
                          onChange={(event) =>
                            setTemplate(
                              event.target.value === "deadline_reminder"
                                ? "deadline_reminder"
                                : "review_update",
                            )
                          }
                          className={selectClass}
                        >
                          {Object.entries(bulkCommunicationTemplates).map(
                            ([key, value]) => (
                              <option key={key} value={key}>
                                {value.label}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                      <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
                        <p className="font-medium">
                          {bulkCommunicationTemplates[template].subject}
                        </p>
                        <p className="text-muted-foreground">
                          {bulkCommunicationTemplates[template].body}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sends one email and portal message per selected
                        nomination.
                      </p>
                    </>
                  )}
                </FieldGroup>
              </fieldset>
              {deleted && (
                <p role="alert" className="text-sm text-destructive">
                  Restore deleted nominations before updating them.
                </p>
              )}
              {result && !result.ok && (
                <div
                  role="alert"
                  className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                >
                  <p>{result.message}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setDialog(null);
                      onClear();
                      router.refresh();
                    }}
                  >
                    Refresh list
                  </Button>
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pending || unavailable}
                  variant={
                    to === "rejected" || to === "withdrawn"
                      ? "destructive"
                      : "default"
                  }
                  className="min-h-11"
                >
                  {pending && (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  )}
                  {pending
                    ? "Saving..."
                    : dialog?.action === "status"
                      ? "Confirm update"
                      : dialog?.action === "assign"
                        ? "Confirm assignment"
                        : "Send message"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
